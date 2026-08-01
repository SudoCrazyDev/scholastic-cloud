<?php

namespace App\Services\Tala\Attachments;

/**
 * What could be got out of a PDF that was too large to send whole.
 *
 * Exactly one of three things is true of any instance: it carries text, it
 * carries page images, or it carries a reason why neither was possible. The
 * reason is as much a result as the other two — a teacher whose 30 MB upload
 * turns out to be fax-encoded scans needs to be told that, and told it in words
 * that suggest what to do next.
 */
class PdfExtract
{
    /**
     * @param  array<int, array{page: int, media_type: string, bytes: string, width: int|null, height: int|null}>  $pageImages
     */
    private function __construct(
        public readonly int $pageCount,
        public readonly ?string $text = null,
        public readonly array $pageImages = [],
        public readonly bool $textTruncated = false,
        /** Pages that exist but were not turned into images, and why. */
        public readonly ?string $pagesNote = null,
        public readonly ?string $failure = null,
    ) {}

    public static function fromText(string $text, int $pageCount, bool $truncated): self
    {
        return new self(pageCount: $pageCount, text: $text, textTruncated: $truncated);
    }

    /**
     * @param  array<int, array{page: int, media_type: string, bytes: string, width: int|null, height: int|null}>  $images
     */
    public static function fromPages(array $images, int $pageCount, ?string $note = null): self
    {
        return new self(pageCount: $pageCount, pageImages: $images, pagesNote: $note);
    }

    public static function failed(string $reason, int $pageCount = 0): self
    {
        return new self(pageCount: $pageCount, failure: $reason);
    }

    public function hasText(): bool
    {
        return $this->text !== null && trim($this->text) !== '';
    }

    public function hasPages(): bool
    {
        return $this->pageImages !== [];
    }
}
