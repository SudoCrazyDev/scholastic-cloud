<?php

namespace App\Services\Tala\Attachments;

/**
 * What one read of a lesson's files produced: the files loaded, and the files
 * that were not, each with a reason.
 *
 * Skips are carried as first-class data rather than logged away. A teacher whose
 * scanned handout was too large needs to hear that, and the model can only say
 * it if the tool result tells it — otherwise the answer quietly leaves out the
 * material the question was about.
 */
class AttachmentBatch
{
    /**
     * @param  array<int, LessonAttachment>  $attachments
     * @param  array<int, array{name: string, reason: string}>  $skipped
     */
    public function __construct(
        public readonly array $attachments,
        public readonly array $skipped = [],
    ) {}

    public function isEmpty(): bool
    {
        return $this->attachments === [];
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
     * @return array<int, string>
     */
    public function names(): array
    {
        return array_map(fn (LessonAttachment $a) => $a->name, $this->attachments);
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
