<?php

namespace App\Http\Controllers;

use App\Models\SmsGateway;
use App\Models\SmsMessage;
use App\Services\SmsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SmsMessageController extends Controller
{
    public function __construct(private SmsService $sms) {}

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

        $validated = $request->validate([
            'direction' => 'nullable|in:outbound,inbound',
            'status' => 'nullable|string',
            'gateway_id' => 'nullable|uuid',
            'search' => 'nullable|string|max:64',
            'from' => 'nullable|date',
            'to' => 'nullable|date',
            'per_page' => 'nullable|integer|min:1|max:200',
        ]);

        $query = SmsMessage::where('institution_id', $institutionId);

        if (! empty($validated['direction'])) {
            $query->where('direction', $validated['direction']);
        }
        if (! empty($validated['status'])) {
            $query->where('status', $validated['status']);
        }
        if (! empty($validated['gateway_id'])) {
            $query->where('gateway_id', $validated['gateway_id']);
        }
        if (! empty($validated['search'])) {
            $term = '%'.$validated['search'].'%';
            $query->where(function ($q) use ($term) {
                $q->where('to_number', 'like', $term)->orWhere('from_number', 'like', $term);
            });
        }
        if (! empty($validated['from'])) {
            $query->where('created_at', '>=', $validated['from']);
        }
        if (! empty($validated['to'])) {
            $query->where('created_at', '<=', $validated['to']);
        }

        $messages = $query->orderBy('created_at', 'desc')
            ->paginate($validated['per_page'] ?? 50);

        return response()->json([
            'success' => true,
            'data' => $messages->items(),
            'meta' => [
                'current_page' => $messages->currentPage(),
                'last_page' => $messages->lastPage(),
                'per_page' => $messages->perPage(),
                'total' => $messages->total(),
                // Deliberately unfiltered: the backlog banner and Cancel all queued are
                // institution-wide, so this must not move when the user narrows the list.
                'queued_total' => SmsMessage::where('institution_id', $institutionId)
                    ->where('direction', 'outbound')
                    ->where('status', 'queued')
                    ->count(),
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $institutionId = $this->institutionId($request);
        if (! $institutionId) {
            return response()->json(['success' => false, 'message' => 'No default institution'], 403);
        }

        $validated = $request->validate([
            'numbers' => 'required|array|min:1',
            'numbers.*' => 'required|string|max:32',
            'body' => 'required|string|max:1600',
            'gateway_id' => 'nullable|uuid',
            'scheduled_at' => 'nullable|date',
        ]);

        // If a gateway is pinned, ensure it belongs to this institution.
        if (! empty($validated['gateway_id'])) {
            $owns = SmsGateway::where('institution_id', $institutionId)
                ->where('id', $validated['gateway_id'])
                ->exists();
            if (! $owns) {
                return response()->json(['success' => false, 'message' => 'Gateway not found'], 404);
            }
        }

        $ids = $this->sms->queue($institutionId, $validated['numbers'], $validated['body'], [
            'source' => 'manual',
            'gateway_id' => $validated['gateway_id'] ?? null,
            'scheduled_at' => $validated['scheduled_at'] ?? null,
            'queued_by' => $request->user()->id,
        ]);

        return response()->json([
            'success' => true,
            'data' => ['queued' => count($ids), 'ids' => $ids],
            'message' => count($ids).' message(s) queued.',
        ], 201);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $message = $this->findScoped($request, $id);
        if (! $message) {
            return response()->json(['success' => false, 'message' => 'Message not found'], 404);
        }

        return response()->json(['success' => true, 'data' => $message]);
    }

    public function retry(Request $request, string $id): JsonResponse
    {
        $message = $this->findScoped($request, $id);
        if (! $message) {
            return response()->json(['success' => false, 'message' => 'Message not found'], 404);
        }

        if ($message->direction !== 'outbound' || $message->status !== 'failed') {
            return response()->json(['success' => false, 'message' => 'Only failed outbound messages can be retried'], 422);
        }

        $message->update([
            'status' => 'queued',
            'error' => null,
            'sent_at' => null,
            'provider_ref' => null,
        ]);

        return response()->json(['success' => true, 'data' => $message->fresh()]);
    }

    public function cancel(Request $request, string $id): JsonResponse
    {
        $message = $this->findScoped($request, $id);
        if (! $message) {
            return response()->json(['success' => false, 'message' => 'Message not found'], 404);
        }

        if ($message->direction !== 'outbound' || ! in_array($message->status, ['queued', 'sending'], true)) {
            return response()->json(['success' => false, 'message' => 'Only queued or sending messages can be canceled'], 422);
        }

        $message->update(['status' => 'canceled']);

        return response()->json(['success' => true, 'data' => $message->fresh()]);
    }

    /**
     * Cancel every queued outbound message for the institution. This is the escape hatch
     * for a backlog that built up while no kiosk was claiming — a gate rush against an
     * offline agent leaves hundreds of rows that are stale by the time anyone notices.
     *
     * Institution-wide on purpose: it ignores whatever filters the Messages screen has
     * applied, so the UI must say so before asking for confirmation.
     *
     * `queued` only. A `sending` row is already in a kiosk's hands and may be mid-CMGS;
     * canceling it would either be a lie or be overwritten by the agent's own status
     * report, and a row that never reports is the reaper's job.
     *
     * The status predicate makes this safe against a concurrent outbox claim: rows the
     * agent grabs in the meantime are no longer `queued` and are simply not touched.
     */
    public function cancelQueued(Request $request): JsonResponse
    {
        $institutionId = $this->institutionId($request);
        if (! $institutionId) {
            return response()->json(['success' => false, 'message' => 'No default institution'], 403);
        }

        $canceled = SmsMessage::where('institution_id', $institutionId)
            ->where('direction', 'outbound')
            ->where('status', 'queued')
            ->update(['status' => 'canceled']);

        return response()->json([
            'success' => true,
            'data' => ['canceled' => $canceled],
            'message' => $canceled.' queued message(s) canceled.',
        ]);
    }

    private function findScoped(Request $request, string $id): ?SmsMessage
    {
        $institutionId = $this->institutionId($request);
        if (! $institutionId) {
            return null;
        }

        return SmsMessage::where('institution_id', $institutionId)->find($id);
    }
}
