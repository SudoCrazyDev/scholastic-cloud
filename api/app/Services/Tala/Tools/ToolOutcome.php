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
     */
    public function __construct(
        public readonly array $data,
        public readonly string $summary,
        public readonly bool $isError = false,
    ) {}

    /**
     * @param  array<string, mixed>  $data
     */
    public static function ok(array $data, string $summary): self
    {
        return new self($data, $summary);
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
