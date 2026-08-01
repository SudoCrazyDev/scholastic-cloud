<?php

namespace App\Services\Ai\Chat;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Tala on Claude, over the Messages API.
 */
class AnthropicChatProvider implements ChatProvider
{
    private const API_VERSION = '2023-06-01';

    public function __construct(
        private readonly string $apiKey,
        private readonly string $model,
        private readonly string $baseUrl,
        private readonly int $maxTokens,
        private readonly string $effort,
        private readonly int $timeout,
    ) {}

    public function stream(string $system, array $messages, array $tools = []): \Generator
    {
        $text = '';
        $tokensIn = null;
        $tokensOut = null;
        $stopReason = null;

        /*
         * Content blocks are rebuilt as they stream, keyed by index, because
         * the assistant turn has to be echoed back verbatim when tools are in
         * play — thinking blocks included. Those carry signatures the API
         * validates on the follow-up request, so dropping them (or rebuilding
         * them from the text alone) fails the continuation.
         */
        $blocks = [];
        $toolJson = [];

        $payload = [
            'model' => $this->model,
            'max_tokens' => $this->maxTokens,
            'stream' => true,

            /*
             * Thinking is left on. It is the default on Opus 5 and turning it
             * off there makes the model write reasoning — and sometimes literal
             * <thinking> tags — into the visible reply, as well as occasionally
             * emitting a tool call as plain text that never runs. Chat stays
             * responsive by dialling depth down with `effort` instead.
             *
             * `max_tokens` above covers thinking and the reply together, so it
             * has to be generous enough for both.
             */
            'output_config' => ['effort' => $this->effort],

            /*
             * The teacher's context is stable across a conversation and is
             * re-sent on every turn, so it is worth caching. Reads cost about a
             * tenth of the write; the school pays full price for the first turn
             * of a thread and very little for the rest of it.
             *
             * The breakpoint sits after the tool definitions in render order
             * (tools, then system), so both are cached together.
             */
            'system' => [[
                'type' => 'text',
                'text' => $system,
                'cache_control' => ['type' => 'ephemeral'],
            ]],

            'messages' => array_values($messages),
        ];

        if ($tools !== []) {
            $payload['tools'] = array_map(fn (array $tool) => [
                'name' => $tool['name'],
                'description' => $tool['description'],
                'input_schema' => $tool['input_schema'],
            ], $tools);
        }

        try {
            $response = Http::withHeaders([
                'x-api-key' => $this->apiKey,
                'anthropic-version' => self::API_VERSION,
                'content-type' => 'application/json',
                'accept' => 'text/event-stream',
            ])
                ->timeout($this->timeout)
                ->withOptions(['stream' => true])
                ->post($this->baseUrl.'/v1/messages', $payload);
        } catch (Throwable $e) {
            Log::warning('Tala: Anthropic request failed to send', ['error' => $e->getMessage()]);

            return ChatResult::error('Could not reach Claude. Check the connection and try again.');
        }

        if (! $response->successful()) {
            return ChatResult::error($this->describeHttpError($response->status(), $response->body()));
        }

        try {
            foreach (SseReader::payloads($response->toPsrResponse()->getBody()) as $payloadLine) {
                $event = SseReader::decode($payloadLine);

                if ($event === null) {
                    continue;
                }

                $index = $event['index'] ?? null;

                switch ($event['type'] ?? '') {
                    case 'message_start':
                        $usage = $event['message']['usage'] ?? [];
                        // Cache reads and writes are prompt tokens too — the
                        // school is billed for them, so they belong in the
                        // number the usage screen shows.
                        $tokensIn = (int) ($usage['input_tokens'] ?? 0)
                            + (int) ($usage['cache_read_input_tokens'] ?? 0)
                            + (int) ($usage['cache_creation_input_tokens'] ?? 0);
                        break;

                    case 'content_block_start':
                        $blocks[$index] = $event['content_block'] ?? [];

                        if (($blocks[$index]['type'] ?? '') === 'tool_use') {
                            // Arguments arrive as a string in pieces; the empty
                            // `input` on the start event is a placeholder.
                            $toolJson[$index] = '';
                        }
                        break;

                    case 'content_block_delta':
                        $delta = $event['delta'] ?? [];

                        switch ($delta['type'] ?? '') {
                            case 'text_delta':
                                $fragment = (string) ($delta['text'] ?? '');
                                $blocks[$index]['text'] = ($blocks[$index]['text'] ?? '').$fragment;

                                if ($fragment !== '') {
                                    $text .= $fragment;
                                    yield $fragment;
                                }
                                break;

                            case 'thinking_delta':
                                // Accumulated for the echo-back, never yielded:
                                // the reasoning is not the answer.
                                $blocks[$index]['thinking'] = ($blocks[$index]['thinking'] ?? '')
                                    .(string) ($delta['thinking'] ?? '');
                                break;

                            case 'signature_delta':
                                $blocks[$index]['signature'] = (string) ($delta['signature'] ?? '');
                                break;

                            case 'input_json_delta':
                                $toolJson[$index] = ($toolJson[$index] ?? '').(string) ($delta['partial_json'] ?? '');
                                break;
                        }
                        break;

                    case 'content_block_stop':
                        if (isset($toolJson[$index])) {
                            $decoded = json_decode($toolJson[$index] ?: '{}', true);
                            $blocks[$index]['input'] = is_array($decoded) ? $decoded : [];
                        }
                        break;

                    case 'message_delta':
                        $stopReason = $event['delta']['stop_reason'] ?? $stopReason;
                        $tokensOut = (int) ($event['usage']['output_tokens'] ?? $tokensOut);
                        break;

                    case 'error':
                        $message = (string) ($event['error']['message'] ?? 'Claude returned an error.');
                        Log::warning('Tala: Anthropic stream error', ['error' => $message]);

                        return ChatResult::error($message, $text);
                }
            }
        } catch (Throwable $e) {
            Log::warning('Tala: Anthropic stream broke mid-response', ['error' => $e->getMessage()]);

            return ChatResult::error('The response was cut off. Try asking again.', $text);
        }

        /*
         * A refusal is a successful HTTP 200 with an empty or truncated body,
         * not an error status — the safety classifiers declined. Checking
         * `stop_reason` before trusting the text is the only way to tell it
         * apart from a normal short answer.
         */
        if ($stopReason === 'refusal') {
            return ChatResult::error(
                'Claude declined to answer that one. Try rewording the question.',
                $text,
                $stopReason,
            );
        }

        ksort($blocks);
        $assistantBlocks = array_values($blocks);
        $toolCalls = $this->toolCallsFrom($assistantBlocks);

        // An empty reply is a real failure — unless the model went straight to
        // a tool call, which legitimately produces no text at all.
        if ($text === '' && $toolCalls === []) {
            return ChatResult::error('Claude returned an empty response. Try again.', '', $stopReason);
        }

        return new ChatResult(
            text: $text,
            tokensIn: $tokensIn,
            tokensOut: $tokensOut,
            stopReason: $stopReason,
            toolCalls: $toolCalls,
            assistantBlocks: $assistantBlocks,
        );
    }

    public function withToolResults(
        array $messages,
        ChatResult $result,
        array $results,
        array $errors = [],
        array $attachments = [],
    ): array {
        $toolResults = [];

        foreach ($result->toolCalls as $call) {
            $toolResults[] = array_filter([
                'type' => 'tool_result',
                'tool_use_id' => $call->id,
                'content' => $results[$call->id] ?? '{}',
                'is_error' => ($errors[$call->id] ?? false) ?: null,
            ], fn ($value) => $value !== null);
        }

        /*
         * Files a tool loaded go in the same user turn as the results, after
         * them. The API requires `tool_result` blocks at the start of the
         * content array, which this satisfies, and keeping it to one turn avoids
         * relying on two consecutive user messages being accepted.
         *
         * They are not put *inside* a tool_result block: what that supports
         * varies, whereas an image or document block in an ordinary user turn is
         * the oldest, plainest thing the API does.
         */
        foreach ($attachments as $attachment) {
            $toolResults[] = [
                'type' => 'text',
                'text' => 'Attached from the lesson: '.$attachment->describe(),
            ];

            $toolResults[] = $attachment->isImage()
                ? [
                    'type' => 'image',
                    'source' => [
                        'type' => 'base64',
                        'media_type' => $attachment->mediaType,
                        'data' => $attachment->base64(),
                    ],
                ]
                : [
                    'type' => 'document',
                    'source' => [
                        'type' => 'base64',
                        'media_type' => $attachment->mediaType,
                        'data' => $attachment->base64(),
                    ],
                ];
        }

        // The assistant turn goes back exactly as it arrived — thinking blocks,
        // signatures and all — followed by the results as a user turn.
        $messages[] = ['role' => 'assistant', 'content' => $result->assistantBlocks];
        $messages[] = ['role' => 'user', 'content' => $toolResults];

        return $messages;
    }

    /**
     * Claude reads images and PDFs natively.
     */
    public function supportsAttachment(string $mediaType): bool
    {
        return in_array($mediaType, [
            'image/jpeg', 'image/png', 'image/gif', 'image/webp',
            'application/pdf',
        ], true);
    }

    /**
     * @param  array<int, mixed>  $blocks
     * @return array<int, ToolCall>
     */
    private function toolCallsFrom(array $blocks): array
    {
        $calls = [];

        foreach ($blocks as $block) {
            if (($block['type'] ?? '') !== 'tool_use') {
                continue;
            }

            $calls[] = new ToolCall(
                id: (string) ($block['id'] ?? ''),
                name: (string) ($block['name'] ?? ''),
                input: is_array($block['input'] ?? null) ? $block['input'] : [],
            );
        }

        return $calls;
    }

    /**
     * Turn a provider status code into something a teacher can act on.
     *
     * The raw body is logged, not shown: it can carry organisation and key
     * detail that has no business on a teacher's screen.
     */
    private function describeHttpError(int $status, string $body): string
    {
        Log::warning('Tala: Anthropic returned an error', ['status' => $status, 'body' => $body]);

        return match (true) {
            $status === 401 || $status === 403 => 'The Claude API key was rejected. It may have been revoked or mistyped.',
            $status === 404 => 'The selected Claude model is not available on this API key.',
            $status === 429 => 'Claude is rate limiting this key. Wait a moment and try again.',
            $status >= 500 => 'Claude is having trouble right now. Try again shortly.',
            default => 'Claude rejected the request.',
        };
    }
}
