<?php

namespace App\Services\Tala\Tools;

/**
 * What a tool returned, in a shape both the model and the audit row can use.
 */
class ToolOutcome
{
    /**
     * @param  array<string, mixed>  $data  Handed to the model as JSON.
     * @param  string  $summary  One line for the chat UI and the audit row.
     * @param  array<string, mixed>  $meta  For the controller, not the model. A
     *                                      tool that produces something the UI
     *                                      must render — an approval card, say —
     *                                      names it here; nothing in `meta` is
     *                                      sent to the provider.
     */
    public function __construct(
        public readonly array $data,
        public readonly string $summary,
        public readonly bool $isError = false,
        public readonly array $meta = [],
    ) {}

    /**
     * @param  array<string, mixed>  $data
     * @param  array<string, mixed>  $meta
     */
    public static function ok(array $data, string $summary, array $meta = []): self
    {
        return new self($data, $summary, false, $meta);
    }

    /**
     * A refusal or a miss.
     *
     * Returned to the model as a tool result rather than thrown, so it can tell
     * the teacher what happened and carry on. A tool that throws ends the turn
     * with a generic failure and loses the reason.
     */
    public static function error(string $message): self
    {
        return new self(['error' => $message], $message, true);
    }

    public function toJson(): string
    {
        return json_encode($this->data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: '{}';
    }
}
