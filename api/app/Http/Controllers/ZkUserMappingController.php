<?php

namespace App\Http\Controllers;

use App\Models\BiometricDevice;
use App\Models\DeviceCommand;
use App\Models\User;
use App\Models\ZkUserMapping;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ZkUserMappingController extends Controller
{
    private function institutionId(Request $request): ?string
    {
        return $request->user()->userInstitutions()
            ->where('is_default', true)
            ->value('institution_id');
    }

    /**
     * Queue a roster re-read so the device reports its users back shortly. Because
     * the device sends no command ack, this echo is how we confirm an enrollment
     * actually "took" (see IClockController::upsertUserLine). Deduped on pending.
     */
    private function queueRosterRefresh(string $institutionId, string $deviceId): void
    {
        $pending = DeviceCommand::where('device_id', $deviceId)
            ->where('command_type', 'query_users')
            ->where('status', 'pending')
            ->exists();

        if (!$pending) {
            DeviceCommand::create([
                'institution_id' => $institutionId,
                'device_id'      => $deviceId,
                'cmd_id'         => DeviceCommand::generateCmdId(),
                'command_type'   => 'query_users',
                'payload'        => DeviceCommand::buildQueryUsersPayload(),
                'status'         => 'pending',
            ]);
        }
    }

    public function index(Request $request): JsonResponse
    {
        $institutionId = $this->institutionId($request);
        if (!$institutionId) {
            return response()->json(['success' => false, 'message' => 'No default institution'], 403);
        }

        $query = ZkUserMapping::where('institution_id', $institutionId)
            ->with(['user', 'device']);

        if ($request->has('device_id')) {
            $query->where('device_id', $request->get('device_id'));
        }

        $linked = $request->get('linked');
        if ($linked === 'true' || $linked === '1') {
            $query->whereNotNull('user_id');
        } elseif ($linked === 'false' || $linked === '0') {
            $query->whereNull('user_id');
        }

        $perPage = $request->get('per_page', 50);
        $mappings = $query->orderBy('zk_name')->paginate($perPage);

        return response()->json([
            'success' => true,
            'data'    => $mappings->items(),
            'pagination' => [
                'current_page' => $mappings->currentPage(),
                'last_page'    => $mappings->lastPage(),
                'per_page'     => $mappings->perPage(),
                'total'        => $mappings->total(),
            ],
        ]);
    }

    public function link(Request $request, string $id): JsonResponse
    {
        $institutionId = $this->institutionId($request);
        if (!$institutionId) {
            return response()->json(['success' => false, 'message' => 'No default institution'], 403);
        }

        $mapping = ZkUserMapping::where('institution_id', $institutionId)->find($id);
        if (!$mapping) {
            return response()->json(['success' => false, 'message' => 'ZK user not found'], 404);
        }

        $validated = $request->validate([
            'user_id' => 'required|uuid|exists:users,id',
        ]);

        // Ensure target user belongs to the same institution
        $userInInstitution = User::whereHas('userInstitutions', fn ($q) =>
            $q->where('institution_id', $institutionId)
        )->find($validated['user_id']);

        if (!$userInInstitution) {
            return response()->json(['success' => false, 'message' => 'User not found in this institution'], 422);
        }

        $mapping->update(['user_id' => $validated['user_id']]);
        $mapping->load('user');

        return response()->json(['success' => true, 'data' => $mapping]);
    }

    /**
     * Queue a ZK user for enrollment to device (push user data: name + ID).
     */
    public function enroll(Request $request, string $id): JsonResponse
    {
        $institutionId = $this->institutionId($request);
        if (!$institutionId) {
            return response()->json(['success' => false, 'message' => 'No default institution'], 403);
        }

        $mapping = ZkUserMapping::where('institution_id', $institutionId)
            ->with('user')
            ->find($id);
        if (!$mapping) {
            return response()->json(['success' => false, 'message' => 'ZK user not found'], 404);
        }
        if (!$mapping->user_id) {
            return response()->json(['success' => false, 'message' => 'Link a staff member first before enrolling'], 422);
        }

        $name = $mapping->user
            ? trim("{$mapping->user->first_name} {$mapping->user->last_name}")
            : ($mapping->zk_name ?? 'User');

        // Queue an ADMS command — device will pick it up on next getrequest poll
        DeviceCommand::create([
            'institution_id' => $institutionId,
            'device_id'      => $mapping->device_id,
            'cmd_id'         => DeviceCommand::generateCmdId(),
            'command_type'   => 'add_user',
            'payload'        => DeviceCommand::buildAddUserPayload($mapping->zk_user_id, $name),
            'status'         => 'pending',
        ]);

        $mapping->update([
            'push_status'    => 'pending',
            'push_action'    => 'enroll_user',
            'push_error'     => null,
            'push_queued_at' => now(),
        ]);

        // Re-read the roster afterwards so the device confirms the user took.
        $this->queueRosterRefresh($institutionId, $mapping->device_id);

        return response()->json([
            'success' => true,
            'message' => 'Enrollment queued — device will receive it on next ADMS poll (within 30s)',
            'data'    => $mapping,
        ]);
    }

    /**
     * Queue a ZK user to trigger fingerprint enrollment on the device.
     * Device will display "scan finger" UI for this UID.
     */
    public function triggerFingerprint(Request $request, string $id): JsonResponse
    {
        $institutionId = $this->institutionId($request);
        if (!$institutionId) {
            return response()->json(['success' => false, 'message' => 'No default institution'], 403);
        }

        $mapping = ZkUserMapping::where('institution_id', $institutionId)->find($id);
        if (!$mapping) {
            return response()->json(['success' => false, 'message' => 'ZK user not found'], 404);
        }

        if (!$mapping->user_id) {
            return response()->json(['success' => false, 'message' => 'Link a staff member first'], 422);
        }

        $mapping->update([
            'push_status'    => 'pending',
            'push_action'    => 'enroll_fingerprint',
            'push_error'     => null,
            'push_queued_at' => now(),
        ]);

        return response()->json(['success' => true, 'message' => 'Fingerprint enrollment triggered — employee should go to the device now']);
    }

    /**
     * Create a new ZK user mapping and immediately queue it for enrollment.
     * Used when adding a staff member who has never been on the device.
     */
    public function store(Request $request): JsonResponse
    {
        $institutionId = $this->institutionId($request);
        if (!$institutionId) {
            return response()->json(['success' => false, 'message' => 'No default institution'], 403);
        }

        $validated = $request->validate([
            'device_id'  => 'required|uuid|exists:biometric_devices,id',
            'user_id'    => 'required|uuid|exists:users,id',
            'zk_user_id' => 'nullable|string|max:64',
        ]);

        // Ensure device belongs to institution
        $device = \App\Models\BiometricDevice::where('institution_id', $institutionId)
            ->find($validated['device_id']);
        if (!$device) {
            return response()->json(['success' => false, 'message' => 'Device not found'], 404);
        }

        // Auto-assign next available ZK User ID if not provided
        if (empty($validated['zk_user_id'])) {
            $maxId = ZkUserMapping::where('device_id', $validated['device_id'])
                ->whereRaw("zk_user_id REGEXP '^[0-9]+$'")
                ->max(\Illuminate\Support\Facades\DB::raw('CAST(zk_user_id AS UNSIGNED)'));
            $validated['zk_user_id'] = (string) (($maxId ?? 0) + 1);
        }

        // Ensure no duplicate zk_user_id on this device
        $exists = ZkUserMapping::where('device_id', $validated['device_id'])
            ->where('zk_user_id', $validated['zk_user_id'])
            ->exists();
        if ($exists) {
            return response()->json(['success' => false, 'message' => 'ZK User ID already used on this device'], 422);
        }

        $user = User::find($validated['user_id']);
        $name = trim("{$user->first_name} {$user->last_name}");

        $mapping = ZkUserMapping::create([
            'institution_id' => $institutionId,
            'device_id'      => $validated['device_id'],
            'zk_user_id'     => $validated['zk_user_id'],
            'zk_name'        => $name,
            'user_id'        => $validated['user_id'],
            'push_status'    => 'pending',
            'push_action'    => 'enroll_user',
            'push_queued_at' => now(),
        ]);

        // Queue ADMS command
        DeviceCommand::create([
            'institution_id' => $institutionId,
            'device_id'      => $validated['device_id'],
            'cmd_id'         => DeviceCommand::generateCmdId(),
            'command_type'   => 'add_user',
            'payload'        => DeviceCommand::buildAddUserPayload($validated['zk_user_id'], $name),
            'status'         => 'pending',
        ]);

        // Re-read the roster afterwards so the device confirms the user took.
        $this->queueRosterRefresh($institutionId, $validated['device_id']);

        $mapping->load('user', 'device');

        return response()->json(['success' => true, 'data' => $mapping], 201);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $institutionId = $this->institutionId($request);
        if (!$institutionId) {
            return response()->json(['success' => false, 'message' => 'No default institution'], 403);
        }

        $mapping = ZkUserMapping::where('institution_id', $institutionId)->find($id);
        if (!$mapping) {
            return response()->json(['success' => false, 'message' => 'ZK user not found'], 404);
        }

        $mapping->delete();

        return response()->json(['success' => true, 'message' => 'ZK user removed']);
    }

    public function unlink(Request $request, string $id): JsonResponse
    {
        $institutionId = $this->institutionId($request);
        if (!$institutionId) {
            return response()->json(['success' => false, 'message' => 'No default institution'], 403);
        }

        $mapping = ZkUserMapping::where('institution_id', $institutionId)->find($id);
        if (!$mapping) {
            return response()->json(['success' => false, 'message' => 'ZK user not found'], 404);
        }

        $mapping->update(['user_id' => null]);

        return response()->json(['success' => true, 'message' => 'Staff link removed']);
    }
}
