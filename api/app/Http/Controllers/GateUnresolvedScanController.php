<?php

namespace App\Http\Controllers;

use App\Models\GateUnresolvedScan;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The office's view of cards that tapped and could not be placed.
 *
 * Read by the Gate Entries page, which shows the list only when it has
 * something in it — an empty worklist should take up no space at all, because
 * empty is the normal state.
 *
 * Institution-scoped per request, like every other controller here: the id comes
 * from the signed-in user's institution and never from the request.
 */
class GateUnresolvedScanController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $institutionId = $this->institutionId($request);

        if (! $institutionId) {
            return response()->json(['success' => false, 'message' => 'No default institution'], 403);
        }

        $validated = $request->validate([
            'gate_type' => 'nullable|in:enter,exit',
            'limit' => 'nullable|integer|min:1|max:100',
        ]);

        $scans = GateUnresolvedScan::where('institution_id', $institutionId)
            ->when(
                isset($validated['gate_type']),
                fn ($query) => $query->where('type', $validated['gate_type'])
            )
            ->orderByDesc('last_seen_at')
            ->limit((int) ($validated['limit'] ?? 25))
            ->get();

        return response()->json([
            'success' => true,
            'data' => $scans->map(fn (GateUnresolvedScan $scan) => [
                'id' => $scan->id,
                'rfid_uid' => $scan->rfid_uid,
                'type' => $scan->type,
                'device_name' => $scan->device_name,
                'attempts' => $scan->attempts,
                'first_seen_at' => $scan->first_seen_at?->toISOString(),
                'last_seen_at' => $scan->last_seen_at?->toISOString(),
                'clock_suspect' => $scan->clock_suspect,
            ])->all(),
        ]);
    }

    /**
     * Dismiss one card from the worklist.
     *
     * A row also disappears on its own the moment that card resolves — see
     * `GateKioskController::scans` — so this is for the other endings: a visitor's
     * card, a misread, a tag that was never going to be registered.
     */
    public function destroy(Request $request, string $id): JsonResponse
    {
        $institutionId = $this->institutionId($request);

        $scan = GateUnresolvedScan::where('institution_id', $institutionId)
            ->whereKey($id)
            ->first();

        if (! $scan) {
            return response()->json(['success' => false, 'message' => 'Not found'], 404);
        }

        $scan->delete();

        return response()->json(['success' => true]);
    }

    /** Same resolution as GateDeviceController, deliberately. */
    private function institutionId(Request $request): ?string
    {
        return $request->user()->userInstitutions()
            ->where('is_default', true)
            ->value('institution_id');
    }
}
