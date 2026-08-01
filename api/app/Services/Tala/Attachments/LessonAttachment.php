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
    ) {}

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
