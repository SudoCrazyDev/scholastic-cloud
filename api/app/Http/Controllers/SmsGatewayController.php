<?php

namespace App\Http\Controllers;

use App\Models\SmsGateway;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class SmsGatewayController extends Controller
{
    private function institutionId(Request $request): ?string
    {
        return $request->user()->userInstitutions()
            ->where('is_default', true)
            ->value('institution_id');
    }

    public function index(Request $request): JsonResponse
    {
        $institutionId = $this->institutionId($request);
        if (! $institutionId) {
            return response()->json(['success' => false, 'message' => 'No default institution'], 403);
        }

        $gateways = SmsGateway::where('institution_id', $institutionId)
            ->orderBy('created_at', 'desc')
            ->get()
            ->map(fn ($g) => $this->formatGateway($g));

        return response()->json(['success' => true, 'data' => $gateways]);
    }

    public function store(Request $request): JsonResponse
    {
        $institutionId = $this->institutionId($request);
        if (! $institutionId) {
            return response()->json(['success' => false, 'message' => 'No default institution'], 403);
        }

        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'location' => 'nullable|string|max:255',
        ]);

        $pairingCode = strtoupper(Str::random(6));

        $gateway = SmsGateway::create([
            'institution_id' => $institutionId,
            'name' => $validated['name'],
            'location' => $validated['location'] ?? null,
            'pairing_code' => $pairingCode,
            'pairing_code_expires_at' => now()->addMinutes(15),
            'status' => 'unknown',
        ]);

        return response()->json([
            'success' => true,
            'data' => array_merge($this->formatGateway($gateway), ['pairing_code' => $pairingCode]),
            'message' => 'Gateway registered. Enter the pairing code in the kiosk agent within 15 minutes.',
        ], 201);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $gateway = $this->findScoped($request, $id);
        if (! $gateway) {
            return response()->json(['success' => false, 'message' => 'Gateway not found'], 404);
        }

        return response()->json(['success' => true, 'data' => $this->formatGateway($gateway)]);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $gateway = $this->findScoped($request, $id);
        if (! $gateway) {
            return response()->json(['success' => false, 'message' => 'Gateway not found'], 404);
        }

        $validated = $request->validate([
            'name' => 'sometimes|required|string|max:255',
            'location' => 'nullable|string|max:255',
        ]);

        $gateway->update($validated);

        return response()->json(['success' => true, 'data' => $this->formatGateway($gateway->fresh())]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $gateway = $this->findScoped($request, $id);
        if (! $gateway) {
            return response()->json(['success' => false, 'message' => 'Gateway not found'], 404);
        }

        $gateway->delete();

        return response()->json(['success' => true, 'message' => 'Gateway removed']);
    }

    public function refreshPairingCode(Request $request, string $id): JsonResponse
    {
        $gateway = $this->findScoped($request, $id);
        if (! $gateway) {
            return response()->json(['success' => false, 'message' => 'Gateway not found'], 404);
        }

        if ($gateway->sms_token_hash) {
            return response()->json(['success' => false, 'message' => 'Gateway is already paired'], 422);
        }

        $pairingCode = strtoupper(Str::random(6));
        $gateway->update([
            'pairing_code' => $pairingCode,
            'pairing_code_expires_at' => now()->addMinutes(15),
        ]);

        return response()->json([
            'success' => true,
            'pairing_code' => $pairingCode,
            'expires_at' => $gateway->pairing_code_expires_at,
        ]);
    }

    /**
     * Download a ready-to-use agent config (.env) for this gateway. The API base URL
     * is derived from the tenant portal the admin is on, and a valid pairing code is
     * baked in so the on-site tech only has to drop the file and run the installer.
     */
    public function installer(Request $request, string $id)
    {
        $gateway = $this->findScoped($request, $id);
        if (! $gateway) {
            return response('Gateway not found', 404);
        }

        $apiBaseUrl = rtrim($request->getSchemeAndHttpHost(), '/').'/api';

        if (! $gateway->sms_token_hash) {
            // Ensure a currently-valid pairing code so the download works right away.
            if (! $gateway->pairing_code
                || ! $gateway->pairing_code_expires_at
                || $gateway->pairing_code_expires_at->isPast()) {
                $gateway->update([
                    'pairing_code' => strtoupper(Str::random(6)),
                    'pairing_code_expires_at' => now()->addMinutes(15),
                ]);
            }
            $pairingNote = "# Pairing code: {$gateway->pairing_code} (expires {$gateway->pairing_code_expires_at->toDateTimeString()})\n"
                ."# After install, pair with:  npm run pair -- {$gateway->pairing_code}";
        } else {
            $pairingNote = "# This gateway is already paired. Its token stays on the device;\n"
                .'# to re-provision, remove it in the portal and add a new gateway.';
        }

        $generatedAt = now()->toDateTimeString();

        $env = <<<ENV
# ScholasticCloud SMS Gateway config for "{$gateway->name}"
# Generated {$generatedAt}. Place this file in the sms_gateway folder as
# `.env` (or keep the name `sms-gateway.env` — the agent reads either).

API_BASE_URL={$apiBaseUrl}
SMS_GATEWAY_TOKEN=

# Leave SERIAL_PORT blank to auto-detect the modem.
SERIAL_PORT=
SERIAL_BAUD=115200
SMS_MODE=pdu

OUTBOX_POLL_MS=5000
INBOX_POLL_MS=10000
HEARTBEAT_MS=45000
OUTBOX_BATCH=10
USSD_BALANCE_CODE=
LOG_LEVEL=info

{$pairingNote}

ENV;

        return response($env, 200)
            ->header('Content-Type', 'text/plain; charset=utf-8')
            ->header('Content-Disposition', 'attachment; filename="sms-gateway.env"');
    }

    private function findScoped(Request $request, string $id): ?SmsGateway
    {
        $institutionId = $this->institutionId($request);
        if (! $institutionId) {
            return null;
        }

        return SmsGateway::where('institution_id', $institutionId)->find($id);
    }

    private function formatGateway(SmsGateway $gateway): array
    {
        return [
            'id' => $gateway->id,
            'institution_id' => $gateway->institution_id,
            'name' => $gateway->name,
            'location' => $gateway->location,
            'platform' => $gateway->platform,
            'status' => $gateway->computed_status,
            'is_paired' => $gateway->sms_token_hash !== null,
            'signal_strength' => $gateway->signal_strength,
            'network_operator' => $gateway->network_operator,
            'sim_msisdn' => $gateway->sim_msisdn,
            'sim_balance' => $gateway->sim_balance,
            'imei' => $gateway->imei,
            'modem_model' => $gateway->modem_model,
            'agent_version' => $gateway->agent_version,
            'last_seen_at' => $gateway->last_seen_at?->toISOString(),
            'pairing_code_expires_at' => $gateway->pairing_code_expires_at?->toISOString(),
            'created_at' => $gateway->created_at->toISOString(),
            'updated_at' => $gateway->updated_at->toISOString(),
        ];
    }
}
