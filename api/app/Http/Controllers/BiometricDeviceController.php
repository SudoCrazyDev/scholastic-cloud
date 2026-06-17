<?php

namespace App\Http\Controllers;

use App\Models\AttendanceLog;
use App\Models\BiometricDevice;
use App\Models\DeviceCommand;
use App\Models\ZkUserMapping;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
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
            'name'          => 'required|string|max:255',
            'serial_number' => 'nullable|string|max:128',
        ]);

        $serial = $validated['serial_number'] ? trim($validated['serial_number']) : null;

        // ── Direct-ADMS path: register/claim by serial number ──────────────────
        // The device sends no auth, so it's identified purely by its serial. If it
        // already auto-registered (possibly under another institution), claim it
        // into this one — the serial is proof of physical possession.
        if ($serial) {
            $existing = BiometricDevice::where('serial_number', $serial)->first();

            if ($existing) {
                DB::transaction(function () use ($existing, $institutionId, $validated) {
                    $existing->update([
                        'institution_id' => $institutionId,
                        'name'           => $validated['name'],
                    ]);
                    ZkUserMapping::where('device_id', $existing->id)->update(['institution_id' => $institutionId]);
                    AttendanceLog::where('device_id', $existing->id)->update(['institution_id' => $institutionId]);
                    DeviceCommand::where('device_id', $existing->id)->update(['institution_id' => $institutionId]);
                });

                return response()->json([
                    'success' => true,
                    'data'    => $this->formatDevice($existing->fresh()),
                    'message' => 'Device claimed and linked to your institution.',
                ]);
            }

            $device = BiometricDevice::create([
                'institution_id' => $institutionId,
                'name'           => $validated['name'],
                'serial_number'  => $serial,
                'status'         => 'unknown',
            ]);

            return response()->json([
                'success' => true,
                'data'    => $this->formatDevice($device),
                'message' => 'Device registered. Point its ADMS server address here and it will connect automatically.',
            ], 201);
        }

        // ── Bridge path: issue a one-time pairing code ─────────────────────────
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

    /**
     * Queue an ADMS "DATA QUERY USERINFO" command so the device uploads its full
     * enrolled-user roster. The device picks it up on its next getrequest poll
     * (typically within the configured Delay, ~10–30s) and POSTs the users back,
     * which IClockController ingests into zk_user_mappings.
     */
    public function fetchUsers(Request $request, string $id): JsonResponse
    {
        $institutionId = $this->institutionId($request);
        if (!$institutionId) {
            return response()->json(['success' => false, 'message' => 'No default institution'], 403);
        }

        $device = BiometricDevice::where('institution_id', $institutionId)->find($id);
        if (!$device) {
            return response()->json(['success' => false, 'message' => 'Device not found'], 404);
        }

        // Avoid stacking duplicate query commands only if one is still undelivered.
        // (Delivered query commands are marked done immediately, so this won't block
        // a fresh fetch after the previous one was served.)
        $alreadyQueued = \App\Models\DeviceCommand::where('device_id', $device->id)
            ->where('command_type', 'query_users')
            ->where('status', 'pending')
            ->exists();

        if (!$alreadyQueued) {
            \App\Models\DeviceCommand::create([
                'institution_id' => $institutionId,
                'device_id'      => $device->id,
                'cmd_id'         => \App\Models\DeviceCommand::generateCmdId(),
                'command_type'   => 'query_users',
                'payload'        => \App\Models\DeviceCommand::buildQueryUsersPayload(),
                'status'         => 'pending',
            ]);
        }

        return response()->json([
            'success' => true,
            'message' => $device->computed_status === 'online'
                ? 'Fetch queued — the device will upload its users within ~30 seconds. Refresh the ZK Users list shortly.'
                : 'Fetch queued, but the device looks offline. It will sync once it reconnects.',
        ]);
    }

    /**
     * Queue an ADMS "DATA QUERY ATTLOG" command so the device re-uploads stored
     * punches for a date range. Defaults to the last 30 days. Ingestion dedupes,
     * so re-fetching an overlapping range is safe.
     */
    public function fetchAttendance(Request $request, string $id): JsonResponse
    {
        $institutionId = $this->institutionId($request);
        if (!$institutionId) {
            return response()->json(['success' => false, 'message' => 'No default institution'], 403);
        }

        $device = BiometricDevice::where('institution_id', $institutionId)->find($id);
        if (!$device) {
            return response()->json(['success' => false, 'message' => 'Device not found'], 404);
        }

        $validated = $request->validate([
            'from' => 'nullable|date',
            'to'   => 'nullable|date|after_or_equal:from',
        ]);

        $start = $validated['from'] ?? now()->subDays(30)->toDateString();
        $end   = $validated['to'] ?? now()->toDateString();
        // Expand date-only inputs to cover the whole day.
        $startDt = strlen($start) === 10 ? "{$start} 00:00:00" : $start;
        $endDt   = strlen($end) === 10 ? "{$end} 23:59:59" : $end;

        $alreadyQueued = DeviceCommand::where('device_id', $device->id)
            ->where('command_type', 'query_attlog')
            ->where('status', 'pending')
            ->exists();

        if (!$alreadyQueued) {
            DeviceCommand::create([
                'institution_id' => $institutionId,
                'device_id'      => $device->id,
                'cmd_id'         => DeviceCommand::generateCmdId(),
                'command_type'   => 'query_attlog',
                'payload'        => DeviceCommand::buildQueryAttlogPayload($startDt, $endDt),
                'status'         => 'pending',
            ]);
        }

        return response()->json([
            'success' => true,
            'message' => $device->computed_status === 'online'
                ? "Fetching punches from {$start} to {$end} — they'll appear within ~30 seconds. Refresh the list shortly."
                : 'Fetch queued, but the device looks offline. It will sync once it reconnects.',
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
            // How the device talks to us: bridge (paired agent), adms (direct push,
            // has been seen), or pending (registered but never contacted yet).
            'connection'      => $device->bridge_token_hash !== null
                ? 'bridge'
                : ($device->last_seen_at !== null ? 'adms' : 'pending'),
            'last_seen_at'    => $device->last_seen_at?->toISOString(),
            'pairing_code_expires_at' => $device->pairing_code_expires_at?->toISOString(),
            'created_at'      => $device->created_at->toISOString(),
            'updated_at'      => $device->updated_at->toISOString(),
        ];
    }
}
