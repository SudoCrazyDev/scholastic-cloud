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
