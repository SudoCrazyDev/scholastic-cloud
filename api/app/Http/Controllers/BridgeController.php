<?php

namespace App\Http\Controllers;

use App\Models\BiometricDevice;
use App\Models\ZkUserMapping;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class BridgeController extends Controller
{
    /**
     * Exchange a pairing code for a long-lived bridge token.
     * The bridge sends this on first launch after the admin creates the device in the web UI.
     */
    public function pair(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'pairing_code' => 'required|string',
            'mac_address'  => 'nullable|string|max:64',
            'serial_number' => 'nullable|string|max:128',
            'firmware_version' => 'nullable|string|max:64',
        ]);

        $device = BiometricDevice::where('pairing_code', $validated['pairing_code'])
            ->whereNotNull('pairing_code_expires_at')
            ->where('pairing_code_expires_at', '>', now())
            ->whereNull('bridge_token_hash') // already paired devices cannot re-pair with code
            ->first();

        if (!$device) {
            return response()->json(['message' => 'Invalid or expired pairing code'], 422);
        }

        $plainToken = Str::random(64);
        $hash = hash('sha256', $plainToken);

        $device->update([
            'bridge_token_hash'     => $hash,
            'pairing_code'          => null,
            'pairing_code_expires_at' => null,
            'mac_address'           => $validated['mac_address'] ?? $device->mac_address,
            'serial_number'         => $validated['serial_number'] ?? $device->serial_number,
            'firmware_version'      => $validated['firmware_version'] ?? $device->firmware_version,
            'status'                => 'unknown',
        ]);

        return response()->json([
            'success' => true,
            'token'   => $plainToken,
            'device_id' => $device->id,
        ]);
    }

    /**
     * Receive a heartbeat from the bridge agent.
     * Updates last_seen_at and recomputes online status.
     */
    public function heartbeat(Request $request): JsonResponse
    {
        /** @var BiometricDevice $device */
        $device = $request->attributes->get('bridge_device');

        $validated = $request->validate([
            'device_online'   => 'required|boolean',
            'firmware_version' => 'nullable|string|max:64',
            'serial_number'   => 'nullable|string|max:128',
            'mac_address'     => 'nullable|string|max:64',
        ]);

        // Reject if MAC changed after initial pairing (tamper check)
        if (
            $device->mac_address
            && isset($validated['mac_address'])
            && $validated['mac_address'] !== $device->mac_address
        ) {
            return response()->json(['message' => 'MAC address mismatch'], 403);
        }

        $device->update([
            'last_seen_at'    => now(),
            'status'          => $validated['device_online'] ? 'online' : 'offline',
            'firmware_version' => $validated['firmware_version'] ?? $device->firmware_version,
            'serial_number'   => $validated['serial_number'] ?? $device->serial_number,
            'mac_address'     => $validated['mac_address'] ?? $device->mac_address,
        ]);

        return response()->json(['success' => true]);
    }

    /**
     * Return pending enrollment/fingerprint jobs for this device.
     * Bridge polls this every 30 seconds.
     */
    public function pendingEnrollments(Request $request): JsonResponse
    {
        /** @var BiometricDevice $device */
        $device = $request->attributes->get('bridge_device');

        $mappings = ZkUserMapping::where('device_id', $device->id)
            ->where('push_status', 'pending')
            ->with('user')
            ->get()
            ->map(fn ($m) => [
                'id'          => $m->id,
                'zk_user_id'  => $m->zk_user_id,
                'zk_name'     => $m->zk_name,
                'push_action' => $m->push_action,
                'user'        => $m->user ? [
                    'id'         => $m->user->id,
                    'first_name' => $m->user->first_name,
                    'last_name'  => $m->user->last_name,
                ] : null,
            ]);

        return response()->json(['success' => true, 'data' => $mappings]);
    }

    /**
     * Bridge reports results of enrollment jobs.
     * Body: [{mapping_id, success, error?}]
     */
    public function enrollmentDone(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'results'              => 'required|array',
            'results.*.mapping_id' => 'required|uuid',
            'results.*.success'    => 'required|boolean',
            'results.*.error'      => 'nullable|string|max:500',
        ]);

        foreach ($validated['results'] as $result) {
            ZkUserMapping::where('id', $result['mapping_id'])->update([
                'push_status' => $result['success'] ? 'done' : 'failed',
                'push_error'  => $result['success'] ? null : ($result['error'] ?? 'Unknown error'),
            ]);
        }

        return response()->json(['success' => true]);
    }

    /**
     * Bulk-upsert ZKTeco users sent by the bridge.
     */
    public function syncUsers(Request $request): JsonResponse
    {
        /** @var BiometricDevice $device */
        $device = $request->attributes->get('bridge_device');

        $validated = $request->validate([
            'users'               => 'present|array',
            'users.*.zk_user_id'  => 'required|string|max:64',
            'users.*.zk_name'     => 'nullable|string|max:255',
            'users.*.zk_card_no'  => 'nullable|string|max:64',
            'users.*.zk_privilege' => 'nullable|string|max:32',
        ]);

        $now = now();
        $upserted = 0;

        foreach ($validated['users'] as $zkUser) {
            ZkUserMapping::updateOrCreate(
                [
                    'device_id'  => $device->id,
                    'zk_user_id' => $zkUser['zk_user_id'],
                ],
                [
                    'institution_id' => $device->institution_id,
                    'zk_name'        => $zkUser['zk_name'] ?? null,
                    'zk_card_no'     => $zkUser['zk_card_no'] ?? null,
                    'zk_privilege'   => $zkUser['zk_privilege'] ?? null,
                    'last_synced_at' => $now,
                ]
            );
            $upserted++;
        }

        return response()->json([
            'success'  => true,
            'upserted' => $upserted,
        ]);
    }
}
