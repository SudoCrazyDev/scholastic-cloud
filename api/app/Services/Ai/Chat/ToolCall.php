<?php

namespace App\Services\Ai\Chat;

/**
 * A tool the model asked to run, normalised across providers.
 *
 * `id` is the provider's correlation id — Anthropic's `tool_use.id`, OpenAI's
 * `tool_calls[].id`. It has to be echoed back with the result or the provider
 * cannot match the two.
 */
class ToolCall
{
    /**
     * @param  array<string, mixed>  $input
     */
    public function __construct(
        public readonly string $id,
        public readonly string $name,
        public readonly array $input,
    ) {}
}
