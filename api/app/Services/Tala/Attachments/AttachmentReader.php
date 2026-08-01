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
 *   1. **Is it worth fetching?** Extension and recorded MIME first — no point
 *      pulling an 80 MB video out of R2 to discover nobody can read it.
 *   2. **Is it what it claims?** The MIME on the block was supplied by the
 *      browser at upload time. The fetched bytes are sniffed with `finfo` and
 *      the sniffed type wins, so a mislabelled file is refused rather than sent
 *      under the wrong content type.
 *   3. **Does it fit?** Per-file and per-turn byte budgets, a file count, and an
 *      image edge limit. There is no GD or Imagick on these servers, so an
 *      oversized image cannot be downscaled — it is refused with a reason the
 *      teacher can act on.
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

    /**
     * Load the readable files attached to a lesson.
     *
     * @param  string|null  $wanted  A filename, or part of one, to narrow to.
     * @param  array<int, string>  $supported  Media types the answering provider can read.
     *                                         Comes from ChatProvider::supportsAttachment(),
     *                                         so a school on a model that cannot read PDFs
     *                                         gets told rather than sent a failing request.
     */
    public function forLesson(Topic $lesson, ?string $wanted, array $supported): AttachmentBatch
    {
        $blocks = is_array($lesson->content) ? $lesson->content : [];

        $attachments = [];
        $skipped = [];
        $spent = 0;

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

            if (count($attachments) >= $maxFiles) {
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

            if (! in_array($mediaType, $supported, true)) {
                $skipped[] = [
                    'name' => $name,
                    'reason' => 'the AI model this school uses cannot read '.$mediaType.' files',
                ];

                continue;
            }

            $kind = $this->kindForType($mediaType);
            $limit = $kind === LessonAttachment::KIND_PDF
                ? (int) config('tala.attachments.max_pdf_bytes', 10 * 1024 * 1024)
                : (int) config('tala.attachments.max_image_bytes', 4 * 1024 * 1024);

            if (strlen($bytes) > $limit) {
                $skipped[] = [
                    'name' => $name,
                    'reason' => sprintf(
                        'too large to read (%s; the limit for %s is %s)',
                        $this->megabytes(strlen($bytes)),
                        $kind === LessonAttachment::KIND_PDF ? 'PDFs' : 'images',
                        $this->megabytes($limit),
                    ),
                ];

                continue;
            }

            if ($spent + strlen($bytes) > $maxTotal) {
                $skipped[] = [
                    'name' => $name,
                    'reason' => 'not loaded — the total size of files in one message is capped at '
                        .$this->megabytes($maxTotal),
                ];

                continue;
            }

            $width = null;
            $height = null;

            if ($kind === LessonAttachment::KIND_IMAGE) {
                [$width, $height] = $this->dimensions($bytes);
                $edge = (int) config('tala.attachments.max_image_edge', 8000);

                if ($width !== null && max($width, $height) > $edge) {
                    $skipped[] = [
                        'name' => $name,
                        'reason' => sprintf(
                            'too big to read (%d×%d; the longest side must be under %dpx). '
                            .'Re-save it smaller and upload it again.',
                            $width,
                            $height,
                            $edge,
                        ),
                    ];

                    continue;
                }
            }

            $attachments[] = new LessonAttachment(
                name: $name,
                mediaType: $mediaType,
                kind: $kind,
                bytes: $bytes,
                width: $width,
                height: $height,
            );

            $spent += strlen($bytes);
        }

        return new AttachmentBatch($attachments, $skipped);
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

            if ($guess !== null && in_array($guess, $supported, true)) {
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

    private function megabytes(int $bytes): string
    {
        return round($bytes / (1024 * 1024), 1).' MB';
    }
}
