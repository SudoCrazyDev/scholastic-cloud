<?php

namespace App\Services\Ai\Chat;

use Psr\Http\Message\StreamInterface;

/**
 * Pulls `data:` payloads off a Server-Sent Events body.
 *
 * Both providers stream SSE, and both only put anything Tala needs on `data:`
 * lines — the `event:` line duplicates a `type` field inside the JSON. So this
 * skips everything else and yields raw payload strings for the caller to decode.
 *
 * A read can land mid-line, so the tail of each chunk is held back until the
 * newline that completes it arrives.
 */
class SseReader
{
    /**
     * @return \Generator<int, string>
     */
    public static function payloads(StreamInterface $body, int $chunkSize = 8192): \Generator
    {
        $buffer = '';

        while (! $body->eof()) {
            $chunk = $body->read($chunkSize);

            if ($chunk === '') {
                // A well-behaved stream reports eof; a stalled one can return
                // empty reads forever. Bail rather than spin.
                break;
            }

            $buffer .= $chunk;

            while (($newline = strpos($buffer, "\n")) !== false) {
                $line = rtrim(substr($buffer, 0, $newline), "\r");
                $buffer = substr($buffer, $newline + 1);

                if (! str_starts_with($line, 'data:')) {
                    continue;
                }

                $payload = trim(substr($line, 5));

                if ($payload !== '') {
                    yield $payload;
                }
            }
        }

        // A final payload with no trailing newline.
        $line = rtrim($buffer, "\r\n");

        if (str_starts_with($line, 'data:')) {
            $payload = trim(substr($line, 5));

            if ($payload !== '') {
                yield $payload;
            }
        }
    }

    /**
     * @return array<string, mixed>|null
     */
    public static function decode(string $payload): ?array
    {
        $decoded = json_decode($payload, true);

        return is_array($decoded) ? $decoded : null;
    }
}
