<?php

namespace App\Services\Tala\Attachments;

/**
 * One file from a lesson, loaded and ready to hand to a model.
 *
 * Holds the bytes, not a link. The R2 object key and the signed URL that would
 * fetch it stay on the server — see AttachmentReader — so what travels to
 * Anthropic or OpenAI is the content and a filename, never a credential.
 */
class LessonAttachment
{
    public const KIND_IMAGE = 'image';

    public const KIND_PDF = 'pdf';

    public function __construct(
        public readonly string $name,
        public readonly string $mediaType,
        public readonly string $kind,
        /** Raw bytes. Base64 is derived on demand rather than stored twice. */
        public readonly string $bytes,
        public readonly ?int $width = null,
        public readonly ?int $height = null,
        /**
         * The lesson file this came from, when it is not the whole file.
         *
         * A page lifted out of a scanned PDF is sent as its own image named
         * "handout.pdf (page 3)", which is what the model should say. But the
         * lesson only knows the file as "handout.pdf", so the original name has
         * to survive alongside the label — see AttachmentBatch::names(), which
         * feeds the check that an assessment was written with the material open.
         */
        public readonly ?string $sourceName = null,
    ) {}

    /**
     * The lesson's own filename for this attachment.
     */
    public function sourceName(): string
    {
        return $this->sourceName ?? $this->name;
    }

    public function base64(): string
    {
        return base64_encode($this->bytes);
    }

    public function byteSize(): int
    {
        return strlen($this->bytes);
    }

    public function isImage(): bool
    {
        return $this->kind === self::KIND_IMAGE;
    }

    /**
     * A line for the model and for the chat's tool trail.
     */
    public function describe(): string
    {
        $size = round($this->byteSize() / 1024).' KB';

        return $this->width !== null
            ? sprintf('%s (%s, %d×%d, %s)', $this->name, $this->mediaType, $this->width, $this->height, $size)
            : sprintf('%s (%s, %s)', $this->name, $this->mediaType, $size);
    }
}
