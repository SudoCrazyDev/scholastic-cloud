<?php

namespace App\Http\Controllers;

use App\Auth\StudentPortalUser;
use App\Models\StaffSchedule;
use App\Models\StaffScheduleAssignment;
use App\Models\StaffScheduleDay;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class StaffScheduleController extends Controller
{
    // ---------------------------------------------------------------------
    // Schedule templates
    // ---------------------------------------------------------------------

    /**
     * List schedule templates for the current institution.
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

        $query = StaffSchedule::with('days')
            ->withCount('assignments')
            ->where('institution_id', $institutionId);

        if ($request->filled('search')) {
            $query->where('name', 'like', '%'.$request->get('search').'%');
        }

        if ($request->filled('is_active')) {
            $isActive = filter_var($request->get('is_active'), FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
            if ($isActive !== null) {
                $query->where('is_active', $isActive);
            }
        }

        $schedules = $query->orderBy('name')->get();

        return response()->json([
            'success' => true,
            'data' => $schedules->map(fn ($schedule) => $this->serialize($schedule))->values(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        if ($this->isStudentUser($request)) {
            return $this->studentForbidden();
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return $this->noInstitution();
        }

        $validated = $this->validatePayload($request, $institutionId);

        $schedule = DB::transaction(function () use ($validated, $institutionId, $request) {
            $schedule = StaffSchedule::create([
                'institution_id' => $institutionId,
                'name' => $validated['name'],
                'description' => $validated['description'] ?? null,
                'is_active' => $validated['is_active'] ?? true,
                'created_by' => $request->user()?->id,
            ]);

            $this->syncDays($schedule, $validated['days']);

            return $schedule;
        });

        return response()->json([
            'success' => true,
            'message' => 'Schedule created successfully',
            'data' => $this->serialize($schedule->fresh('days')->loadCount('assignments')),
        ], 201);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        if ($this->isStudentUser($request)) {
            return $this->studentForbidden();
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return $this->noInstitution();
        }

        $schedule = StaffSchedule::with('days')
            ->withCount('assignments')
            ->where('institution_id', $institutionId)
            ->find($id);

        if (! $schedule) {
            return $this->notFound();
        }

        return response()->json([
            'success' => true,
            'data' => $this->serialize($schedule),
        ]);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        if ($this->isStudentUser($request)) {
            return $this->studentForbidden();
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return $this->noInstitution();
        }

        $schedule = StaffSchedule::with('days')
            ->where('institution_id', $institutionId)
            ->find($id);

        if (! $schedule) {
            return $this->notFound();
        }

        $validated = $this->validatePayload($request, $institutionId, $schedule->id);

        DB::transaction(function () use ($schedule, $validated) {
            $schedule->update([
                'name' => $validated['name'],
                'description' => $validated['description'] ?? null,
                'is_active' => $validated['is_active'] ?? $schedule->is_active,
            ]);

            $this->syncDays($schedule, $validated['days']);
        });

        return response()->json([
            'success' => true,
            'message' => 'Schedule updated successfully',
            'data' => $this->serialize($schedule->fresh('days')->loadCount('assignments')),
        ]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        if ($this->isStudentUser($request)) {
            return $this->studentForbidden();
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return $this->noInstitution();
        }

        $schedule = StaffSchedule::where('institution_id', $institutionId)->find($id);
        if (! $schedule) {
            return $this->notFound();
        }

        if ($schedule->assignments()->exists()) {
            return response()->json([
                'success' => false,
                'message' => 'This schedule is assigned to staff. Unassign them before deleting it.',
            ], 409);
        }

        $schedule->delete();

        return response()->json([
            'success' => true,
            'message' => 'Schedule deleted successfully',
        ]);
    }

    // ---------------------------------------------------------------------
    // Assignments
    // ---------------------------------------------------------------------

    /**
     * List which staff are assigned to which schedule.
     */
    public function assignments(Request $request): JsonResponse
    {
        if ($this->isStudentUser($request)) {
            return $this->studentForbidden();
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return $this->noInstitution();
        }

        $query = StaffScheduleAssignment::with(['user', 'staffSchedule'])
            ->where('institution_id', $institutionId);

        if ($request->filled('staff_schedule_id')) {
            $query->where('staff_schedule_id', $request->get('staff_schedule_id'));
        }

        $assignments = $query->get()
            ->sortBy(fn ($assignment) => $this->staffName($assignment->user))
            ->values();

        return response()->json([
            'success' => true,
            'data' => $assignments->map(fn ($assignment) => $this->serializeAssignment($assignment))->values(),
        ]);
    }

    /**
     * Assign a schedule template to one or more staff.
     * Each staff has at most one schedule, so an existing assignment is replaced.
     */
    public function assign(Request $request, string $id): JsonResponse
    {
        if ($this->isStudentUser($request)) {
            return $this->studentForbidden();
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return $this->noInstitution();
        }

        $schedule = StaffSchedule::where('institution_id', $institutionId)->find($id);
        if (! $schedule) {
            return $this->notFound();
        }

        $validated = $request->validate([
            'user_ids' => 'required|array|min:1',
            'user_ids.*' => [
                'uuid',
                'distinct',
                Rule::exists('user_institutions', 'user_id')
                    ->where(fn ($query) => $query->where('institution_id', $institutionId)),
            ],
        ], [
            'user_ids.required' => 'Select at least one staff member.',
            'user_ids.*.exists' => 'One of the selected staff does not belong to this institution.',
        ]);

        $createdById = $request->user()?->id;

        $summary = DB::transaction(function () use ($validated, $institutionId, $schedule, $createdById) {
            $created = 0;
            $reassigned = 0;

            foreach ($validated['user_ids'] as $userId) {
                $existing = StaffScheduleAssignment::where('institution_id', $institutionId)
                    ->where('user_id', $userId)
                    ->first();

                if ($existing) {
                    if ($existing->staff_schedule_id !== $schedule->id) {
                        $reassigned++;
                    }
                    $existing->update(['staff_schedule_id' => $schedule->id]);
                } else {
                    StaffScheduleAssignment::create([
                        'institution_id' => $institutionId,
                        'staff_schedule_id' => $schedule->id,
                        'user_id' => $userId,
                        'created_by' => $createdById,
                    ]);
                    $created++;
                }
            }

            return ['created' => $created, 'reassigned' => $reassigned];
        });

        $total = $summary['created'] + $summary['reassigned'];

        return response()->json([
            'success' => true,
            'message' => "Schedule assigned to {$total} staff member(s).",
            'data' => array_merge($summary, ['total' => $total]),
        ], 201);
    }

    /**
     * Remove a single staff assignment.
     */
    public function unassign(Request $request, string $assignmentId): JsonResponse
    {
        if ($this->isStudentUser($request)) {
            return $this->studentForbidden();
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return $this->noInstitution();
        }

        $assignment = StaffScheduleAssignment::where('institution_id', $institutionId)->find($assignmentId);
        if (! $assignment) {
            return response()->json(['success' => false, 'message' => 'Assignment not found'], 404);
        }

        $assignment->delete();

        return response()->json([
            'success' => true,
            'message' => 'Staff unassigned successfully',
        ]);
    }

    // ---------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------

    private function validatePayload(Request $request, string $institutionId, ?string $ignoreId = null): array
    {
        $validated = $request->validate([
            'name' => [
                'required',
                'string',
                'max:255',
                Rule::unique('staff_schedules')
                    ->where(fn ($query) => $query->where('institution_id', $institutionId))
                    ->ignore($ignoreId),
            ],
            'description' => 'nullable|string',
            'is_active' => 'nullable|boolean',
            'days' => 'required|array|min:1',
            'days.*.day_of_week' => ['required', 'distinct', Rule::in(StaffScheduleDay::DAYS)],
            'days.*.start_time' => ['required', 'date_format:H:i'],
            'days.*.end_time' => ['required', 'date_format:H:i'],
            'days.*.lunch_start' => ['nullable', 'date_format:H:i'],
            'days.*.lunch_end' => ['nullable', 'date_format:H:i'],
        ], [
            'name.unique' => 'A schedule with this name already exists.',
            'days.required' => 'Add at least one working day.',
            'days.*.day_of_week.distinct' => 'Each weekday can only be configured once.',
        ]);

        $this->validateDayTimes($validated['days']);

        return $validated;
    }

    /**
     * Cross-field time checks. Times are zero-padded 24h ("HH:MM"),
     * so plain string comparison is chronological.
     */
    private function validateDayTimes(array $days): void
    {
        foreach ($days as $index => $day) {
            $label = ucfirst($day['day_of_week'] ?? 'day #'.($index + 1));

            if ($day['end_time'] <= $day['start_time']) {
                throw ValidationException::withMessages([
                    "days.$index.end_time" => "{$label}: end time must be after start time.",
                ]);
            }

            $lunchStart = $day['lunch_start'] ?? null;
            $lunchEnd = $day['lunch_end'] ?? null;

            if (($lunchStart === null) !== ($lunchEnd === null)) {
                throw ValidationException::withMessages([
                    "days.$index.lunch_end" => "{$label}: provide both a lunch start and end, or leave both blank.",
                ]);
            }

            if ($lunchStart !== null && $lunchEnd !== null) {
                if ($lunchEnd <= $lunchStart) {
                    throw ValidationException::withMessages([
                        "days.$index.lunch_end" => "{$label}: lunch end must be after lunch start.",
                    ]);
                }

                if ($lunchStart < $day['start_time'] || $lunchEnd > $day['end_time']) {
                    throw ValidationException::withMessages([
                        "days.$index.lunch_start" => "{$label}: lunch must fall within working hours.",
                    ]);
                }
            }
        }
    }

    private function syncDays(StaffSchedule $schedule, array $days): void
    {
        // Days are fully replaced on every write — absent weekday = day off.
        $schedule->days()->delete();

        $rows = [];
        foreach ($days as $day) {
            $rows[] = [
                'day_of_week' => $day['day_of_week'],
                'start_time' => $day['start_time'],
                'end_time' => $day['end_time'],
                'lunch_start' => ($day['lunch_start'] ?? '') !== '' ? $day['lunch_start'] : null,
                'lunch_end' => ($day['lunch_end'] ?? '') !== '' ? $day['lunch_end'] : null,
            ];
        }

        $schedule->days()->createMany($rows);
    }

    private function serialize(StaffSchedule $schedule): array
    {
        return [
            'id' => $schedule->id,
            'institution_id' => $schedule->institution_id,
            'name' => $schedule->name,
            'description' => $schedule->description,
            'is_active' => (bool) $schedule->is_active,
            'assigned_count' => (int) ($schedule->assignments_count ?? $schedule->assignments()->count()),
            'day_count' => $schedule->days->count(),
            'days' => $schedule->days->map(fn (StaffScheduleDay $day) => [
                'id' => $day->id,
                'day_of_week' => $day->day_of_week,
                'start_time' => $this->formatTime($day->start_time),
                'end_time' => $this->formatTime($day->end_time),
                'lunch_start' => $this->formatTime($day->lunch_start),
                'lunch_end' => $this->formatTime($day->lunch_end),
            ])->values(),
            'created_at' => $schedule->created_at?->toIso8601String(),
            'updated_at' => $schedule->updated_at?->toIso8601String(),
        ];
    }

    private function serializeAssignment(StaffScheduleAssignment $assignment): array
    {
        return [
            'id' => $assignment->id,
            'user_id' => $assignment->user_id,
            'staff_name' => $this->staffName($assignment->user),
            'staff_email' => $assignment->user?->email,
            'staff_schedule_id' => $assignment->staff_schedule_id,
            'schedule_name' => $assignment->staffSchedule?->name,
            'created_at' => $assignment->created_at?->toIso8601String(),
        ];
    }

    private function staffName(?User $user): ?string
    {
        if (! $user) {
            return null;
        }

        return trim(implode(' ', array_filter([
            $user->first_name,
            $user->middle_name,
            $user->last_name,
            $user->ext_name,
        ]))) ?: $user->email;
    }

    /**
     * MySQL returns TIME as "HH:MM:SS"; the UI only wants "HH:MM".
     */
    private function formatTime(?string $time): ?string
    {
        if ($time === null || $time === '') {
            return null;
        }

        return substr($time, 0, 5);
    }

    private function resolveInstitutionId(Request $request): ?string
    {
        $user = $request->user();
        if (! $user) {
            return null;
        }

        $institutionId = $user->getDefaultInstitutionId();
        if (! $institutionId) {
            $firstUserInstitution = $user->userInstitutions()->first();
            if ($firstUserInstitution) {
                $institutionId = $firstUserInstitution->institution_id;
            }
        }

        return $institutionId;
    }

    private function isStudentUser(Request $request): bool
    {
        $user = $request->user();
        if (! $user) {
            return false;
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
            'message' => 'Students are not allowed to manage staff schedules',
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
            'message' => 'Schedule not found',
        ], 404);
    }
}
