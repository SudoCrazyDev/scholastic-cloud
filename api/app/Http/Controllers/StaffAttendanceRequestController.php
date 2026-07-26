<?php

namespace App\Http\Controllers;

use App\Auth\StudentPortalUser;
use App\Models\PayrollPeriod;
use App\Models\StaffAttendanceRequest;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Staff-filed attendance exceptions and their approval.
 *
 * Any staff member may file for themselves; a principal /
 * institution-administrator reviews. Approved rows are what
 * {@see \App\Services\PayrollService} reads when pricing a day — a pending
 * request changes nothing about pay.
 */
class StaffAttendanceRequestController extends Controller
{
    /** Roles that may approve, and whose own filings are auto-approved. */
    private const APPROVER_ROLES = ['principal', 'institution-administrator', 'super-administrator'];

    /**
     * List requests. Approvers see the whole institution by default; everyone
     * else only ever sees their own, regardless of the scope asked for.
     */
    public function index(Request $request): JsonResponse
    {
        if ($this->isStudentUser($request)) {
            return $this->studentForbidden();
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return $this->noInstitution();
        }

        $query = StaffAttendanceRequest::with([
            'staff:id,first_name,middle_name,last_name,email',
            'requester:id,first_name,last_name',
            'reviewer:id,first_name,last_name',
        ])->where('institution_id', $institutionId);

        if (! $this->canApprove($request) || $request->get('scope') === 'mine') {
            $query->where('user_id', $request->user()?->id);
        }

        $status = $request->get('status');
        if (in_array($status, StaffAttendanceRequest::STATUSES, true)) {
            $query->where('status', $status);
        }

        if ($request->filled('from')) {
            $query->whereDate('date_to', '>=', $request->get('from'));
        }
        if ($request->filled('to')) {
            $query->whereDate('date_from', '<=', $request->get('to'));
        }

        $requests = $query->orderByDesc('created_at')->get();

        return response()->json([
            'success' => true,
            'data' => $requests->map(fn (StaffAttendanceRequest $row) => $this->serialize($row))->values(),
        ]);
    }

    /**
     * File a request. Staff file for themselves; approvers may file on behalf
     * of someone else, and their own filings are created already approved.
     */
    public function store(Request $request): JsonResponse
    {
        if ($this->isStudentUser($request)) {
            return $this->studentForbidden();
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return $this->noInstitution();
        }

        $isApprover = $this->canApprove($request);

        $validated = $request->validate([
            'user_id' => 'sometimes|nullable|uuid',
            'date_from' => 'required|date',
            'date_to' => 'required|date|after_or_equal:date_from',
            'kind' => ['required', Rule::in(StaffAttendanceRequest::KINDS)],
            'reason' => 'required|string|max:2000',
            'credited_time_in' => 'nullable|date_format:H:i',
            'credited_time_out' => 'nullable|date_format:H:i',
            // Approver-only overrides of the defaults derived from `kind`.
            'waive_late' => 'sometimes|boolean',
            'waive_undertime' => 'sometimes|boolean',
            'pay_full_day' => 'sometimes|boolean',
        ]);

        $targetUserId = $request->user()?->id;
        if (! empty($validated['user_id']) && $validated['user_id'] !== $targetUserId) {
            if (! $isApprover) {
                throw ValidationException::withMessages([
                    'user_id' => 'You can only file a request for yourself.',
                ]);
            }
            if (! $this->staffBelongsToInstitution($validated['user_id'], $institutionId)) {
                throw ValidationException::withMessages([
                    'user_id' => 'That staff member does not belong to your institution.',
                ]);
            }
            $targetUserId = $validated['user_id'];
        }

        $this->assertTimesOrdered($validated);
        $this->assertRangeIsSane($validated['date_from'], $validated['date_to']);
        $this->assertNoOverlappingPending($institutionId, $targetUserId, $validated);

        // Derived from the kind rather than taken from the payload, so a staff
        // member cannot grant themselves a pay floor. Approvers may override.
        $flags = StaffAttendanceRequest::defaultFlagsForKind($validated['kind']);
        if ($isApprover) {
            foreach (['waive_late', 'waive_undertime', 'pay_full_day'] as $flag) {
                if (array_key_exists($flag, $validated)) {
                    $flags[$flag] = (bool) $validated[$flag];
                }
            }
        }

        $userId = $request->user()?->id;

        $attendanceRequest = StaffAttendanceRequest::create([
            'institution_id' => $institutionId,
            'user_id' => $targetUserId,
            'date_from' => $validated['date_from'],
            'date_to' => $validated['date_to'],
            'kind' => $validated['kind'],
            'waive_late' => $flags['waive_late'],
            'waive_undertime' => $flags['waive_undertime'],
            'pay_full_day' => $flags['pay_full_day'],
            'credited_time_in' => $this->toDbTime($validated['credited_time_in'] ?? null),
            'credited_time_out' => $this->toDbTime($validated['credited_time_out'] ?? null),
            'reason' => $validated['reason'],
            'status' => $isApprover ? StaffAttendanceRequest::STATUS_APPROVED : StaffAttendanceRequest::STATUS_PENDING,
            'requested_by' => $userId,
            'reviewed_by' => $isApprover ? $userId : null,
            'reviewed_at' => $isApprover ? now() : null,
        ]);

        $message = $isApprover
            ? 'Attendance exception recorded and approved.'.$this->regenerateHint($institutionId, $attendanceRequest)
            : 'Request submitted for approval.';

        return response()->json([
            'success' => true,
            'message' => $message,
            'data' => $this->serialize($this->loadRelations($attendanceRequest)),
        ], 201);
    }

    /**
     * Approve a pending request, optionally adjusting what it waives.
     */
    public function approve(Request $request, string $id): JsonResponse
    {
        if (! $this->canApprove($request)) {
            return $this->approverForbidden();
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return $this->noInstitution();
        }

        $attendanceRequest = StaffAttendanceRequest::where('institution_id', $institutionId)->find($id);
        if (! $attendanceRequest) {
            return $this->notFound();
        }
        if (! $attendanceRequest->isPending()) {
            return $this->notPending('approved');
        }

        $validated = $request->validate([
            'waive_late' => 'sometimes|boolean',
            'waive_undertime' => 'sometimes|boolean',
            'pay_full_day' => 'sometimes|boolean',
            'credited_time_in' => 'sometimes|nullable|date_format:H:i',
            'credited_time_out' => 'sometimes|nullable|date_format:H:i',
            'review_note' => 'sometimes|nullable|string|max:2000',
        ]);

        $update = [
            'status' => StaffAttendanceRequest::STATUS_APPROVED,
            'reviewed_by' => $request->user()?->id,
            'reviewed_at' => now(),
        ];

        foreach (['waive_late', 'waive_undertime', 'pay_full_day'] as $flag) {
            if (array_key_exists($flag, $validated)) {
                $update[$flag] = (bool) $validated[$flag];
            }
        }

        foreach (['credited_time_in', 'credited_time_out'] as $field) {
            if (array_key_exists($field, $validated)) {
                $update[$field] = $this->toDbTime($validated[$field]);
            }
        }

        if (array_key_exists('review_note', $validated)) {
            $update['review_note'] = $validated['review_note'];
        }

        $this->assertTimesOrdered([
            'credited_time_in' => $validated['credited_time_in'] ?? substr((string) $attendanceRequest->credited_time_in, 0, 5),
            'credited_time_out' => $validated['credited_time_out'] ?? substr((string) $attendanceRequest->credited_time_out, 0, 5),
        ]);

        $attendanceRequest->update($update);

        return response()->json([
            'success' => true,
            'message' => 'Request approved.'.$this->regenerateHint($institutionId, $attendanceRequest),
            'data' => $this->serialize($this->loadRelations($attendanceRequest)),
        ]);
    }

    /**
     * Disapprove a pending request. Pay is unaffected either way, but the
     * reason is recorded for the staff member to see.
     */
    public function disapprove(Request $request, string $id): JsonResponse
    {
        if (! $this->canApprove($request)) {
            return $this->approverForbidden();
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return $this->noInstitution();
        }

        $attendanceRequest = StaffAttendanceRequest::where('institution_id', $institutionId)->find($id);
        if (! $attendanceRequest) {
            return $this->notFound();
        }
        if (! $attendanceRequest->isPending()) {
            return $this->notPending('disapproved');
        }

        $validated = $request->validate([
            'review_note' => 'required|string|max:2000',
        ]);

        $attendanceRequest->update([
            'status' => StaffAttendanceRequest::STATUS_DISAPPROVED,
            'review_note' => $validated['review_note'],
            'reviewed_by' => $request->user()?->id,
            'reviewed_at' => now(),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Request disapproved.',
            'data' => $this->serialize($this->loadRelations($attendanceRequest)),
        ]);
    }

    /**
     * Withdraw one's own pending request.
     */
    public function cancel(Request $request, string $id): JsonResponse
    {
        if ($this->isStudentUser($request)) {
            return $this->studentForbidden();
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return $this->noInstitution();
        }

        $attendanceRequest = StaffAttendanceRequest::where('institution_id', $institutionId)->find($id);
        if (! $attendanceRequest) {
            return $this->notFound();
        }

        $isOwner = $attendanceRequest->user_id === $request->user()?->id
            || $attendanceRequest->requested_by === $request->user()?->id;

        if (! $isOwner && ! $this->canApprove($request)) {
            return response()->json([
                'success' => false,
                'message' => 'You can only cancel your own requests.',
            ], 403);
        }

        if (! $attendanceRequest->isPending()) {
            return $this->notPending('cancelled');
        }

        $attendanceRequest->update(['status' => StaffAttendanceRequest::STATUS_CANCELLED]);

        return response()->json([
            'success' => true,
            'message' => 'Request cancelled.',
            'data' => $this->serialize($this->loadRelations($attendanceRequest)),
        ]);
    }

    /**
     * An approval only reaches a payslip when the period is regenerated, so
     * say so rather than letting the admin assume pay already changed.
     */
    private function regenerateHint(string $institutionId, StaffAttendanceRequest $attendanceRequest): string
    {
        $period = PayrollPeriod::where('institution_id', $institutionId)
            ->whereDate('date_from', '<=', $attendanceRequest->date_to->toDateString())
            ->whereDate('date_to', '>=', $attendanceRequest->date_from->toDateString())
            ->first();

        if (! $period) {
            return '';
        }

        return $period->isFinalized()
            ? " Payroll period \"{$period->name}\" is already finalized — reopen and regenerate it to apply this."
            : " Regenerate payroll period \"{$period->name}\" to apply this to payslips.";
    }

    /**
     * Reject a second pending request covering the same kind and dates —
     * usually a double submit, and it would otherwise sit in the queue twice.
     */
    private function assertNoOverlappingPending(string $institutionId, ?string $userId, array $validated): void
    {
        $exists = StaffAttendanceRequest::where('institution_id', $institutionId)
            ->where('user_id', $userId)
            ->where('kind', $validated['kind'])
            ->where('status', StaffAttendanceRequest::STATUS_PENDING)
            ->whereDate('date_from', '<=', $validated['date_to'])
            ->whereDate('date_to', '>=', $validated['date_from'])
            ->exists();

        if ($exists) {
            throw ValidationException::withMessages([
                'date_from' => 'A pending request of this type already covers those dates.',
            ]);
        }
    }

    /**
     * Guard against a typo turning into a year-long blanket waiver.
     */
    private function assertRangeIsSane(string $from, string $to): void
    {
        $days = Carbon::parse($from)->diffInDays(Carbon::parse($to)) + 1;

        if ($days > 31) {
            throw ValidationException::withMessages([
                'date_to' => 'A single request may cover at most 31 days.',
            ]);
        }
    }

    private function assertTimesOrdered(array $values): void
    {
        $in = $values['credited_time_in'] ?? null;
        $out = $values['credited_time_out'] ?? null;

        if ($in && $out && $out <= $in) {
            throw ValidationException::withMessages([
                'credited_time_out' => 'Credited time out must be after time in.',
            ]);
        }
    }

    private function staffBelongsToInstitution(string $userId, string $institutionId): bool
    {
        return User::where('id', $userId)
            ->whereHas('userInstitutions', fn ($query) => $query->where('institution_id', $institutionId))
            ->exists();
    }

    private function loadRelations(StaffAttendanceRequest $attendanceRequest): StaffAttendanceRequest
    {
        return $attendanceRequest->fresh([
            'staff:id,first_name,middle_name,last_name,email',
            'requester:id,first_name,last_name',
            'reviewer:id,first_name,last_name',
        ]) ?? $attendanceRequest;
    }

    private function serialize(StaffAttendanceRequest $row): array
    {
        return [
            'id' => $row->id,
            'user_id' => $row->user_id,
            'staff_name' => $this->personName($row->staff),
            'date_from' => $row->date_from?->toDateString(),
            'date_to' => $row->date_to?->toDateString(),
            'kind' => $row->kind,
            'waive_late' => (bool) $row->waive_late,
            'waive_undertime' => (bool) $row->waive_undertime,
            'pay_full_day' => (bool) $row->pay_full_day,
            'credited_time_in' => $this->formatTime($row->credited_time_in),
            'credited_time_out' => $this->formatTime($row->credited_time_out),
            'reason' => $row->reason,
            'status' => $row->status,
            'review_note' => $row->review_note,
            'requested_by' => $row->requested_by,
            'requested_by_name' => $this->personName($row->requester),
            'reviewed_by_name' => $this->personName($row->reviewer),
            'reviewed_at' => $row->reviewed_at?->toIso8601String(),
            'created_at' => $row->created_at?->toIso8601String(),
        ];
    }

    private function personName(?User $user): ?string
    {
        if (! $user) {
            return null;
        }

        return trim(implode(' ', array_filter([
            $user->first_name,
            $user->middle_name,
            $user->last_name,
        ]))) ?: $user->email;
    }

    /** MySQL returns TIME as "HH:MM:SS"; the UI only wants "HH:MM". */
    private function formatTime(?string $time): ?string
    {
        return ($time === null || $time === '') ? null : substr($time, 0, 5);
    }

    private function toDbTime(?string $time): ?string
    {
        return ($time === null || $time === '') ? null : $time.':00';
    }

    private function resolveInstitutionId(Request $request): ?string
    {
        $user = $request->user();
        if (! $user instanceof User) {
            return null;
        }

        $institutionId = $user->getDefaultInstitutionId();
        if (! $institutionId) {
            $institutionId = $user->userInstitutions()->first()?->institution_id;
        }

        return $institutionId;
    }

    private function canApprove(Request $request): bool
    {
        $user = $request->user();
        if (! $user instanceof User) {
            return false;
        }

        return in_array((string) ($user->getRole()?->slug ?? ''), self::APPROVER_ROLES, true);
    }

    private function isStudentUser(Request $request): bool
    {
        $user = $request->user();
        if (! $user) {
            return true;
        }

        if ($user instanceof StudentPortalUser) {
            return true;
        }

        $role = method_exists($user, 'getRole') ? $user->getRole() : null;

        return (string) ($role->slug ?? '') === 'student';
    }

    private function studentForbidden(): JsonResponse
    {
        return response()->json([
            'success' => false,
            'message' => 'Students are not allowed to file attendance requests',
        ], 403);
    }

    private function approverForbidden(): JsonResponse
    {
        return response()->json([
            'success' => false,
            'message' => 'You are not allowed to review attendance requests',
        ], 403);
    }

    private function noInstitution(): JsonResponse
    {
        return response()->json([
            'success' => false,
            'message' => 'User does not have any institution assigned',
        ], 400);
    }

    private function notFound(): JsonResponse
    {
        return response()->json([
            'success' => false,
            'message' => 'Attendance request not found',
        ], 404);
    }

    private function notPending(string $action): JsonResponse
    {
        return response()->json([
            'success' => false,
            'message' => "Only pending requests can be {$action}.",
        ], 422);
    }
}
