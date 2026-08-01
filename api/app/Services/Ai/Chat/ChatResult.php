<?php

namespace App\Services\Ai\Chat;

/**
 * What a completed chat turn produced.
 *
 * Returned from the generator a ChatProvider hands back — `$stream->getReturn()`
 * once iteration finishes — so the caller gets the accumulated text and the
 * accounting in one object rather than tracking both itself.
 */
class ChatResult
{
    /**
     * @param  array<int, ToolCall>  $toolCalls  Tools the model wants run before it can answer.
     * @param  array<int, mixed>  $assistantBlocks  The assistant turn in the provider's own
     *                                              wire format, kept verbatim so it can be
     *                                              echoed back with the tool results. Opaque
     *                                              to everything outside the provider.
     */
    public function __construct(
        public readonly string $text = '',
        public readonly ?int $tokensIn = null,
        public readonly ?int $tokensOut = null,
        public readonly ?string $stopReason = null,
        public readonly ?string $errorMessage = null,
        public readonly array $toolCalls = [],
        public readonly array $assistantBlocks = [],
    ) {}

    /**
     * A turn that never reached the model, or died part-way through.
     *
     * `$text` carries whatever had already been streamed to the teacher — that
     * text is on their screen either way, so it belongs in the record too.
     */
    public static function error(string $message, string $text = '', ?string $stopReason = null): self
    {
        return new self(
            text: $text,
            stopReason: $stopReason,
            errorMessage: $message,
        );
    }

    public function failed(): bool
    {
        return $this->errorMessage !== null;
    }

    public function ok(): bool
    {
        return $this->errorMessage === null;
    }

    public function wantsTools(): bool
    {
        return $this->ok() && $this->toolCalls !== [];
    }
}
