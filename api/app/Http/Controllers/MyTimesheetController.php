<?php

namespace App\Http\Controllers;

use App\Auth\StudentPortalUser;
use App\Models\StaffAttendanceRequest;
use App\Models\User;
use App\Services\PayrollService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The signed-in staff member's own attendance, day by day.
 *
 * Payroll reads the biometric logs; this shows the same days back to the
 * person they will be paid for, so a punch the device never recorded is found
 * while it can still be filed against — not on payday.
 */
class MyTimesheetController extends Controller
{
    /**
     * The fewest days the dashboard falls back to on the 1st of a month, when
     * the month so far is a day long but last month's missed punches can still
     * be filed against.
     */
    private const MINIMUM_DAYS = 14;

    /** A generous cap: enough for any payroll period, short of a year of rows. */
    private const MAX_DAYS = 62;

    public function __construct(private readonly PayrollService $payroll)
    {
    }

    public function index(Request $request): JsonResponse
    {
        if ($this->isStudentUser($request)) {
            return response()->json([
                'success' => false,
                'message' => 'Students do not have a staff timesheet',
            ], 403);
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return response()->json([
                'success' => false,
                'message' => 'User does not have any institution assigned',
            ], 400);
        }

        $validated = $request->validate([
            'from' => 'sometimes|nullable|date',
            'to' => 'sometimes|nullable|date',
        ]);

        $userId = (string) $request->user()->id;
        $today = Carbon::now(PayrollService::TIMEZONE)->startOfDay();

        // Never past today: tomorrow has no attendance to show, only rows that
        // would read as absences.
        // Parsed in the school's own timezone: a date the staff member typed
        // means that date at the school, not at UTC.
        $to = isset($validated['to']) && $validated['to']
            ? Carbon::parse($validated['to'], PayrollService::TIMEZONE)->startOfDay()->min($today)
            : $today;

        // The whole month so far, so the staff member sees every day of the
        // period they are about to be paid for rather than a rolling window
        // that has already dropped the first half of it.
        $from = isset($validated['from']) && $validated['from']
            ? Carbon::parse($validated['from'], PayrollService::TIMEZONE)->startOfDay()
            : $to->copy()->startOfMonth()->min($to->copy()->subDays(self::MINIMUM_DAYS - 1));

        if ($from->gt($to)) {
            $from = $to->copy();
        }
        if ($from->diffInDays($to) + 1 > self::MAX_DAYS) {
            $from = $to->copy()->subDays(self::MAX_DAYS - 1);
        }

        $days = $this->payroll->timesheetFor($institutionId, $userId, $from, $to);
        $requests = $this->requestsByDate($institutionId, $userId, $from, $to);

        $days = array_map(function (array $day) use ($requests) {
            $day['request'] = $requests[$day['date']] ?? null;

            return $day;
        }, $days);

        // Punches that stopped arriving days ago look exactly like everybody
        // being absent, so say when the devices last reported rather than let
        // the whole week read as missed punches.
        $lastAttendance = $this->payroll->lastAttendanceDate($institutionId, $to->copy()->endOfDay());

        return response()->json([
            'success' => true,
            'data' => [
                'from' => $from->toDateString(),
                'to' => $to->toDateString(),
                'today' => $today->toDateString(),
                'last_attendance_date' => $lastAttendance?->toDateString(),
                'days' => $days,
            ],
        ]);
    }

    /**
     * The staff member's live requests keyed by every date they cover, so a
     * day already filed against offers no second button.
     *
     * Disapproved, cancelled and voided rows are left out on purpose: those
     * days are open again and may be filed for a second time.
     *
     * @return array<string, array{id: string, kind: string, status: string}>
     */
    private function requestsByDate(string $institutionId, string $userId, Carbon $from, Carbon $to): array
    {
        $rows = StaffAttendanceRequest::where('institution_id', $institutionId)
            ->where('user_id', $userId)
            ->whereIn('status', [StaffAttendanceRequest::STATUS_PENDING, StaffAttendanceRequest::STATUS_APPROVED])
            ->whereDate('date_from', '<=', $to->toDateString())
            ->whereDate('date_to', '>=', $from->toDateString())
            ->orderBy('created_at')
            ->get();

        $byDate = [];

        foreach ($rows as $row) {
            $start = $row->date_from->copy()->max($from);
            $end = $row->date_to->copy()->min($to);

            for ($date = $start->copy(); $date->lte($end); $date->addDay()) {
                // A pending request is the one the staff member is waiting on,
                // so it wins the slot over an approval already applied.
                $existing = $byDate[$date->toDateString()] ?? null;
                if ($existing !== null && $existing['status'] === StaffAttendanceRequest::STATUS_PENDING) {
                    continue;
                }

                $byDate[$date->toDateString()] = [
                    'id' => $row->id,
                    'kind' => $row->kind,
                    'status' => $row->status,
                ];
            }
        }

        return $byDate;
    }

    private function resolveInstitutionId(Request $request): ?string
    {
        $user = $request->user();
        if (! $user instanceof User) {
            return null;
        }

        return $user->getDefaultInstitutionId()
            ?: $user->userInstitutions()->first()?->institution_id;
    }

    private function isStudentUser(Request $request): bool
    {
        $user = $request->user();
        if (! $user || $user instanceof StudentPortalUser) {
            return true;
        }

        $role = method_exists($user, 'getRole') ? $user->getRole() : null;

        return (string) ($role->slug ?? '') === 'student';
    }
}
