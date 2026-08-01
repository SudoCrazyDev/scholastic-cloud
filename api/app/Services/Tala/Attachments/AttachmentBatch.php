<?php

namespace App\Services\Tala\Attachments;

/**
 * What one read of a lesson's files produced: the files loaded, the text pulled
 * out of files too large to send whole, and the files that were not read at all,
 * each with a reason.
 *
 * Skips are carried as first-class data rather than logged away. A teacher whose
 * scanned handout was too large needs to hear that, and the model can only say
 * it if the tool result tells it — otherwise the answer quietly leaves out the
 * material the question was about.
 *
 * `attachments` and `texts` travel by different routes and that distinction is
 * the point: attachments are bytes the controller inlines into the provider
 * request, while text goes into the tool result the model reads as JSON. A read
 * can produce either or both, so neither alone means the read succeeded — see
 * isEmpty().
 */
class AttachmentBatch
{
    /**
     * @param  array<int, LessonAttachment>  $attachments
     * @param  array<int, array{name: string, reason: string}>  $skipped
     * @param  array<int, array{name: string, pages: int, truncated: bool, text: string}>  $texts
     */
    public function __construct(
        public readonly array $attachments,
        public readonly array $skipped = [],
        public readonly array $texts = [],
    ) {}

    public function isEmpty(): bool
    {
        return $this->attachments === [] && $this->texts === [];
    }

    public function count(): int
    {
        return count($this->attachments);
    }

    public function byteSize(): int
    {
        return array_sum(array_map(fn (LessonAttachment $a) => $a->byteSize(), $this->attachments));
    }

    /**
     * Every file this read got something out of, whether bytes or text.
     *
     * Used by ProposeAssessmentTool to decide whether an assessment claiming to
     * be based on a lesson was written with the material actually open, so a
     * file read as text has to count here just as much as one sent whole.
     *
     * @return array<int, string>
     */
    public function names(): array
    {
        return array_values(array_unique(array_merge(
            array_map(fn (LessonAttachment $a) => $a->sourceName(), $this->attachments),
            array_map(fn (array $text) => $text['name'], $this->texts),
        )));
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function describe(): array
    {
        return array_map(fn (LessonAttachment $a) => [
            'name' => $a->name,
            'type' => $a->mediaType,
            'size' => round($a->byteSize() / 1024).' KB',
            'dimensions' => $a->width !== null ? $a->width.'×'.$a->height : null,
        ], $this->attachments);
    }
}
