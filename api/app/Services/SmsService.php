<?php

namespace App\Services;

use App\Models\SmsMessage;
use App\Models\SmsOptOut;
use App\Models\SmsSetting;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class SmsService
{
    /**
     * How long a row may sit in `sending` before the reaper gives up on it. Generous
     * next to the agent's 30s CMGS timeout — this is for an agent that died mid-batch
     * or could not report its results, not for a slow modem.
     */
    public const STUCK_AFTER_MINUTES = 10;

    /**
     * Resolve outbound rows a gateway claimed but never reported on. Without this they
     * sit in `sending` forever: never sent, never failed, never re-claimed (the outbox
     * only selects `queued`), and with no Retry available since that requires `failed`.
     *
     * They block nothing while stuck — the queue keeps flowing past them, and they stop
     * counting against the trailing-minute budget 60s after being claimed. This is about
     * not stranding a message, not about throughput.
     *
     * Marking them `failed` matches the module's no-auto-retry rule — the number is
     * skipped and stays visible + manually retryable on the Messages screen.
     *
     * @return int rows reaped
     */
    public function reapStuck(?string $institutionId = null, ?int $minutes = null): int
    {
        $cutoff = now()->subMinutes($minutes ?? self::STUCK_AFTER_MINUTES);

        return SmsMessage::where('direction', 'outbound')
            ->where('status', 'sending')
            ->where('updated_at', '<', $cutoff)
            ->when($institutionId, fn ($q) => $q->where('institution_id', $institutionId))
            ->update([
                'status' => 'failed',
                'error' => SmsMessage::REAPED_ERROR,
                // Freeze updated_at deliberately. The outbox budget counts rows touched in
                // the trailing minute, so bumping it would throttle the gateway at exactly
                // the moment it is recovering — and the throughput really happened at claim time.
                'updated_at' => DB::raw('updated_at'),
            ]);
    }

    /**
     * Queue one or more outbound SMS for an institution. One sms_messages row is
     * created per recipient. Numbers on the institution's opt-out list are skipped.
     *
     * This is the seam other modules (Announcements, Finance, Attendance) call to
     * send SMS — the kiosk agent pulls queued rows via the outbox endpoint.
     *
     * @param  string|string[]  $to
     * @param  array{source?:string,source_type?:string,source_id?:string,gateway_id?:string,scheduled_at?:string,queued_by?:string}  $opts
     * @return string[] IDs of the created messages
     */
    public function queue(string $institutionId, string|array $to, string $body, array $opts = []): array
    {
        $numbers = collect(is_array($to) ? $to : [$to])
            ->map(fn ($n) => $this->normalizeNumber($n))
            ->filter()
            ->unique()
            ->values();

        if ($numbers->isEmpty()) {
            return [];
        }

        $settings = SmsSetting::where('institution_id', $institutionId)->first();
        $gatewayId = $opts['gateway_id'] ?? $settings?->default_gateway_id;

        $optedOut = SmsOptOut::where('institution_id', $institutionId)
            ->whereIn('number', $numbers->all())
            ->pluck('number')
            ->all();

        $segments = $this->countSegments($body);
        $ids = [];

        foreach ($numbers as $number) {
            if (in_array($number, $optedOut, true)) {
                continue;
            }

            $message = SmsMessage::create([
                'id' => (string) Str::uuid(),
                'institution_id' => $institutionId,
                'gateway_id' => $gatewayId,
                'direction' => 'outbound',
                'to_number' => $number,
                'body' => $body,
                'status' => 'queued',
                'segments' => $segments,
                'source' => $opts['source'] ?? 'manual',
                'source_type' => $opts['source_type'] ?? null,
                'source_id' => $opts['source_id'] ?? null,
                'queued_by' => $opts['queued_by'] ?? null,
                'scheduled_at' => $opts['scheduled_at'] ?? null,
            ]);

            $ids[] = $message->id;
        }

        return $ids;
    }

    /**
     * Estimate the number of GSM segments a body will use. UCS2 (Unicode) messages
     * pack fewer characters per segment than GSM-7. This is an estimate for display
     * and billing hints; the modem does the authoritative segmentation.
     */
    public function countSegments(string $body): int
    {
        $length = mb_strlen($body);
        $isUnicode = $this->needsUnicode($body);

        $single = $isUnicode ? 70 : 160;
        $multi = $isUnicode ? 67 : 153;

        if ($length <= $single) {
            return 1;
        }

        return (int) ceil($length / $multi);
    }

    private function needsUnicode(string $body): bool
    {
        // Any character outside the basic GSM-7 latin range forces UCS2 encoding.
        return (bool) preg_match('/[^\x00-\x7F]/', $body);
    }

    /**
     * Light normalization: trim, strip spaces/dashes/parens. We keep a leading '+'.
     * Deliberately conservative — locale-aware formatting is the caller's job.
     */
    private function normalizeNumber(string $number): ?string
    {
        $cleaned = preg_replace('/[\s\-().]/', '', trim($number));

        return $cleaned === '' ? null : $cleaned;
    }
}
