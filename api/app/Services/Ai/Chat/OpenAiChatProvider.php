<?php

namespace App\Services\Ai\Chat;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Tala on OpenAI, over the Chat Completions API.
 */
class OpenAiChatProvider implements ChatProvider
{
    public function __construct(
        private readonly string $apiKey,
        private readonly string $model,
        private readonly string $baseUrl,
        private readonly int $maxTokens,
        private readonly int $timeout,
    ) {}

    public function stream(string $system, array $messages, array $tools = []): \Generator
    {
        $text = '';
        $tokensIn = null;
        $tokensOut = null;
        $stopReason = null;

        // Tool calls stream in pieces keyed by position, not by id — the id
        // arrives on the first fragment and the arguments accumulate after it.
        $pending = [];

        // OpenAI takes the system prompt as the first message rather than a
        // separate field, which is the main shape difference from Anthropic.
        $payloadMessages = array_merge(
            [['role' => 'system', 'content' => $system]],
            array_values($messages),
        );

        $payload = [
            'model' => $this->model,
            'max_tokens' => $this->maxTokens,
            'stream' => true,
            // Usage is omitted from a stream unless asked for, and without it
            // the spend guard has nothing to count.
            'stream_options' => ['include_usage' => true],
            'messages' => $payloadMessages,
        ];

        if ($tools !== []) {
            $payload['tools'] = array_map(fn (array $tool) => [
                'type' => 'function',
                'function' => [
                    'name' => $tool['name'],
                    'description' => $tool['description'],
                    'parameters' => $tool['input_schema'],
                ],
            ], $tools);
        }

        try {
            $response = Http::withToken($this->apiKey)
                ->withHeaders([
                    'content-type' => 'application/json',
                    'accept' => 'text/event-stream',
                ])
                ->timeout($this->timeout)
                ->withOptions(['stream' => true])
                ->post($this->baseUrl.'/chat/completions', $payload);
        } catch (Throwable $e) {
            Log::warning('Tala: OpenAI request failed to send', ['error' => $e->getMessage()]);

            return ChatResult::error('Could not reach OpenAI. Check the connection and try again.');
        }

        if (! $response->successful()) {
            return ChatResult::error($this->describeHttpError($response->status(), $response->body()));
        }

        try {
            foreach (SseReader::payloads($response->toPsrResponse()->getBody()) as $payloadLine) {
                // OpenAI closes with a literal sentinel rather than just ending
                // the body.
                if ($payloadLine === '[DONE]') {
                    break;
                }

                $event = SseReader::decode($payloadLine);

                if ($event === null) {
                    continue;
                }

                if (isset($event['error'])) {
                    $message = (string) ($event['error']['message'] ?? 'OpenAI returned an error.');
                    Log::warning('Tala: OpenAI stream error', ['error' => $message]);

                    return ChatResult::error($message, $text);
                }

                // The usage-bearing frame carries an empty `choices` array, so
                // read usage before looking at the delta.
                if (isset($event['usage']) && is_array($event['usage'])) {
                    $tokensIn = (int) ($event['usage']['prompt_tokens'] ?? $tokensIn);
                    $tokensOut = (int) ($event['usage']['completion_tokens'] ?? $tokensOut);
                }

                $choice = $event['choices'][0] ?? null;

                if (! is_array($choice)) {
                    continue;
                }

                $stopReason = $choice['finish_reason'] ?? $stopReason;

                foreach ($choice['delta']['tool_calls'] ?? [] as $fragment) {
                    $slot = (int) ($fragment['index'] ?? 0);

                    $pending[$slot] ??= ['id' => '', 'name' => '', 'arguments' => ''];

                    if (filled($fragment['id'] ?? null)) {
                        $pending[$slot]['id'] = (string) $fragment['id'];
                    }

                    if (filled($fragment['function']['name'] ?? null)) {
                        $pending[$slot]['name'] = (string) $fragment['function']['name'];
                    }

                    $pending[$slot]['arguments'] .= (string) ($fragment['function']['arguments'] ?? '');
                }

                $fragment = (string) ($choice['delta']['content'] ?? '');

                if ($fragment !== '') {
                    $text .= $fragment;
                    yield $fragment;
                }
            }
        } catch (Throwable $e) {
            Log::warning('Tala: OpenAI stream broke mid-response', ['error' => $e->getMessage()]);

            return ChatResult::error('The response was cut off. Try asking again.', $text);
        }

        if ($stopReason === 'content_filter') {
            return ChatResult::error(
                'OpenAI declined to answer that one. Try rewording the question.',
                $text,
                $stopReason,
            );
        }

        ksort($pending);
        $toolCalls = $this->toolCallsFrom($pending);

        // An empty reply is a real failure — unless the model went straight to
        // a tool call, which legitimately produces no text at all.
        if ($text === '' && $toolCalls === []) {
            return ChatResult::error('OpenAI returned an empty response. Try again.', '', $stopReason);
        }

        return new ChatResult(
            text: $text,
            tokensIn: $tokensIn,
            tokensOut: $tokensOut,
            stopReason: $stopReason,
            toolCalls: $toolCalls,
            // The raw arguments string is kept rather than the decoded array:
            // the echo-back has to reproduce what the model emitted, and
            // re-encoding a decoded array is not guaranteed to.
            assistantBlocks: array_values($pending),
        );
    }

    public function withToolResults(array $messages, ChatResult $result, array $results, array $errors = []): array
    {
        $toolCalls = [];

        foreach ($result->assistantBlocks as $call) {
            $toolCalls[] = [
                'id' => $call['id'],
                'type' => 'function',
                'function' => [
                    'name' => $call['name'],
                    'arguments' => $call['arguments'] !== '' ? $call['arguments'] : '{}',
                ],
            ];
        }

        // `content` must be null rather than an empty string when the turn was
        // nothing but tool calls.
        $messages[] = [
            'role' => 'assistant',
            'content' => $result->text !== '' ? $result->text : null,
            'tool_calls' => $toolCalls,
        ];

        // One message per result, correlated by id. OpenAI has no notion of an
        // error flag here, so a failed lookup is just its own JSON payload —
        // ToolOutcome::error() puts the reason under an `error` key where the
        // model will read it.
        foreach ($result->toolCalls as $call) {
            $messages[] = [
                'role' => 'tool',
                'tool_call_id' => $call->id,
                'content' => $results[$call->id] ?? '{}',
            ];
        }

        return $messages;
    }

    /**
     * @param  array<int, array{id: string, name: string, arguments: string}>  $pending
     * @return array<int, ToolCall>
     */
    private function toolCallsFrom(array $pending): array
    {
        $calls = [];

        foreach ($pending as $call) {
            if ($call['name'] === '' || $call['id'] === '') {
                continue;
            }

            $decoded = json_decode($call['arguments'] ?: '{}', true);

            $calls[] = new ToolCall(
                id: $call['id'],
                name: $call['name'],
                input: is_array($decoded) ? $decoded : [],
            );
        }

        return $calls;
    }

    /**
     * @see AnthropicChatProvider::describeHttpError() — same reasoning: the raw
     *      body is logged, and the teacher gets something actionable.
     */
    private function describeHttpError(int $status, string $body): string
    {
        Log::warning('Tala: OpenAI returned an error', ['status' => $status, 'body' => $body]);

        return match (true) {
            $status === 401 || $status === 403 => 'The OpenAI API key was rejected. It may have been revoked or mistyped.',
            $status === 404 => 'The selected OpenAI model is not available on this API key.',
            $status === 429 => 'OpenAI is rate limiting this key, or the account is out of credit.',
            $status >= 500 => 'OpenAI is having trouble right now. Try again shortly.',
            default => 'OpenAI rejected the request.',
        };
    }
}
