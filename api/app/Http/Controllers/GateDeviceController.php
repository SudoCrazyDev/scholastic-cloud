<?php

namespace App\Http\Controllers;

use App\Models\GateDevice;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Admin CRUD for gate kiosk devices, scoped to the caller's default institution.
 * Gated on `gate-entries` rather than a new module slug: managing the readers at
 * the gate is the same job as reading their scan logs, and every role that
 * already does one should not have to be re-granted for the other.
 *
 * Mirrors SmsGatewayController, including the deliberately awkward part of that
 * UX: a pairing code is shown once, at the moment it is minted, and an admin who
 * navigates away mints a fresh one rather than reading the old one back.
 */
class GateDeviceController extends Controller
{
    private const PAIRING_TTL_MINUTES = 15;

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

        $query = GateDevice::where('institution_id', $institutionId);

        if ($request->filled('gate_type')) {
            $query->where('gate_type', $request->query('gate_type'));
        }

        $devices = $query->orderBy('created_at', 'desc')
            ->get()
            ->map(fn (GateDevice $device) => $this->formatDevice($device));

        return response()->json(['success' => true, 'data' => $devices]);
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
            'gate_type' => 'required|in:enter,exit,both',
        ]);

        $pairingCode = $this->mintCode();

        $device = GateDevice::create([
            'institution_id' => $institutionId,
            'name' => $validated['name'],
            'location' => $validated['location'] ?? null,
            'gate_type' => $validated['gate_type'],
            'pairing_code' => $pairingCode,
            'pairing_code_expires_at' => now()->addMinutes(self::PAIRING_TTL_MINUTES),
        ]);

        return response()->json([
            'success' => true,
            'data' => array_merge($this->formatDevice($device), ['pairing_code' => $pairingCode]),
            'message' => 'Device registered. Enter the pairing code on the kiosk within '
                .self::PAIRING_TTL_MINUTES.' minutes.',
        ], 201);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $device = $this->findScoped($request, $id);
        if (! $device) {
            return response()->json(['success' => false, 'message' => 'Device not found'], 404);
        }

        return response()->json(['success' => true, 'data' => $this->formatDevice($device)]);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $device = $this->findScoped($request, $id);
        if (! $device) {
            return response()->json(['success' => false, 'message' => 'Device not found'], 404);
        }

        $validated = $request->validate([
            'name' => 'sometimes|required|string|max:255',
            'location' => 'nullable|string|max:255',
            'gate_type' => 'sometimes|required|in:enter,exit,both',
        ]);

        $device->update($validated);

        return response()->json(['success' => true, 'data' => $this->formatDevice($device->fresh())]);
    }

    /**
     * Remove the device. Its token stops authenticating on the next call, which
     * is how a lost or stolen kiosk is cut off — the device sees a 401 and drops
     * its local roster and photos.
     */
    public function destroy(Request $request, string $id): JsonResponse
    {
        $device = $this->findScoped($request, $id);
        if (! $device) {
            return response()->json(['success' => false, 'message' => 'Device not found'], 404);
        }

        $device->delete();

        return response()->json(['success' => true, 'message' => 'Device removed']);
    }

    /**
     * Mint a fresh pairing code for a device that has not paired yet.
     */
    public function refreshPairingCode(Request $request, string $id): JsonResponse
    {
        $device = $this->findScoped($request, $id);
        if (! $device) {
            return response()->json(['success' => false, 'message' => 'Device not found'], 404);
        }

        if ($device->is_paired) {
            return response()->json([
                'success' => false,
                'message' => 'Device is already paired. Remove it and add a new one to re-provision.',
            ], 422);
        }

        $pairingCode = $this->mintCode();
        $device->update([
            'pairing_code' => $pairingCode,
            'pairing_code_expires_at' => now()->addMinutes(self::PAIRING_TTL_MINUTES),
        ]);

        return response()->json([
            'success' => true,
            'pairing_code' => $pairingCode,
            'expires_at' => $device->pairing_code_expires_at->toISOString(),
        ]);
    }

    /**
     * Revoke a paired device's token without deleting its row, so the same
     * physical kiosk can be handed a new code instead of being re-registered.
     */
    public function unpair(Request $request, string $id): JsonResponse
    {
        $device = $this->findScoped($request, $id);
        if (! $device) {
            return response()->json(['success' => false, 'message' => 'Device not found'], 404);
        }

        $pairingCode = $this->mintCode();

        $device->update([
            'device_token_hash' => null,
            'pairing_code' => $pairingCode,
            'pairing_code_expires_at' => now()->addMinutes(self::PAIRING_TTL_MINUTES),
            // Whatever it reported about its local copy describes a device that
            // is about to purge it. Keeping the numbers would read as current.
            'roster_count' => null,
            'pending_count' => null,
            'last_sync_at' => null,
            'clock_offset_ms' => null,
        ]);

        return response()->json([
            'success' => true,
            'pairing_code' => $pairingCode,
            'expires_at' => $device->pairing_code_expires_at->toISOString(),
            'message' => 'Device unpaired. It will sign out and clear its local copy on its next call.',
        ]);
    }

    /**
     * Codes are read aloud and typed on a touchscreen, so the alphabet excludes
     * the characters that get misread: 0/O, 1/I/L, 5/S, 8/B.
     */
    private function mintCode(): string
    {
        $alphabet = 'ACDEFGHJKMNPQRTUVWXY2346789';

        return collect(range(1, 6))
            ->map(fn () => $alphabet[random_int(0, strlen($alphabet) - 1)])
            ->implode('');
    }

    private function findScoped(Request $request, string $id): ?GateDevice
    {
        $institutionId = $this->institutionId($request);
        if (! $institutionId) {
            return null;
        }

        return GateDevice::where('institution_id', $institutionId)->find($id);
    }

    /**
     * @return array<string, mixed>
     */
    private function formatDevice(GateDevice $device): array
    {
        return [
            'id' => $device->id,
            'institution_id' => $device->institution_id,
            'name' => $device->name,
            'location' => $device->location,
            'gate_type' => $device->gate_type,
            'status' => $device->computed_status,
            'is_paired' => $device->is_paired,
            'roster_count' => $device->roster_count,
            'pending_count' => $device->pending_count,
            'clock_offset_ms' => $device->clock_offset_ms,
            'clock_suspect' => $device->clock_suspect,
            'app_version' => $device->app_version,
            'last_seen_at' => $device->last_seen_at?->toISOString(),
            'last_sync_at' => $device->last_sync_at?->toISOString(),
            // The code itself is never listed — only whether one is still live.
            'pairing_code_expires_at' => $device->pairing_code_expires_at?->toISOString(),
            'created_at' => $device->created_at->toISOString(),
            'updated_at' => $device->updated_at->toISOString(),
        ];
    }
}
