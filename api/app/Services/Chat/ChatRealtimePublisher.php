<?php

namespace App\Services\Chat;

use App\Models\ChatConversation;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Pushes a committed message to the Cloudflare Worker for immediate delivery,
 * and mints the short-lived tokens clients use to open their socket.
 *
 * Everything here is best-effort. The database is the record; this only decides
 * whether a message lands in under a second or on the reader's next poll. That
 * is why the publish is inline with a two-second ceiling and why every failure
 * is swallowed — a Worker outage must not turn into a school unable to post.
 */
class ChatRealtimePublisher
{
    private const BREAKER_KEY = 'chat:realtime:breaker';

    private const FAILURE_KEY = 'chat:realtime:failures';

    /** Consecutive failures before the Worker is left alone for a while. */
    private const FAILURE_THRESHOLD = 3;

    private const BREAKER_SECONDS = 60;

    public function enabled(): bool
    {
        return filled(config('chat.worker.url'))
            && filled(config('chat.worker.secret'))
            && filled(config('chat.tenant'));
    }

    /**
     * Fan a message out to everyone in the group except its sender.
     *
     * The recipient list is computed fresh from chat_participants on every
     * message rather than trusted from the socket. That is what makes removal
     * take effect at once: a student taken out of a section stops being sent
     * anything the moment the roster says so, without having to disconnect them.
     *
     * The message is passed already serialized, in the same shape sync() returns
     * it, so a client can fold a socket delivery and a polled one into the cache
     * through exactly one code path.
     *
     * @param  array<string,mixed>  $message
     * @param  array<int,array{type:string,id:string}>  $recipients
     */
    public function publish(ChatConversation $conversation, array $message, array $recipients): void
    {
        if (! $this->enabled() || $recipients === []) {
            return;
        }

        /*
         * An unreachable Worker would otherwise cost every sender the full
         * timeout, for as long as the outage lasts — a wrong URL in a .env would
         * quietly make the whole school's chat two seconds slower and nothing
         * would say why. After a few failures in a row, stop calling for a
         * minute and let the polling path carry the load.
         */
        if (Cache::get(self::BREAKER_KEY)) {
            return;
        }

        try {
            $response = Http::timeout((float) config('chat.worker.timeout'))
                ->withHeaders([
                    'Authorization' => 'Bearer '.config('chat.worker.secret'),
                    'X-Chat-Tenant' => config('chat.tenant'),
                ])
                ->post(rtrim(config('chat.worker.url'), '/').'/publish', [
                    'conversation_id' => $conversation->id,
                    'recipients' => $recipients,
                    'message' => $message,
                ]);

            if ($response->failed()) {
                $this->recordFailure($conversation, 'HTTP '.$response->status());

                return;
            }

            Cache::forget(self::FAILURE_KEY);
        } catch (\Throwable $e) {
            // Never an error the sender sees. Their message is saved; only the
            // fast path for the readers was missed.
            $this->recordFailure($conversation, $e->getMessage());
        }
    }

    private function recordFailure(ChatConversation $conversation, string $reason): void
    {
        $failures = (int) Cache::get(self::FAILURE_KEY, 0) + 1;

        Log::warning('Chat realtime publish failed', [
            'conversation_id' => $conversation->id,
            'consecutive_failures' => $failures,
            'reason' => $reason,
        ]);

        if ($failures >= self::FAILURE_THRESHOLD) {
            Cache::put(self::BREAKER_KEY, true, now()->addSeconds(self::BREAKER_SECONDS));
            Cache::forget(self::FAILURE_KEY);

            return;
        }

        Cache::put(self::FAILURE_KEY, $failures, now()->addMinutes(5));
    }

    /**
     * A single-use ticket for opening a socket, or null when realtime is not
     * configured for this deployment.
     *
     * @return array{url:string,token:string,expires_in:int}|null
     */
    public function socketTicket(ChatPrincipal $principal): ?array
    {
        if (! $this->enabled()) {
            return null;
        }

        $ttl = max(30, (int) config('chat.socket_token_ttl'));
        $now = time();

        $token = $this->sign([
            'tenant' => config('chat.tenant'),
            'participant_type' => $principal->type,
            'participant_id' => $principal->id,
            'iat' => $now,
            'exp' => $now + $ttl,
        ], (string) config('chat.worker.secret'));

        $base = rtrim((string) config('chat.worker.url'), '/');

        return [
            'url' => preg_replace('#^http#', 'ws', $base).'/connect',
            'token' => $token,
            'expires_in' => $ttl,
        ];
    }

    /**
     * A ticket for talking to the chat service over HTTP, or null when this
     * deployment still serves chat from Laravel.
     *
     * Longer-lived than the socket ticket because every request carries it. That
     * is safe precisely because the token settles identity and not permission —
     * the service re-reads the roster on each call.
     *
     * @return array{service:string,token:string,socket:string,expires_in:int}|null
     */
    public function accessTicket(ChatPrincipal $principal): ?array
    {
        if (! $this->enabled()) {
            return null;
        }

        $ttl = max(60, (int) config('chat.access_token_ttl'));
        $now = time();

        $token = $this->sign([
            'tenant' => config('chat.tenant'),
            'participant_type' => $principal->type,
            'participant_id' => $principal->id,
            'name' => $principal->name,
            'iat' => $now,
            'exp' => $now + $ttl,
        ], (string) config('chat.worker.secret'));

        $base = rtrim((string) config('chat.worker.url'), '/');

        return [
            'service' => $base.'/v1',
            'socket' => preg_replace('#^http#', 'ws', $base).'/connect',
            'token' => $token,
            'expires_in' => $ttl,
        ];
    }

    /** HS256, hand-rolled — one function is cheaper than a JWT dependency. */
    private function sign(array $claims, string $secret): string
    {
        $signing = $this->base64Url(json_encode(['alg' => 'HS256', 'typ' => 'JWT']))
            .'.'.$this->base64Url(json_encode($claims));

        return $signing.'.'.$this->base64Url(hash_hmac('sha256', $signing, $secret, true));
    }

    private function base64Url(string $raw): string
    {
        return rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');
    }
}
