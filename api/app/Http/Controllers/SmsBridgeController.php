<?php

namespace App\Http\Controllers;

use App\Models\SmsGateway;
use App\Models\SmsMessage;
use App\Models\SmsOptOut;
use App\Models\SmsSetting;
use App\Services\SmsService;
use App\Support\GatewayRuntime;
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
            // Modem presence is separate from agent presence: the daemon can be
            // perfectly healthy while the USB dongle is unplugged.
            'modem_connected' => 'nullable|boolean',
            'modem_error' => 'nullable|string|max:255',
            'modem_port' => 'nullable|string|max:128',
        ]);

        $online = $validated['online'] ?? true;

        if (array_key_exists('modem_connected', $validated)) {
            GatewayRuntime::putHealth($gateway->id, [
                'connected' => (bool) $validated['modem_connected'],
                'error' => $validated['modem_error'] ?? null,
                'port' => $validated['modem_port'] ?? null,
            ]);
        }

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

        // The portal cannot push, so anything an admin asked for rides back on
        // this poll. Resolved before any early return, or a rate-limited gateway
        // would never receive a refresh request.
        $commands = GatewayRuntime::takeCommands($gateway->id);

        // Resolve anything a previous run claimed but never reported on. Does not gate
        // this poll — `sending` rows never blocked the claim, which only selects `queued`.
        // Runs here so the module needs no cron to self-heal.
        app(SmsService::class)->reapStuck($gateway->institution_id);

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
            return response()->json(['success' => true, 'data' => [], 'commands' => $commands]);
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

        return response()->json(['success' => true, 'data' => $data, 'commands' => $commands]);
    }

    /**
     * Kiosk pushes the tail of its agent log so the portal can show what
     * `npm run logs` would show on the device. Kept in the file cache only —
     * this is a live view, not an audit trail, and never hits the database.
     * Body: {run_id, lines: [{seq, ts, level, text}]}
     */
    public function logs(Request $request): JsonResponse
    {
        /** @var SmsGateway $gateway */
        $gateway = $request->attributes->get('sms_gateway');

        $validated = $request->validate([
            'run_id' => 'required|string|max:64',
            'lines' => 'present|array|max:200',
            'lines.*.seq' => 'required|integer|min:1',
            'lines.*.ts' => 'nullable|string|max:40',
            'lines.*.level' => 'required|in:debug,info,warn,error',
            'lines.*.text' => 'present|string',
        ]);

        GatewayRuntime::appendLogs($gateway->id, $validated['run_id'], $validated['lines']);

        return response()->json(['success' => true, 'stored' => count($validated['lines'])]);
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
                ->where(function ($q) {
                    // A reaped row is terminal only because we gave up waiting. If the
                    // agent finally reports, its result is authoritative — otherwise the
                    // reaper would leave a genuinely-sent message showing as failed.
                    $q->whereIn('status', ['sending', 'queued'])
                        ->orWhere(fn ($r) => $r->where('status', 'failed')
                            ->where('error', SmsMessage::REAPED_ERROR));
                })
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
