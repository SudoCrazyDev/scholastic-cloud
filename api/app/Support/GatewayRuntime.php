<?php

namespace App\Support;

use Illuminate\Contracts\Cache\Repository;
use Illuminate\Support\Facades\Cache;

/**
 * Live, throwaway state for an SMS kiosk: whether its modem answered, the tail
 * of its agent log, and any command an admin has queued for it.
 *
 * None of this is persisted. It lives in the **file** cache store (explicitly,
 * not the app default, which is `database`) because it is worthless the moment
 * it's stale — the agent re-reports everything within one heartbeat — and log
 * output has no business accumulating in a table nobody prunes. Clearing the
 * cache costs you a few seconds of staleness and nothing else.
 *
 * The trade-off to know about: a multi-server deployment would need a shared
 * store here, since the web node answering the admin's request must be the same
 * one the kiosk posted to. ScholasticCloud runs single-node, so file is fine.
 */
class GatewayRuntime
{
    /** Modem health outlives the heartbeat interval by a wide margin. */
    private const HEALTH_TTL = 900;

    /** Log tail survives a viewer closing and reopening the drawer. */
    private const LOG_TTL = 1800;

    /** A refresh nobody collected in 2 minutes is a refresh nobody wants. */
    private const REFRESH_TTL = 120;

    /** Renewed by each poll of the log viewer; expiring is how streaming stops. */
    private const STREAM_TTL = 45;

    private const MAX_LINES = 500;

    private const MAX_LINE_CHARS = 500;

    private static function store(): Repository
    {
        return Cache::store('file');
    }

    private static function key(string $gatewayId, string $suffix): string
    {
        return "sms_gw:{$gatewayId}:{$suffix}";
    }

    // ── Modem health ─────────────────────────────────────────────────────────

    /**
     * @param  array{connected: bool, error: ?string, port: ?string}  $health
     */
    public static function putHealth(string $gatewayId, array $health): void
    {
        self::store()->put(self::key($gatewayId, 'health'), [
            'connected' => $health['connected'],
            'error' => $health['error'] ?? null,
            'port' => $health['port'] ?? null,
            'checked_at' => now()->toISOString(),
        ], self::HEALTH_TTL);
    }

    /**
     * @return array{connected: bool, error: ?string, port: ?string, checked_at: string}|null
     */
    public static function health(string $gatewayId): ?array
    {
        return self::store()->get(self::key($gatewayId, 'health'));
    }

    // ── Commands (portal → kiosk, delivered on the outbox poll) ──────────────

    public static function requestRefresh(string $gatewayId): void
    {
        self::store()->put(self::key($gatewayId, 'refresh'), true, self::REFRESH_TTL);
    }

    public static function refreshPending(string $gatewayId): bool
    {
        return (bool) self::store()->get(self::key($gatewayId, 'refresh'));
    }

    /** Ask for logs; renewed on every poll of the viewer, expires when it closes. */
    public static function requestLogStream(string $gatewayId): void
    {
        self::store()->put(self::key($gatewayId, 'stream'), true, self::STREAM_TTL);
    }

    /**
     * Commands to hand the agent on this poll. A refresh is one-shot (consumed
     * here); log streaming is a standing request that lapses on its own TTL.
     *
     * @return list<string>
     */
    public static function takeCommands(string $gatewayId): array
    {
        $commands = [];

        if (self::store()->pull(self::key($gatewayId, 'refresh'))) {
            $commands[] = 'refresh';
        }

        if (self::store()->get(self::key($gatewayId, 'stream'))) {
            $commands[] = 'logs';
        }

        return $commands;
    }

    // ── Agent log tail ───────────────────────────────────────────────────────

    /**
     * Append lines pushed by the agent. `runId` changes when the agent restarts:
     * its sequence numbers restart from 1 too, so the old tail is dropped rather
     * than interleaved with a fresh run that appears to precede it.
     *
     * @param  list<array{seq: int, ts?: ?string, level: string, text: string}>  $lines
     */
    public static function appendLogs(string $gatewayId, string $runId, array $lines): void
    {
        $key = self::key($gatewayId, 'logs');
        $entry = self::store()->get($key);

        if (! is_array($entry) || ($entry['run_id'] ?? null) !== $runId) {
            $entry = ['run_id' => $runId, 'lines' => []];
        }

        $known = $entry['lines'] ? max(array_column($entry['lines'], 'seq')) : 0;

        foreach ($lines as $line) {
            if ((int) $line['seq'] <= $known) {
                continue; // re-sent after a failed push
            }

            $entry['lines'][] = [
                'seq' => (int) $line['seq'],
                'ts' => $line['ts'] ?? now()->toISOString(),
                'level' => $line['level'],
                'text' => mb_substr((string) $line['text'], 0, self::MAX_LINE_CHARS),
            ];
        }

        if (count($entry['lines']) > self::MAX_LINES) {
            $entry['lines'] = array_slice($entry['lines'], -self::MAX_LINES);
        }

        $entry['updated_at'] = now()->toISOString();

        self::store()->put($key, $entry, self::LOG_TTL);
    }

    /**
     * @return array{run_id: ?string, lines: list<array{seq:int,ts:string,level:string,text:string}>, updated_at: ?string}
     */
    public static function logs(string $gatewayId, int $sinceSeq = 0): array
    {
        $entry = self::store()->get(self::key($gatewayId, 'logs'));

        if (! is_array($entry)) {
            return ['run_id' => null, 'lines' => [], 'updated_at' => null];
        }

        $lines = array_values(array_filter(
            $entry['lines'] ?? [],
            fn ($line) => (int) $line['seq'] > $sinceSeq,
        ));

        return [
            'run_id' => $entry['run_id'] ?? null,
            'lines' => $lines,
            'updated_at' => $entry['updated_at'] ?? null,
        ];
    }

    /** Drop everything for a gateway that's been removed. */
    public static function forget(string $gatewayId): void
    {
        foreach (['health', 'refresh', 'stream', 'logs'] as $suffix) {
            self::store()->forget(self::key($gatewayId, $suffix));
        }
    }
}
