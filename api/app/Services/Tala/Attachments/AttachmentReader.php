<?php

namespace App\Services\Tala\Attachments;

use App\Models\Topic;
use App\Support\MediaUrl;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Throwable;

/**
 * Loading a lesson's uploaded files so a model can read them.
 *
 * The whole point of this class is that the file's **content** goes to the
 * provider and its **location** does not. Lesson attachments live in a private
 * R2 bucket behind signed links; handing a model the URL would put a working
 * credential for student-visible material into a third party's logs. So the
 * bytes are fetched server-side and inlined.
 *
 * Three kinds of check, in this order, because each is cheaper than the next:
 *
 *   1. **Is it worth fetching?** Extension and recorded MIME first, then the
 *      stored object's size — no point pulling an 80 MB video out of R2 to
 *      discover nobody can read it.
 *   2. **Is it what it claims?** The MIME on the block was supplied by the
 *      browser at upload time. The fetched bytes are sniffed with `finfo` and
 *      the sniffed type wins, so a mislabelled file is refused rather than sent
 *      under the wrong content type.
 *   3. **Does it fit?** Per-file and per-turn byte budgets, a file count, and an
 *      image edge limit. There is no GD or Imagick on these servers, so an
 *      oversized image cannot be downscaled — it is refused with a reason the
 *      teacher can act on.
 *
 * A PDF over the send limit is the one case that does not end in a refusal. It
 * is opened here instead and only the useful part is sent — the text layer if it
 * has one, its pages as images if it is a scan. See PdfReader. That route exists
 * because a lesson PDF is routinely tens of megabytes, and a teacher who cannot
 * use a file they uploaded is not being served by a tidy error message.
 *
 * Nothing here throws. A file that cannot be read becomes a skip with an
 * explanation, because a broken upload in a lesson should degrade one answer,
 * not end the turn.
 */
class AttachmentReader
{
    /** What Anthropic accepts as an image. */
    private const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

    private const PDF_TYPE = 'application/pdf';

    public function __construct(private readonly PdfReader $pdf = new PdfReader) {}

    /**
     * Load the readable files attached to a lesson.
     *
     * @param  string|null  $wanted  A filename, or part of one, to narrow to.
     * @param  array<int, string>  $supported  Media types the answering provider can read, from
     *                                         ChatProvider::supportsAttachment(). Both current
     *                                         providers read images and PDFs; the list exists so
     *                                         that a model which cannot is told rather than sent
     *                                         a request that fails mid-answer.
     */
    public function forLesson(Topic $lesson, ?string $wanted, array $supported): AttachmentBatch
    {
        $blocks = is_array($lesson->content) ? $lesson->content : [];

        $attachments = [];
        $skipped = [];
        $texts = [];
        $spent = 0;

        // Counted separately from $attachments, because one scanned PDF can
        // produce several page images and should still spend one file's worth of
        // the teacher's budget.
        $filesRead = 0;

        $maxFiles = (int) config('tala.attachments.max_files_per_turn', 4);
        $maxTotal = (int) config('tala.attachments.max_total_bytes', 12 * 1024 * 1024);

        foreach ($blocks as $block) {
            if (! is_array($block) || ($block['type'] ?? null) !== 'file') {
                continue;
            }

            $name = is_string($block['name'] ?? null) ? trim($block['name']) : '';

            if ($name === '') {
                // A block with no filename is a broken upload; there is nothing
                // to tell the teacher about it either.
                continue;
            }

            if ($wanted !== null && ! $this->matches($name, $wanted)) {
                continue;
            }

            if ($filesRead >= $maxFiles) {
                $skipped[] = ['name' => $name, 'reason' => 'not loaded — only '.$maxFiles.' files can be read in one message'];

                continue;
            }

            $kind = $this->kindFor($name, is_string($block['mime'] ?? null) ? $block['mime'] : null);

            if ($kind === null) {
                $skipped[] = [
                    'name' => $name,
                    'reason' => 'not a file type that can be read — only images and PDFs can be',
                ];

                continue;
            }

            $path = MediaUrl::clean($block['path'] ?? null) ?? MediaUrl::pathFrom($block['url'] ?? null);

            if ($path === null) {
                $skipped[] = ['name' => $name, 'reason' => 'the stored file could not be located'];

                continue;
            }

            // Checked before downloading: opening a PDF costs several times its
            // size in memory, and this server is shared between two schools.
            $ceiling = $this->fetchCeiling($kind);
            $stored = $this->sizeOf($path);

            if ($stored !== null && $stored > $ceiling) {
                $skipped[] = [
                    'name' => $name,
                    'reason' => $this->tooLarge($kind, $stored, $ceiling),
                ];

                continue;
            }

            $bytes = $this->fetch($path);

            if ($bytes === null || $bytes === '') {
                $skipped[] = ['name' => $name, 'reason' => 'the file could not be downloaded'];

                continue;
            }

            // The sniffed type wins over the recorded one.
            $mediaType = $this->sniff($bytes) ?? $this->typeFromName($name);

            if ($mediaType === null || $this->kindForType($mediaType) === null) {
                $skipped[] = [
                    'name' => $name,
                    'reason' => 'the file is not really an image or a PDF, whatever its name says',
                ];

                continue;
            }

            $kind = $this->kindForType($mediaType);

            if (strlen($bytes) > $this->fetchCeiling($kind)) {
                // The stored size was unavailable or lied; caught here instead.
                $skipped[] = [
                    'name' => $name,
                    'reason' => $this->tooLarge($kind, strlen($bytes), $this->fetchCeiling($kind)),
                ];

                continue;
            }

            if ($kind === LessonAttachment::KIND_PDF) {
                $outcome = $this->readPdf($name, $bytes, $supported, $spent, $maxTotal);

                foreach ($outcome['attachments'] as $attachment) {
                    $attachments[] = $attachment;
                    $spent += $attachment->byteSize();
                }

                if ($outcome['text'] !== null) {
                    $texts[] = $outcome['text'];
                }

                foreach ($outcome['skipped'] as $skip) {
                    $skipped[] = $skip;
                }

                if ($outcome['attachments'] !== [] || $outcome['text'] !== null) {
                    $filesRead++;
                }

                continue;
            }

            if (! in_array($mediaType, $supported, true)) {
                $skipped[] = [
                    'name' => $name,
                    'reason' => 'the AI model this school uses cannot read '.$mediaType.' files',
                ];

                continue;
            }

            $image = $this->asImage($name, $bytes, $mediaType, $spent, $maxTotal);

            if (isset($image['reason'])) {
                $skipped[] = ['name' => $name, 'reason' => $image['reason']];

                continue;
            }

            $attachments[] = $image['attachment'];
            $spent += strlen($bytes);
            $filesRead++;
        }

        return new AttachmentBatch($attachments, $skipped, $texts);
    }

    /**
     * A PDF, by whichever route it can actually be read.
     *
     * Sending the file whole is preferred and tried first: the model then sees
     * the diagrams, the tables and the layout, not just the words. Only when the
     * file is too big for that — or the provider cannot take PDFs at all — is it
     * opened here and reduced.
     *
     * @param  array<int, string>  $supported
     * @return array{attachments: array<int, LessonAttachment>, text: array{name: string, pages: int, truncated: bool, note: string, text: string}|null, skipped: array<int, array{name: string, reason: string}>}
     */
    private function readPdf(
        string $name,
        string $bytes,
        array $supported,
        int $spent,
        int $maxTotal,
    ): array {
        $size = strlen($bytes);
        $sendLimit = (int) config('tala.attachments.max_pdf_bytes', 10 * 1024 * 1024);

        if (in_array(self::PDF_TYPE, $supported, true) && $size <= $sendLimit) {
            if ($spent + $size > $maxTotal) {
                return [
                    'attachments' => [],
                    'text' => null,
                    'skipped' => [[
                        'name' => $name,
                        'reason' => 'not loaded — the total size of files in one message is capped at '
                            .$this->megabytes($maxTotal),
                    ]],
                ];
            }

            return [
                'attachments' => [new LessonAttachment(
                    name: $name,
                    mediaType: self::PDF_TYPE,
                    kind: LessonAttachment::KIND_PDF,
                    bytes: $bytes,
                )],
                'text' => null,
                'skipped' => [],
            ];
        }

        $extract = $this->pdf->read($bytes, $this->imageTypesIn($supported));

        if ($extract->hasText()) {
            return [
                'attachments' => [],
                'text' => [
                    'name' => $name,
                    'pages' => $extract->pageCount,
                    'truncated' => $extract->textTruncated,
                    'note' => sprintf(
                        'This file is %s, too large to send whole, so its written text was '
                        .'extracted instead (%d %s).%s Diagrams, photographs and tables in it '
                        .'were NOT read — do not describe them.',
                        $this->megabytes($size),
                        $extract->pageCount,
                        $extract->pageCount === 1 ? 'page' : 'pages',
                        $extract->textTruncated
                            ? ' The text was cut off at the length limit, so the later pages are missing.'
                            : '',
                    ),
                    'text' => (string) $extract->text,
                ],
                'skipped' => [],
            ];
        }

        if ($extract->hasPages()) {
            return $this->asPageImages($name, $extract, $spent, $maxTotal);
        }

        return [
            'attachments' => [],
            'text' => null,
            'skipped' => [[
                'name' => $name,
                'reason' => sprintf('%s (%s)', $extract->failure, $this->megabytes($size)),
            ]],
        ];
    }

    /**
     * Pages of a scan, as images, within the same budgets an uploaded image gets.
     *
     * @return array{attachments: array<int, LessonAttachment>, text: null, skipped: array<int, array{name: string, reason: string}>}
     */
    private function asPageImages(string $name, PdfExtract $extract, int $spent, int $maxTotal): array
    {
        $attachments = [];
        $stoppedAt = null;

        foreach ($extract->pageImages as $page) {
            $label = sprintf('%s (page %d)', $name, $page['page']);

            $image = $this->asImage(
                $label,
                $page['bytes'],
                $page['media_type'],
                $spent,
                $maxTotal,
                $page['width'],
                $page['height'],
            );

            if (isset($image['reason'])) {
                // The first page that does not fit ends the run: later pages are
                // no smaller, and half a document read out of order is worse
                // than a clear statement of where it stopped.
                $stoppedAt = ['page' => $page['page'], 'reason' => $image['reason']];

                break;
            }

            $attachments[] = new LessonAttachment(
                name: $label,
                mediaType: $page['media_type'],
                kind: LessonAttachment::KIND_IMAGE,
                bytes: $page['bytes'],
                width: $page['width'],
                height: $page['height'],
                sourceName: $name,
            );

            $spent += strlen($page['bytes']);
        }

        if ($attachments === []) {
            return [
                'attachments' => [],
                'text' => null,
                'skipped' => [[
                    'name' => $name,
                    'reason' => 'it is a scanned PDF and not even its first page would fit — '
                        .($stoppedAt['reason'] ?? 'no page could be read'),
                ]],
            ];
        }

        // Whatever was left unread is stated rather than passed over, so the
        // model can tell the teacher which pages it worked from.
        $unread = array_filter([
            $stoppedAt !== null
                ? sprintf('stopped at page %d — %s', $stoppedAt['page'], $stoppedAt['reason'])
                : null,
            $stoppedAt === null ? $extract->pagesNote : null,
        ]);

        return [
            'attachments' => $attachments,
            'text' => null,
            'skipped' => $unread === [] ? [] : [[
                'name' => $name.' — pages not read',
                'reason' => sprintf(
                    'it is a scanned PDF of %d pages, read as page images: %s',
                    $extract->pageCount,
                    implode('; ', $unread),
                ),
            ]],
        ];
    }

    /**
     * One image, against the per-file, per-turn and pixel-dimension caps.
     *
     * @return array{attachment: LessonAttachment}|array{reason: string}
     */
    private function asImage(
        string $name,
        string $bytes,
        string $mediaType,
        int $spent,
        int $maxTotal,
        ?int $width = null,
        ?int $height = null,
    ): array {
        $limit = (int) config('tala.attachments.max_image_bytes', 4 * 1024 * 1024);

        if (strlen($bytes) > $limit) {
            return ['reason' => sprintf(
                'too large to read (%s; the limit for images is %s)',
                $this->megabytes(strlen($bytes)),
                $this->megabytes($limit),
            )];
        }

        if ($spent + strlen($bytes) > $maxTotal) {
            return ['reason' => 'not loaded — the total size of files in one message is capped at '
                .$this->megabytes($maxTotal)];
        }

        if ($width === null) {
            [$width, $height] = $this->dimensions($bytes);
        }

        $edge = (int) config('tala.attachments.max_image_edge', 8000);

        if ($width !== null && max($width, (int) $height) > $edge) {
            return ['reason' => sprintf(
                'too big to read (%d×%d; the longest side must be under %dpx). '
                .'Re-save it smaller and upload it again.',
                $width,
                $height,
                $edge,
            )];
        }

        return ['attachment' => new LessonAttachment(
            name: $name,
            mediaType: $mediaType,
            kind: LessonAttachment::KIND_IMAGE,
            bytes: $bytes,
            width: $width,
            height: $height,
        )];
    }

    /**
     * The most this server will pull out of R2 and hold for one file.
     *
     * Larger than what may be *sent*, for PDFs only: an oversized PDF still has
     * a readable text layer or readable pages inside it, so it is worth opening.
     * An oversized image has nothing to extract and cannot be downscaled without
     * GD, so its ceiling stays where it is.
     */
    private function fetchCeiling(string $kind): int
    {
        return $kind === LessonAttachment::KIND_PDF
            ? (int) config('tala.attachments.max_pdf_fetch_bytes', 40 * 1024 * 1024)
            : (int) config('tala.attachments.max_image_bytes', 4 * 1024 * 1024);
    }

    /**
     * @param  array<int, string>  $supported
     * @return array<int, string>
     */
    private function imageTypesIn(array $supported): array
    {
        return array_values(array_intersect($supported, self::IMAGE_TYPES));
    }

    /**
     * The stored object's size, without downloading it.
     */
    private function sizeOf(string $path): ?int
    {
        try {
            $size = Storage::disk('r2')->size($path);
        } catch (Throwable) {
            // Not worth logging: the download that follows will report the
            // real problem.
            return null;
        }

        return is_int($size) && $size > 0 ? $size : null;
    }

    /**
     * Filenames a lesson holds, without downloading any of them.
     *
     * Used to tell the model what is there before it decides to spend a turn's
     * budget reading something.
     *
     * @return array<int, array<string, mixed>>
     */
    public function inventory(Topic $lesson): array
    {
        $files = [];

        foreach (is_array($lesson->content) ? $lesson->content : [] as $block) {
            if (! is_array($block) || ($block['type'] ?? null) !== 'file') {
                continue;
            }

            $name = is_string($block['name'] ?? null) ? trim($block['name']) : '';

            if ($name === '') {
                continue;
            }

            $kind = $this->kindFor($name, is_string($block['mime'] ?? null) ? $block['mime'] : null);

            $files[] = [
                'name' => $name,
                'readable' => $kind !== null,
            ];
        }

        return $files;
    }

    /**
     * Filenames in this lesson that the answering model could actually read.
     *
     * Type-guess only — nothing is downloaded. Used by ProposeAssessmentTool to
     * decide whether an assessment claiming to be based on a lesson is missing
     * material the model never opened.
     *
     * @param  array<int, string>  $supported
     * @return array<int, string>
     */
    public function readableNames(Topic $lesson, array $supported): array
    {
        $names = [];

        foreach (is_array($lesson->content) ? $lesson->content : [] as $block) {
            if (! is_array($block) || ($block['type'] ?? null) !== 'file') {
                continue;
            }

            $name = is_string($block['name'] ?? null) ? trim($block['name']) : '';

            if ($name === '') {
                continue;
            }

            $recorded = is_string($block['mime'] ?? null) ? mb_strtolower(trim($block['mime'])) : null;
            $guess = $recorded !== null && $this->kindForType($recorded) !== null
                ? $recorded
                : $this->typeFromName($name);

            if ($guess === null) {
                continue;
            }

            // A PDF counts regardless of what the provider accepts: if it cannot
            // be sent, its text or its pages can be. An image has no such
            // fallback, so it counts only if the model can actually see it.
            if ($guess === self::PDF_TYPE || in_array($guess, $supported, true)) {
                $names[] = $name;
            }
        }

        return $names;
    }

    private function matches(string $name, string $wanted): bool
    {
        return str_contains(mb_strtolower($name), mb_strtolower(trim($wanted)));
    }

    /**
     * A cheap first guess, from the name and the MIME recorded at upload.
     */
    private function kindFor(string $name, ?string $recordedMime): ?string
    {
        if ($recordedMime !== null && ($kind = $this->kindForType(mb_strtolower(trim($recordedMime)))) !== null) {
            return $kind;
        }

        $type = $this->typeFromName($name);

        return $type === null ? null : $this->kindForType($type);
    }

    private function kindForType(string $mediaType): ?string
    {
        if ($mediaType === self::PDF_TYPE) {
            return LessonAttachment::KIND_PDF;
        }

        return in_array($mediaType, self::IMAGE_TYPES, true) ? LessonAttachment::KIND_IMAGE : null;
    }

    private function typeFromName(string $name): ?string
    {
        return match (mb_strtolower(pathinfo($name, PATHINFO_EXTENSION))) {
            'pdf' => self::PDF_TYPE,
            'png' => 'image/png',
            'jpg', 'jpeg' => 'image/jpeg',
            'gif' => 'image/gif',
            'webp' => 'image/webp',
            default => null,
        };
    }

    /**
     * The real type, from the bytes.
     */
    private function sniff(string $bytes): ?string
    {
        if (! class_exists(\finfo::class)) {
            return null;
        }

        try {
            $type = (new \finfo(FILEINFO_MIME_TYPE))->buffer($bytes);
        } catch (Throwable) {
            return null;
        }

        return is_string($type) && $type !== '' ? mb_strtolower($type) : null;
    }

    /**
     * @return array{0: int|null, 1: int|null}
     */
    private function dimensions(string $bytes): array
    {
        if (! function_exists('getimagesizefromstring')) {
            return [null, null];
        }

        $size = @getimagesizefromstring($bytes);

        return is_array($size) && isset($size[0], $size[1])
            ? [(int) $size[0], (int) $size[1]]
            : [null, null];
    }

    private function fetch(string $path): ?string
    {
        try {
            // The r2 disk is configured with `throw => false`, so a missing
            // object comes back falsy rather than raising.
            $bytes = Storage::disk('r2')->get($path);
        } catch (Throwable $e) {
            Log::warning('Tala: could not read a lesson attachment', [
                'path' => $path,
                'error' => $e->getMessage(),
            ]);

            return null;
        }

        return is_string($bytes) ? $bytes : null;
    }

    /**
     * A refusal the teacher can act on.
     *
     * An image and a PDF have different remedies, and saying "too large" without
     * one is how a teacher ends up with a file they uploaded and cannot use.
     */
    private function tooLarge(string $kind, int $size, int $ceiling): string
    {
        return $kind === LessonAttachment::KIND_PDF
            ? sprintf(
                'too large to open (%s; the most that can be opened here is %s). Upload it in '
                .'parts, or export a smaller version.',
                $this->megabytes($size),
                $this->megabytes($ceiling),
            )
            : sprintf(
                'too large to read (%s; the limit for images is %s). Re-save it smaller and '
                .'upload it again.',
                $this->megabytes($size),
                $this->megabytes($ceiling),
            );
    }

    /**
     * Kilobytes below a tenth of a megabyte, so a small file is not reported as
     * "0 MB".
     */
    private function megabytes(int $bytes): string
    {
        return $bytes < 100 * 1024
            ? max(1, (int) round($bytes / 1024)).' KB'
            : round($bytes / (1024 * 1024), 1).' MB';
    }
}
