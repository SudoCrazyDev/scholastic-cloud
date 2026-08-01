<?php

namespace App\Services\Tala\Attachments;

use Illuminate\Support\Facades\Log;
use Smalot\PdfParser\Config;
use Smalot\PdfParser\Document;
use Smalot\PdfParser\Page;
use Smalot\PdfParser\Parser;
use Smalot\PdfParser\PDFObject;
use Throwable;

/**
 * Opening a PDF that is too large to hand a provider whole, and getting out of
 * it the part worth sending.
 *
 * A lesson PDF is one of two things in practice, and they need opposite
 * treatment:
 *
 *   **Exported from slides or a word processor.** It has a text layer. The
 *   megabytes are photographs, but the teaching content is text, and extracting
 *   it turns a 30 MB upload into a few kilobytes. Diagrams are lost — which is
 *   why AttachmentReader still sends smaller PDFs natively, and only falls back
 *   to this when the file is too big to send.
 *
 *   **Scanned or photographed.** There is no text layer at all: every page is
 *   one embedded image. Extraction returns nothing, so the pages themselves are
 *   sent as images and the model reads them the way a person reads a photocopy.
 *
 * Which one it is cannot be known from the filename or the size, so it is
 * measured: characters recovered per page.
 *
 * A low count is not proof of scanning, and the failure messages are careful not
 * to claim it is. It can also mean a nearly empty PDF, or one whose text this
 * parser cannot decode. What the count actually establishes is narrower: that
 * there is not enough text here to answer from, so the pages are worth trying.
 * If they yield nothing either, the honest report is that the file could not be
 * read — not a guess at why.
 *
 * The file is parsed twice in the scanned case, once without image content and
 * once with. That is deliberate. Retaining every embedded image costs about five
 * times the file size in memory, and paying it before knowing whether the text
 * layer makes it unnecessary would be the expensive way round. Two passes over a
 * 30 MB file measured at a fifth of a second.
 *
 * Nothing here throws. Every failure is a sentence a teacher can act on.
 */
class PdfReader
{
    /**
     * Read what can be read.
     *
     * @param  array<int, string>  $supportedImageTypes  Image media types the answering provider accepts.
     *                                                   Empty means the scanned route is unavailable and a
     *                                                   file without a text layer cannot be read at all.
     */
    public function read(string $bytes, array $supportedImageTypes): PdfExtract
    {
        if (! class_exists(Parser::class)) {
            // Only reachable if the deploy's vendor directory is stale — the
            // composer cache key is composer.lock, so a missed install is
            // possible and silent otherwise.
            Log::error('Tala: smalot/pdfparser is missing, so large PDFs cannot be read');

            return PdfExtract::failed('the server cannot open PDFs at the moment');
        }

        $document = $this->parse($bytes, withImages: false);

        if ($document === null) {
            return PdfExtract::failed(
                'the file could not be opened as a PDF — it may be damaged, or password-protected'
            );
        }

        try {
            $pages = $document->getPages();
            $text = $this->tidy($document->getText());
        } catch (Throwable $e) {
            Log::warning('Tala: failed to read text from a PDF', ['error' => $e->getMessage()]);
            $pages = [];
            $text = '';
        }

        $pageCount = count($pages);

        if ($this->looksLikeText($text, $pageCount)) {
            return $this->asText($text, $pageCount);
        }

        // No text layer. Unset before the second parse so the first document's
        // objects are not held alongside the second's.
        unset($document, $pages);

        if ($supportedImageTypes === []) {
            return PdfExtract::failed(
                'no readable text could be got out of it, and the AI model this school uses '
                .'cannot read images, so its pages cannot be read either',
                $pageCount,
            );
        }

        return $this->asPageImages($bytes, $pageCount, $supportedImageTypes);
    }

    private function parse(string $bytes, bool $withImages): ?Document
    {
        $config = new Config;
        $config->setRetainImageContent($withImages);

        try {
            return (new Parser([], $config))->parseContent($bytes);
        } catch (Throwable $e) {
            Log::warning('Tala: could not parse a PDF', [
                'with_images' => $withImages,
                'error' => $e->getMessage(),
            ]);

            return null;
        }
    }

    /**
     * Enough text per page to be worth sending as text?
     *
     * Measured per page rather than in total, so that a 60-page scan with one
     * typed cover sheet is still treated as scans.
     */
    private function looksLikeText(string $text, int $pageCount): bool
    {
        if ($pageCount < 1 || $text === '') {
            return false;
        }

        $perPage = (int) config('tala.attachments.pdf_text_chars_per_page', 60);

        return intdiv(mb_strlen($text), $pageCount) >= $perPage;
    }

    private function asText(string $text, int $pageCount): PdfExtract
    {
        $limit = (int) config('tala.attachments.max_pdf_text_chars', 40000);

        if (mb_strlen($text) <= $limit) {
            return PdfExtract::fromText($text, $pageCount, truncated: false);
        }

        $cut = mb_substr($text, 0, $limit);

        // Prefer a line break near the end so the text does not stop mid-word,
        // but only if one is close — otherwise the cut is honest as it is.
        $lastBreak = mb_strrpos($cut, "\n");

        if ($lastBreak !== false && $lastBreak > $limit - 500) {
            $cut = mb_substr($cut, 0, $lastBreak);
        }

        return PdfExtract::fromText($cut, $pageCount, truncated: true);
    }

    /**
     * @param  array<int, string>  $supported
     */
    private function asPageImages(string $bytes, int $pageCount, array $supported): PdfExtract
    {
        $document = $this->parse($bytes, withImages: true);

        if ($document === null) {
            return PdfExtract::failed(
                'it is a scanned PDF and its pages could not be read as images',
                $pageCount,
            );
        }

        try {
            $pages = $document->getPages();
        } catch (Throwable $e) {
            Log::warning('Tala: could not list PDF pages', ['error' => $e->getMessage()]);

            return PdfExtract::failed('it is a scanned PDF whose pages could not be listed', $pageCount);
        }

        $maxPages = max(1, (int) config('tala.attachments.max_pdf_pages', 8));

        $images = [];
        $unreadable = [];

        foreach ($pages as $index => $page) {
            if (count($images) >= $maxPages) {
                break;
            }

            $image = $this->pageImage($page, $supported, $unreadable);

            if ($image !== null) {
                $images[] = ['page' => $index + 1] + $image;
            }
        }

        if ($images === []) {
            return PdfExtract::failed(
                $unreadable === []
                    // No text and no images. Saying "it is scanned" here would be
                    // a guess: an almost-empty PDF looks the same from outside.
                    ? 'no readable text and no page images could be found in it, so there is '
                        .'nothing to work from. Re-exporting it from the original file may help'
                    : 'its pages are stored in a format that cannot be read here ('
                        .implode(', ', array_unique($unreadable)).'). '
                        .'A PDF exported from the original file, rather than scanned, would work',
                $pageCount,
            );
        }

        $note = count($images) < $pageCount
            ? sprintf(
                'pages %d–%d of %d were read; the rest were not',
                $images[0]['page'],
                $images[count($images) - 1]['page'],
                $pageCount,
            )
            : null;

        return PdfExtract::fromPages($images, $pageCount, $note);
    }

    /**
     * The largest readable image on a page, which for a scan is the page itself.
     *
     * @param  array<int, string>  $supported
     * @param  array<int, string>  $unreadable  Collects the formats that had to be passed over.
     * @return array{media_type: string, bytes: string, width: int|null, height: int|null}|null
     */
    private function pageImage(Page $page, array $supported, array &$unreadable): ?array
    {
        try {
            $xobjects = $page->getXObjects();
        } catch (Throwable) {
            return null;
        }

        $best = null;
        // getXObjects() lists each object twice, once under its resource name
        // and once under its index, so the same image would otherwise be
        // considered twice.
        $seen = [];

        foreach ($xobjects as $xobject) {
            if (! $xobject instanceof PDFObject || isset($seen[spl_object_id($xobject)])) {
                continue;
            }

            $seen[spl_object_id($xobject)] = true;

            $candidate = $this->convert($xobject, $supported, $unreadable);

            if ($candidate !== null && ($best === null || strlen($candidate['bytes']) > strlen($best['bytes']))) {
                $best = $candidate;
            }
        }

        return $best;
    }

    /**
     * Turn one image XObject into something a provider will accept.
     *
     * @param  array<int, string>  $supported
     * @param  array<int, string>  $unreadable
     * @return array{media_type: string, bytes: string, width: int|null, height: int|null}|null
     */
    private function convert(PDFObject $xobject, array $supported, array &$unreadable): ?array
    {
        try {
            $details = $xobject->getHeader()->getDetails(false);
        } catch (Throwable) {
            return null;
        }

        if ($this->stringify($details['Subtype'] ?? null) !== 'Image') {
            return null;
        }

        $filter = $this->stringify($details['Filter'] ?? null);
        $width = isset($details['Width']) ? (int) $details['Width'] : null;
        $height = isset($details['Height']) ? (int) $details['Height'] : null;
        $content = (string) $xobject->getContent();

        if ($content === '') {
            return null;
        }

        /*
         * A DCTDecode stream is a JPEG already — the PDF stores the scanner's
         * own file verbatim, so it passes straight through. This is the case
         * that matters: it is what almost every scanner and phone produces.
         */
        if (str_contains($filter, 'DCTDecode') && in_array('image/jpeg', $supported, true)) {
            return $this->isJpeg($content)
                ? ['media_type' => 'image/jpeg', 'bytes' => $content, 'width' => $width, 'height' => $height]
                : null;
        }

        /*
         * Otherwise it may be a raw bitmap that the parser has already inflated.
         * That is checkable rather than assumable: raw 8-bit pixels are exactly
         * width × height × components bytes. If the length does not match, the
         * bytes are something else — a filter still applied, a colour space not
         * handled here — and the page is passed over rather than sent garbled.
         */
        $components = match ($this->stringify($details['ColorSpace'] ?? null)) {
            'DeviceRGB' => 3,
            'DeviceGray' => 1,
            default => null,
        };

        $bits = isset($details['BitsPerComponent']) ? (int) $details['BitsPerComponent'] : 0;

        if ($components !== null && $bits === 8 && $width !== null && $height !== null
            && in_array('image/png', $supported, true)) {
            $png = Png::fromPixels($content, $width, $height, $components);

            if ($png !== null) {
                return ['media_type' => 'image/png', 'bytes' => $png, 'width' => $width, 'height' => $height];
            }
        }

        $unreadable[] = $filter !== '' ? $filter : 'an unnamed format';

        return null;
    }

    private function isJpeg(string $bytes): bool
    {
        return str_starts_with($bytes, "\xff\xd8\xff");
    }

    /**
     * PDF dictionary values arrive as scalars, objects, or arrays of either.
     */
    private function stringify(mixed $value): string
    {
        if (is_array($value)) {
            return implode('+', array_map(fn ($item) => $this->stringify($item), $value));
        }

        if ($value === null) {
            return '';
        }

        if (is_object($value)) {
            return method_exists($value, '__toString') ? trim((string) $value) : '';
        }

        return trim((string) $value);
    }

    /**
     * Collapse the runs of blank lines that page-by-page extraction leaves, so
     * the character budget is spent on content.
     */
    private function tidy(string $text): string
    {
        $text = str_replace("\r\n", "\n", $text);
        $text = preg_replace('/[ \t]+/', ' ', $text) ?? $text;
        $text = preg_replace('/\n{3,}/', "\n\n", $text) ?? $text;

        return trim($text);
    }
}
