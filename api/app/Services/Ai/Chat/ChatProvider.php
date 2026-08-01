<?php

namespace App\Services\Ai\Chat;

/**
 * A provider Tala can hold a conversation with.
 *
 * Deliberately separate from App\Services\Ai\AiProvider. That interface is
 * task-shaped (generate topics, generate a lesson plan) and runs on one
 * platform-wide key from the environment; this one is turn-shaped, streams,
 * and is handed a key resolved per request from the tenant. Folding chat into
 * the planner's interface would have meant every implementation growing methods
 * it has no use for.
 */
interface ChatProvider
{
    /**
     * Stream one assistant turn.
     *
     * Yields text fragments as they arrive and returns a ChatResult when the
     * turn ends — success or failure. Implementations do not throw for provider
     * errors: a refused request, a dead key and a network timeout all come back
     * as a failed ChatResult, because all three end the same way for the caller
     * (persist the turn, tell the teacher) and a try/catch wrapped around a
     * generator that is already mid-response helps nobody.
     *
     * When the model asks for a tool instead of answering, the result carries
     * `toolCalls` and the turn is not finished — run them and continue with
     * `withToolResults()`.
     *
     * @param  string  $system  System prompt — the teacher's context.
     * @param  array<int, mixed>  $messages  Prior turns, oldest first, ending with the new user message.
     * @param  array<int, array{name: string, description: string, input_schema: array}>  $tools
     * @return \Generator<int, string, mixed, ChatResult>
     */
    public function stream(string $system, array $messages, array $tools = []): \Generator;

    /**
     * Extend the transcript with the assistant's tool request and the results,
     * ready for the next `stream()` call.
     *
     * Lives on the provider because the two wire formats disagree about
     * everything here: Anthropic echoes the assistant's content blocks and
     * replies with `tool_result` blocks in a user turn, OpenAI carries a
     * `tool_calls` array on the assistant message and answers with separate
     * `role: "tool"` messages. Reconstructing either from a normalised shape
     * loses detail the provider needs back — thinking-block signatures, in
     * Anthropic's case — so each keeps its own.
     *
     * @param  array<int, mixed>  $messages
     * @param  array<string, string>  $results  Tool call id => result payload (JSON).
     * @param  array<string, bool>  $errors  Tool call id => whether it failed.
     * @return array<int, mixed>
     */
    public function withToolResults(array $messages, ChatResult $result, array $results, array $errors = []): array;
}
