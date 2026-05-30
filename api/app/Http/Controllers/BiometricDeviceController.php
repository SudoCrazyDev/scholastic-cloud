<?php

namespace App\Http\Controllers;

use App\Models\BiometricDevice;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class BiometricDeviceController extends Controller
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
        if (!$institutionId) {
            return response()->json(['success' => false, 'message' => 'No default institution'], 403);
        }

        $devices = BiometricDevice::where('institution_id', $institutionId)
            ->orderBy('created_at', 'desc')
            ->get()
            ->map(fn ($d) => $this->formatDevice($d));

        return response()->json(['success' => true, 'data' => $devices]);
    }

    public function store(Request $request): JsonResponse
    {
        $institutionId = $this->institutionId($request);
        if (!$institutionId) {
            return response()->json(['success' => false, 'message' => 'No default institution'], 403);
        }

        $validated = $request->validate([
            'name' => 'required|string|max:255',
        ]);

        $pairingCode = strtoupper(Str::random(6));

        $device = BiometricDevice::create([
            'institution_id'          => $institutionId,
            'name'                    => $validated['name'],
            'pairing_code'            => $pairingCode,
            'pairing_code_expires_at' => now()->addMinutes(15),
            'status'                  => 'unknown',
        ]);

        return response()->json([
            'success' => true,
            'data'    => array_merge($this->formatDevice($device), ['pairing_code' => $pairingCode]),
            'message' => 'Device registered. Use the pairing code in the bridge app within 15 minutes.',
        ], 201);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $institutionId = $this->institutionId($request);
        if (!$institutionId) {
            return response()->json(['success' => false, 'message' => 'No default institution'], 403);
        }

        $device = BiometricDevice::where('institution_id', $institutionId)->find($id);
        if (!$device) {
            return response()->json(['success' => false, 'message' => 'Device not found'], 404);
        }

        return response()->json(['success' => true, 'data' => $this->formatDevice($device)]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $institutionId = $this->institutionId($request);
        if (!$institutionId) {
            return response()->json(['success' => false, 'message' => 'No default institution'], 403);
        }

        $device = BiometricDevice::where('institution_id', $institutionId)->find($id);
        if (!$device) {
            return response()->json(['success' => false, 'message' => 'Device not found'], 404);
        }

        $device->delete();

        return response()->json(['success' => true, 'message' => 'Device removed']);
    }

    /**
     * Refresh (regenerate) the pairing code for an unpaired device.
     */
    public function refreshPairingCode(Request $request, string $id): JsonResponse
    {
        $institutionId = $this->institutionId($request);
        if (!$institutionId) {
            return response()->json(['success' => false, 'message' => 'No default institution'], 403);
        }

        $device = BiometricDevice::where('institution_id', $institutionId)->find($id);
        if (!$device) {
            return response()->json(['success' => false, 'message' => 'Device not found'], 404);
        }

        if ($device->bridge_token_hash) {
            return response()->json(['success' => false, 'message' => 'Device is already paired'], 422);
        }

        $pairingCode = strtoupper(Str::random(6));
        $device->update([
            'pairing_code'            => $pairingCode,
            'pairing_code_expires_at' => now()->addMinutes(15),
        ]);

        return response()->json([
            'success'      => true,
            'pairing_code' => $pairingCode,
            'expires_at'   => $device->pairing_code_expires_at,
        ]);
    }

    private function formatDevice(BiometricDevice $device): array
    {
        return [
            'id'              => $device->id,
            'institution_id'  => $device->institution_id,
            'name'            => $device->name,
            'serial_number'   => $device->serial_number,
            'mac_address'     => $device->mac_address,
            'firmware_version' => $device->firmware_version,
            'status'          => $device->computed_status,
            'is_paired'       => $device->bridge_token_hash !== null,
            'last_seen_at'    => $device->last_seen_at?->toISOString(),
            'pairing_code_expires_at' => $device->pairing_code_expires_at?->toISOString(),
            'created_at'      => $device->created_at->toISOString(),
            'updated_at'      => $device->updated_at->toISOString(),
        ];
    }
}
