<?php

namespace App\Http\Controllers;

use App\Models\SmsGateway;
use App\Models\SmsMessage;
use App\Models\SmsOptOut;
use App\Models\SmsSetting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Agent-facing endpoints for the on-prem SMS kiosk. Mirrors BridgeController:
 * a public pairing exchange plus a token-guarded surface the daemon polls.
 */
class SmsBridgeController extends Controller
{
    /**
     * Exchange a pairing code for a long-lived gateway token. The kiosk sends this
     * on first launch after the admin registers the gateway in the web UI.
     */
    public function pair(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'pairing_code' => 'required|string',
            'imei' => 'nullable|string|max:64',
            'modem_model' => 'nullable|string|max:128',
            'platform' => 'nullable|in:linux,windows,unknown',
            'agent_version' => 'nullable|string|max:64',
        ]);

        $gateway = SmsGateway::where('pairing_code', $validated['pairing_code'])
            ->whereNotNull('pairing_code_expires_at')
            ->where('pairing_code_expires_at', '>', now())
            ->whereNull('sms_token_hash') // already-paired gateways cannot re-pair with a code
            ->first();

        if (! $gateway) {
            return response()->json(['message' => 'Invalid or expired pairing code'], 422);
        }

        $plainToken = Str::random(64);

        $gateway->update([
            'sms_token_hash' => hash('sha256', $plainToken),
            'pairing_code' => null,
            'pairing_code_expires_at' => null,
            'imei' => $validated['imei'] ?? $gateway->imei,
            'modem_model' => $validated['modem_model'] ?? $gateway->modem_model,
            'platform' => $validated['platform'] ?? $gateway->platform,
            'agent_version' => $validated['agent_version'] ?? $gateway->agent_version,
            'status' => 'unknown',
        ]);

        return response()->json([
            'success' => true,
            'token' => $plainToken,
            'gateway_id' => $gateway->id,
        ]);
    }

    /**
     * Receive a heartbeat from the kiosk. Updates presence + modem telemetry.
     */
    public function heartbeat(Request $request): JsonResponse
    {
        /** @var SmsGateway $gateway */
        $gateway = $request->attributes->get('sms_gateway');

        $validated = $request->validate([
            'online' => 'nullable|boolean',
            'signal_strength' => 'nullable|integer|min:0|max:99',
            'network_operator' => 'nullable|string|max:64',
            'sim_msisdn' => 'nullable|string|max:32',
            'sim_balance' => 'nullable|string|max:64',
            'imei' => 'nullable|string|max:64',
            'modem_model' => 'nullable|string|max:128',
            'platform' => 'nullable|in:linux,windows,unknown',
            'agent_version' => 'nullable|string|max:64',
        ]);

        $online = $validated['online'] ?? true;

        $gateway->update([
            'last_seen_at' => now(),
            'status' => $online ? 'online' : 'offline',
            'signal_strength' => $validated['signal_strength'] ?? $gateway->signal_strength,
            'network_operator' => $validated['network_operator'] ?? $gateway->network_operator,
            'sim_msisdn' => $validated['sim_msisdn'] ?? $gateway->sim_msisdn,
            'sim_balance' => $validated['sim_balance'] ?? $gateway->sim_balance,
            'imei' => $validated['imei'] ?? $gateway->imei,
            'modem_model' => $validated['modem_model'] ?? $gateway->modem_model,
            'platform' => $validated['platform'] ?? $gateway->platform,
            'agent_version' => $validated['agent_version'] ?? $gateway->agent_version,
        ]);

        return response()->json(['success' => true]);
    }

    /**
     * Claim the next batch of queued outbound messages for this gateway. Atomically
     * flips them to 'sending' and assigns the gateway so no other kiosk grabs them.
     * Respects the institution's per-minute rate limit.
     */
    public function outbox(Request $request): JsonResponse
    {
        /** @var SmsGateway $gateway */
        $gateway = $request->attributes->get('sms_gateway');

        $requested = (int) $request->query('limit', 10);
        $requested = max(1, min($requested, 50));

        $rateLimit = SmsSetting::where('institution_id', $gateway->institution_id)
            ->value('rate_limit_per_minute') ?? 20;

        // Throughput already used by this gateway in the trailing minute.
        $recent = SmsMessage::where('gateway_id', $gateway->id)
            ->where('direction', 'outbound')
            ->whereIn('status', ['sending', 'sent', 'delivered', 'failed'])
            ->where('updated_at', '>=', now()->subMinute())
            ->count();

        $remaining = max(0, $rateLimit - $recent);
        $limit = min($requested, $remaining);

        if ($limit <= 0) {
            return response()->json(['success' => true, 'data' => []]);
        }

        $claimed = DB::transaction(function () use ($gateway, $limit) {
            $rows = SmsMessage::where('institution_id', $gateway->institution_id)
                ->where('direction', 'outbound')
                ->where('status', 'queued')
                ->where(function ($q) use ($gateway) {
                    $q->whereNull('gateway_id')->orWhere('gateway_id', $gateway->id);
                })
                ->where(function ($q) {
                    $q->whereNull('scheduled_at')->orWhere('scheduled_at', '<=', now());
                })
                ->orderBy('created_at')
                ->limit($limit)
                ->lockForUpdate()
                ->get();

            foreach ($rows as $row) {
                $row->update(['gateway_id' => $gateway->id, 'status' => 'sending']);
            }

            return $rows;
        });

        $data = $claimed->map(fn (SmsMessage $m) => [
            'id' => $m->id,
            'to_number' => $m->to_number,
            'body' => $m->body,
        ]);

        return response()->json(['success' => true, 'data' => $data]);
    }

    /**
     * Kiosk reports send results. Idempotent: rows already in a terminal state are
     * left untouched. Body: {results: [{id, status, provider_ref?, segments?, error?, sent_at?}]}
     */
    public function outboxStatus(Request $request): JsonResponse
    {
        /** @var SmsGateway $gateway */
        $gateway = $request->attributes->get('sms_gateway');

        $validated = $request->validate([
            'results' => 'required|array',
            'results.*.id' => 'required|uuid',
            'results.*.status' => 'required|in:sent,failed',
            'results.*.provider_ref' => 'nullable|string|max:128',
            'results.*.segments' => 'nullable|integer|min:1',
            'results.*.error' => 'nullable|string|max:500',
            'results.*.sent_at' => 'nullable|date',
        ]);

        $updated = 0;

        foreach ($validated['results'] as $result) {
            $message = SmsMessage::where('id', $result['id'])
                ->where('gateway_id', $gateway->id)
                ->whereIn('status', ['sending', 'queued'])
                ->first();

            if (! $message) {
                continue; // unknown, not ours, or already terminal — idempotent no-op
            }

            $message->update([
                'status' => $result['status'],
                'provider_ref' => $result['provider_ref'] ?? $message->provider_ref,
                'segments' => $result['segments'] ?? $message->segments,
                'error' => $result['status'] === 'failed' ? ($result['error'] ?? 'Send failed') : null,
                'sent_at' => $result['status'] === 'sent' ? ($result['sent_at'] ?? now()) : $message->sent_at,
            ]);

            $updated++;
        }

        return response()->json(['success' => true, 'updated' => $updated]);
    }

    /**
     * Kiosk relays network delivery reports (+CDS) keyed by the modem message
     * reference captured at send time. Body: {reports: [{provider_ref, status, delivered_at?}]}
     */
    public function deliveryReports(Request $request): JsonResponse
    {
        /** @var SmsGateway $gateway */
        $gateway = $request->attributes->get('sms_gateway');

        $validated = $request->validate([
            'reports' => 'required|array',
            'reports.*.provider_ref' => 'required|string|max:128',
            'reports.*.status' => 'required|in:delivered,failed',
            'reports.*.delivered_at' => 'nullable|date',
        ]);

        $updated = 0;

        foreach ($validated['reports'] as $report) {
            $message = SmsMessage::where('gateway_id', $gateway->id)
                ->where('provider_ref', $report['provider_ref'])
                ->where('direction', 'outbound')
                ->first();

            if (! $message) {
                continue;
            }

            $message->update([
                'status' => $report['status'],
                'delivered_at' => $report['status'] === 'delivered'
                    ? ($report['delivered_at'] ?? now())
                    : $message->delivered_at,
                'error' => $report['status'] === 'failed'
                    ? ($message->error ?? 'Delivery failed')
                    : $message->error,
            ]);

            $updated++;
        }

        return response()->json(['success' => true, 'updated' => $updated]);
    }

    /**
     * Kiosk uploads received SMS. Deduped on (from, received_at, body). Numbers whose
     * body matches an opt-out keyword are recorded on the opt-out list.
     * Body: {messages: [{from, body, received_at?}]}
     */
    public function inbox(Request $request): JsonResponse
    {
        /** @var SmsGateway $gateway */
        $gateway = $request->attributes->get('sms_gateway');

        $validated = $request->validate([
            'messages' => 'present|array',
            'messages.*.from' => 'required|string|max:32',
            'messages.*.body' => 'required|string',
            'messages.*.received_at' => 'nullable|date',
        ]);

        $keywords = collect(explode(',', (string) (SmsSetting::where('institution_id', $gateway->institution_id)
            ->value('opt_out_keywords') ?? 'STOP')))
            ->map(fn ($k) => strtoupper(trim($k)))
            ->filter()
            ->all();

        $stored = 0;

        foreach ($validated['messages'] as $incoming) {
            $receivedAt = $incoming['received_at'] ?? now();

            $exists = SmsMessage::where('gateway_id', $gateway->id)
                ->where('direction', 'inbound')
                ->where('from_number', $incoming['from'])
                ->where('body', $incoming['body'])
                ->where('received_at', $receivedAt)
                ->exists();

            if ($exists) {
                continue; // dedupe
            }

            SmsMessage::create([
                'id' => (string) Str::uuid(),
                'institution_id' => $gateway->institution_id,
                'gateway_id' => $gateway->id,
                'direction' => 'inbound',
                'from_number' => $incoming['from'],
                'body' => $incoming['body'],
                'status' => 'received',
                'received_at' => $receivedAt,
            ]);

            $stored++;

            // Honor opt-out keywords (e.g. "STOP").
            if (in_array(strtoupper(trim($incoming['body'])), $keywords, true)) {
                SmsOptOut::firstOrCreate([
                    'institution_id' => $gateway->institution_id,
                    'number' => $incoming['from'],
                ]);
            }
        }

        return response()->json(['success' => true, 'stored' => $stored]);
    }
}
