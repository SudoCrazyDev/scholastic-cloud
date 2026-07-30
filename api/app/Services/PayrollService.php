<?php

namespace App\Services;

use App\Models\AttendanceLog;
use App\Models\Institution;
use App\Models\PayrollCompensation;
use App\Models\PayrollDeductionType;
use App\Models\PayrollPeriod;
use App\Models\Payslip;
use App\Models\PayslipDay;
use App\Models\StaffAttendanceRequest;
use App\Models\StaffCalendarEvent;
use App\Models\StaffScheduleAssignment;
use Carbon\Carbon;
use Carbon\CarbonPeriod;
use Illuminate\Support\Facades\DB;

class PayrollService
{
    /**
     * (Re)build every payslip for a period from the biometric attendance logs.
     * Payslips are generated for staff that have a compensation record.
     * Existing payslips for the period are replaced.
     *
     * @return array{generated: int, skipped_no_rate: int}
     */
    public function generateForPeriod(PayrollPeriod $period): array
    {
        $institutionId = $period->institution_id;
        $from = $period->date_from->copy()->startOfDay();
        $to = $period->date_to->copy()->endOfDay();

        // Institution-wide penalty rates plus the default overtime rate,
        // snapshotted per payslip. Overtime can be overridden per staff.
        $institution = Institution::find($institutionId);
        $lateRate = (float) ($institution->late_penalty_per_minute ?? 0);
        $undertimeRate = (float) ($institution->undertime_penalty_per_minute ?? 0);
        $defaultOvertimeRate = (float) ($institution->overtime_rate_per_minute ?? 0);

        $compensations = PayrollCompensation::with('deductions.deductionType')
            ->where('institution_id', $institutionId)
            ->get();
        $userIds = $compensations->pluck('user_id')->all();

        // The institution's deduction catalog. A type carrying a default
        // amount applies to every staff member who has no amount of their own,
        // so a new deduction reaches payroll without being typed per employee.
        $deductionTypes = PayrollDeductionType::where('institution_id', $institutionId)
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get();

        $calendarEntries = StaffCalendarEvent::where('institution_id', $institutionId)
            ->whereBetween('event_date', [$from->toDateString(), $to->toDateString()])
            ->get();

        $holidayDates = $calendarEntries
            ->where('type', 'holiday')
            ->pluck('event_date')
            ->map(fn ($date) => Carbon::parse($date)->toDateString())
            ->flip();

        // Institution-wide pay policy per date (suspensions, paid holidays).
        $dayPolicies = $this->buildDayPolicies($calendarEntries);

        // Approved per-staff exceptions, expanded per date: [user_id][Y-m-d].
        $staffExceptions = $this->buildStaffExceptions($institutionId, $userIds, $from, $to);

        $assignments = StaffScheduleAssignment::with('staffSchedule.days')
            ->where('institution_id', $institutionId)
            ->whereIn('user_id', $userIds ?: ['-'])
            ->get()
            ->keyBy('user_id');

        // punches[user_id][Y-m-d] => sorted list of punched_at Carbon instances
        $punches = [];
        AttendanceLog::where('institution_id', $institutionId)
            ->whereIn('user_id', $userIds ?: ['-'])
            ->whereBetween('punched_at', [$from, $to])
            ->orderBy('punched_at')
            ->get(['user_id', 'punched_at'])
            ->each(function (AttendanceLog $log) use (&$punches) {
                $punches[$log->user_id][$log->punched_at->toDateString()][] = $log->punched_at;
            });

        $generated = 0;

        DB::transaction(function () use ($period, $compensations, $deductionTypes, $assignments, $punches, $holidayDates, $dayPolicies, $staffExceptions, $lateRate, $undertimeRate, $defaultOvertimeRate, &$generated) {
            $period->payslips()->delete();

            foreach ($compensations as $compensation) {
                // Per-staff overtime rate, falling back to the institution default.
                $overtimeRate = $compensation->effectiveOvertimeRate($defaultOvertimeRate);
                $this->buildPayslip(
                    $period,
                    $compensation,
                    $deductionTypes,
                    $assignments->get($compensation->user_id),
                    $punches[$compensation->user_id] ?? [],
                    $holidayDates,
                    $dayPolicies,
                    $staffExceptions[$compensation->user_id] ?? [],
                    $lateRate,
                    $undertimeRate,
                    $overtimeRate
                );
                $generated++;
            }
        });

        return ['generated' => $generated];
    }

    /**
     * @param  \Illuminate\Support\Collection<int, PayrollDeductionType>  $deductionTypes  the institution's active catalog
     * @param  array<string, array>  $dayPolicies  institution-wide policy keyed by Y-m-d
     * @param  array<string, array>  $userExceptions  this staff member's approved exceptions keyed by Y-m-d
     */
    private function buildPayslip(
        PayrollPeriod $period,
        PayrollCompensation $compensation,
        \Illuminate\Support\Collection $deductionTypes,
        ?StaffScheduleAssignment $assignment,
        array $userPunches,
        \Illuminate\Support\Collection $holidayDates,
        array $dayPolicies,
        array $userExceptions,
        float $lateRate,
        float $undertimeRate,
        float $overtimeRate
    ): Payslip {
        $hourlyRate = $compensation->effectiveHourlyRate();
        $scheduleDays = $assignment?->staffSchedule?->days;

        $payslip = Payslip::create([
            'institution_id' => $period->institution_id,
            'payroll_period_id' => $period->id,
            'user_id' => $compensation->user_id,
            'designation' => $compensation->designation,
            'daily_rate' => $compensation->daily_rate,
            'hourly_rate' => $hourlyRate,
            'hours_per_day' => $compensation->hours_per_day,
            'late_penalty_per_minute' => $lateRate,
            'undertime_penalty_per_minute' => $undertimeRate,
            'overtime_rate_per_minute' => $overtimeRate,
        ]);

        $rows = [];
        foreach (CarbonPeriod::create($period->date_from, $period->date_to) as $date) {
            $dateKey = $date->toDateString();
            $weekday = strtolower($date->format('l'));
            $scheduleDay = $scheduleDays?->firstWhere('day_of_week', $weekday);

            // With a schedule, an absent weekday row means a rest day;
            // without one, Saturday and Sunday are treated as rest days.
            $isRestDay = $scheduleDays !== null && $scheduleDays->isNotEmpty()
                ? $scheduleDay === null
                : $date->isWeekend();

            // Institution-wide policy for the date merged with this staff
            // member's own approved requests.
            $exception = $this->mergeException(
                $dayPolicies[$dateKey] ?? null,
                $userExceptions[$dateKey] ?? null,
                $isRestDay
            );

            $dayPunches = $userPunches[$dateKey] ?? [];
            $timeIn = null;
            $timeOut = null;
            if (count($dayPunches) >= 1) {
                $timeIn = $dayPunches[0]->format('H:i:s');
            }
            if (count($dayPunches) >= 2) {
                $timeOut = end($dayPunches)->format('H:i:s');
            }

            // An approved request may supply the times a missing punch would
            // have recorded. It never overwrites a real punch.
            $timeIn ??= $exception['credited_time_in'];
            $timeOut ??= $exception['credited_time_out'];

            $lunchStart = $scheduleDay?->lunch_start;
            $lunchEnd = $scheduleDay?->lunch_end;

            $scheduleStart = $scheduleDay?->start_time;
            // A dismissal time (LGU half-day) shortens the day: payroll stores
            // it as the effective schedule end, so undertime is measured
            // against dismissal and a staff member who stayed until then earns
            // the full daily rate through the ordinary penalty model.
            $scheduleEnd = $this->effectiveScheduleEnd($scheduleStart, $scheduleDay?->end_time, $exception['dismissal_time']);

            $requiredHours = $scheduleDay
                ? $this->netScheduleHours($scheduleStart, $scheduleEnd, $lunchStart, $lunchEnd)
                : (float) $compensation->hours_per_day;

            $isHoliday = $holidayDates->has($dateKey);
            $hours = $this->workedHours($timeIn, $timeOut, $lunchStart, $lunchEnd);
            $priced = $this->priceDay(
                $timeIn,
                $timeOut,
                $scheduleStart,
                $scheduleEnd,
                (int) ($scheduleDay->grace_minutes ?? 0),
                $isHoliday,
                $hours,
                $requiredHours,
                (float) $compensation->daily_rate,
                $hourlyRate,
                $lateRate,
                $undertimeRate,
                0, // approved overtime starts at zero — a payroll manager grants it per day
                $overtimeRate,
                $exception['waive_late'],
                $exception['waive_undertime'],
                $exception['pay_policy']
            );

            $rows[] = new PayslipDay([
                'work_date' => $dateKey,
                'time_in' => $timeIn,
                'time_out' => $timeOut,
                'lunch_start' => $lunchStart,
                'lunch_end' => $lunchEnd,
                'schedule_start' => $scheduleStart,
                'schedule_end' => $scheduleEnd,
                'grace_minutes' => (int) ($scheduleDay->grace_minutes ?? 0),
                'waive_late' => $exception['waive_late'],
                'waive_undertime' => $exception['waive_undertime'],
                'pay_policy' => $exception['pay_policy'],
                'exception_label' => $exception['label'],
                'required_hours' => round($requiredHours, 2),
                'hours_worked' => $hours,
                'late_minutes' => $priced['late_minutes'],
                'undertime_minutes' => $priced['undertime_minutes'],
                'penalty_amount' => $priced['penalty_amount'],
                'detected_overtime_minutes' => $priced['detected_overtime_minutes'],
                'overtime_minutes' => 0,
                'overtime_amount' => $priced['overtime_amount'],
                'amount_earned' => $priced['amount_earned'],
                'is_holiday' => $isHoliday,
                'is_rest_day' => $isRestDay,
            ]);
        }

        $payslip->days()->saveMany($rows);

        foreach ($this->resolveDeductions($compensation, $deductionTypes) as $line) {
            $payslip->deductions()->create($line);
        }

        $this->recomputeTotals($payslip);

        return $payslip;
    }

    /**
     * The deduction lines a payslip starts with.
     *
     * Each active type in the catalog resolves to one amount: the staff
     * member's own figure when they have a row for it, otherwise the type's
     * default. That fallback is what lets a deduction added to the catalog
     * reach payroll on the next generate without being entered per employee.
     *
     * A staff row of 0 against a type that *does* carry a default is an
     * exemption and stays at 0 — somebody set that deliberately in Employee
     * Rates. Lines that resolve to nothing on both sides are skipped.
     *
     * @param  \Illuminate\Support\Collection<int, PayrollDeductionType>  $deductionTypes
     * @return array<int, array{deduction_type_id: string, name: string, amount: float, employer_amount: float}>
     */
    public function resolveDeductions(PayrollCompensation $compensation, \Illuminate\Support\Collection $deductionTypes): array
    {
        $staffAmounts = $compensation->deductions->keyBy('deduction_type_id');
        $lines = [];

        foreach ($deductionTypes as $type) {
            if (! $type->is_active) {
                continue;
            }

            $own = $staffAmounts->get($type->id);

            $amount = $own !== null
                ? (float) $own->amount
                : (float) $type->default_amount;

            $employerAmount = 0.0;
            if ($type->has_employer_share) {
                $employerAmount = $own !== null
                    ? (float) $own->employer_amount
                    : (float) $type->default_employer_amount;
            }

            if ($amount <= 0 && $employerAmount <= 0) {
                continue;
            }

            $lines[] = [
                'deduction_type_id' => $type->id,
                // Snapshot the name so deleting the type never rewrites history.
                'name' => $type->name,
                'amount' => $amount,
                'employer_amount' => $employerAmount,
            ];
        }

        return $lines;
    }

    /**
     * Recompute a single day (after a manual time edit) using the
     * payslip's snapshot rates, then refresh the payslip totals.
     */
    public function recomputeDay(Payslip $payslip, PayslipDay $day): void
    {
        $hours = $this->workedHours($day->time_in, $day->time_out, $day->lunch_start, $day->lunch_end);
        $priced = $this->priceDayFromSnapshots($payslip, $day, $hours);

        $day->update([
            'hours_worked' => $hours,
            'late_minutes' => $priced['late_minutes'],
            'undertime_minutes' => $priced['undertime_minutes'],
            'penalty_amount' => $priced['penalty_amount'],
            'detected_overtime_minutes' => $priced['detected_overtime_minutes'],
            'overtime_amount' => $priced['overtime_amount'],
            'amount_earned' => $priced['amount_earned'],
        ]);

        $this->recomputeTotals($payslip);
    }

    /**
     * Re-price every day after the payslip's snapshot rates were edited
     * (hours stay as-is), then refresh the totals.
     */
    public function applyRates(Payslip $payslip): void
    {
        foreach ($payslip->days()->get() as $day) {
            $priced = $this->priceDayFromSnapshots($payslip, $day, (float) $day->hours_worked);

            $day->update([
                'late_minutes' => $priced['late_minutes'],
                'undertime_minutes' => $priced['undertime_minutes'],
                'penalty_amount' => $priced['penalty_amount'],
                'detected_overtime_minutes' => $priced['detected_overtime_minutes'],
                'overtime_amount' => $priced['overtime_amount'],
                'amount_earned' => $priced['amount_earned'],
            ]);
        }

        $this->recomputeTotals($payslip);
    }

    /**
     * Refresh derived columns from the day rows + deduction fields.
     */
    public function recomputeTotals(Payslip $payslip): void
    {
        $days = $payslip->days()->get();

        $gross = round((float) $days->sum('amount_earned'), 2);
        $totalDeductions = round((float) $payslip->deductions()->sum('amount'), 2);

        $payslip->update([
            // A fully-paid exception day counts as worked even with no punches
            // (approved official business, a paid suspension).
            'days_worked' => $days->filter(fn ($day) => (float) $day->hours_worked > 0
                || $day->pay_policy === PayslipDay::PAY_FULL_DAY)->count(),
            'hours_worked' => round((float) $days->sum('hours_worked'), 2),
            'late_minutes' => (int) $days->sum('late_minutes'),
            'undertime_minutes' => (int) $days->sum('undertime_minutes'),
            'penalty_total' => round((float) $days->sum('penalty_amount'), 2),
            'overtime_minutes' => (int) $days->sum('overtime_minutes'),
            'overtime_total' => round((float) $days->sum('overtime_amount'), 2),
            'gross_pay' => $gross,
            'total_deductions' => $totalDeductions,
            'net_pay' => round($gross - $totalDeductions, 2),
        ]);
    }

    /**
     * Hours between the first and last punch, minus any overlap with the
     * lunch break. A day with no closing punch counts zero hours.
     */
    private function workedHours(?string $timeIn, ?string $timeOut, ?string $lunchStart, ?string $lunchEnd): float
    {
        if (! $timeIn || ! $timeOut || $timeOut <= $timeIn) {
            return 0.0;
        }

        $seconds = $this->toSeconds($timeOut) - $this->toSeconds($timeIn);

        if ($lunchStart && $lunchEnd && $lunchEnd > $lunchStart) {
            $overlap = min($this->toSeconds($timeOut), $this->toSeconds($lunchEnd))
                - max($this->toSeconds($timeIn), $this->toSeconds($lunchStart));
            $seconds -= max(0, $overlap);
        }

        return round(max(0, $seconds) / 3600, 2);
    }

    /**
     * Price one day.
     *
     * Penalty model — applies when the day has a schedule, is not a holiday,
     * both punches exist, and at least one penalty rate is set: the day earns
     * the full daily rate minus ₱/minute for arriving beyond start + grace
     * (late) and for punching out before the end time (undertime), never
     * below zero. Only completed minutes count (seconds are dropped).
     *
     * Otherwise falls back to the V1 hours-based pricing, with no penalties
     * (rest days, holidays, staff without a schedule, incomplete punches,
     * or both rates set to 0).
     *
     * Overtime: minutes punched out past the scheduled end are only detected
     * (informational) — pay comes solely from the approved $overtimeMinutes
     * a payroll manager granted on the day, at ₱/minute, on top of the base.
     *
     * Day exceptions (a calendar suspension or an approved staff request)
     * layer on top:
     *
     * - $waiveLate / $waiveUndertime zero out the corresponding penalty. This
     *   is the only thing that forgives a penalty.
     * - $payPolicy `full_day` replaces the *hours-based fallback* with the
     *   daily rate, so a staff member out on approved official business with
     *   no punch at all is still paid. It deliberately does NOT apply on the
     *   penalty branch, which already starts from the full daily rate — the
     *   surviving penalty there is one no waiver covered, and an approved
     *   early-out must not silently forgive an unrelated late arrival.
     * - $payPolicy `no_pay` zeroes the day outright, overtime included.
     *
     * @return array{late_minutes: int, undertime_minutes: int, penalty_amount: float, detected_overtime_minutes: int, overtime_amount: float, amount_earned: float}
     */
    private function priceDay(
        ?string $timeIn,
        ?string $timeOut,
        ?string $scheduleStart,
        ?string $scheduleEnd,
        int $graceMinutes,
        bool $isHoliday,
        float $hours,
        float $requiredHours,
        float $dailyRate,
        float $hourlyRate,
        float $lateRate,
        float $undertimeRate,
        int $overtimeMinutes,
        float $overtimeRate,
        bool $waiveLate = false,
        bool $waiveUndertime = false,
        string $payPolicy = PayslipDay::PAY_NORMAL
    ): array {
        $detectedOvertime = 0;
        if (! $isHoliday && $scheduleEnd && $timeOut) {
            $detectedOvertime = intdiv(max(0, $this->toSeconds($timeOut) - $this->toSeconds($scheduleEnd)), 60);
        }

        if ($payPolicy === PayslipDay::PAY_NO_PAY) {
            return [
                'late_minutes' => 0,
                'undertime_minutes' => 0,
                'penalty_amount' => 0.0,
                'detected_overtime_minutes' => $detectedOvertime,
                'overtime_amount' => 0.0,
                'amount_earned' => 0.0,
            ];
        }

        $payFullDay = $payPolicy === PayslipDay::PAY_FULL_DAY;
        $overtimeAmount = round($overtimeMinutes * $overtimeRate, 2);

        $usePenalties = ! $isHoliday
            && $scheduleStart && $scheduleEnd
            && $timeIn && $timeOut
            && ($lateRate > 0 || $undertimeRate > 0);

        if (! $usePenalties) {
            $base = $payFullDay
                ? round($dailyRate, 2)
                : $this->earnedAmount($hours, $requiredHours, $dailyRate, $hourlyRate);

            return [
                'late_minutes' => 0,
                'undertime_minutes' => 0,
                'penalty_amount' => 0.0,
                'detected_overtime_minutes' => $detectedOvertime,
                'overtime_amount' => $overtimeAmount,
                'amount_earned' => round($base + $overtimeAmount, 2),
            ];
        }

        $graceEnd = $this->toSeconds($scheduleStart) + $graceMinutes * 60;
        $lateMinutes = $waiveLate ? 0 : intdiv(max(0, $this->toSeconds($timeIn) - $graceEnd), 60);
        $undertimeMinutes = $waiveUndertime ? 0 : intdiv(max(0, $this->toSeconds($scheduleEnd) - $this->toSeconds($timeOut)), 60);
        $penalty = round($lateMinutes * $lateRate + $undertimeMinutes * $undertimeRate, 2);

        // No $payFullDay here on purpose: this branch already starts from the
        // full daily rate, and the surviving penalty is one the exception did
        // not waive. An approved early-out must not also forgive lateness.
        $base = max(0, $dailyRate - $penalty);

        return [
            'late_minutes' => $lateMinutes,
            'undertime_minutes' => $undertimeMinutes,
            'penalty_amount' => $penalty,
            'detected_overtime_minutes' => $detectedOvertime,
            'overtime_amount' => $overtimeAmount,
            'amount_earned' => round($base + $overtimeAmount, 2),
        ];
    }

    /**
     * priceDay() fed from the snapshots stored on the payslip and its day row
     * (used after manual time or rate edits).
     */
    private function priceDayFromSnapshots(Payslip $payslip, PayslipDay $day, float $hours): array
    {
        return $this->priceDay(
            $day->time_in,
            $day->time_out,
            $day->schedule_start,
            $day->schedule_end,
            (int) $day->grace_minutes,
            (bool) $day->is_holiday,
            $hours,
            (float) $day->required_hours,
            (float) $payslip->daily_rate,
            (float) $payslip->hourly_rate,
            (float) $payslip->late_penalty_per_minute,
            (float) $payslip->undertime_penalty_per_minute,
            (int) $day->overtime_minutes,
            (float) $payslip->overtime_rate_per_minute,
            (bool) $day->waive_late,
            (bool) $day->waive_undertime,
            (string) ($day->pay_policy ?: PayslipDay::PAY_NORMAL)
        );
    }

    /**
     * Full required hours earn the daily rate; anything less is paid
     * per hour, never exceeding the daily rate. No overtime in V1.
     */
    private function earnedAmount(float $hours, float $requiredHours, float $dailyRate, float $hourlyRate): float
    {
        if ($hours <= 0) {
            return 0.0;
        }

        if ($requiredHours > 0 && $hours >= $requiredHours) {
            return round($dailyRate, 2);
        }

        return round(min($hours * $hourlyRate, $dailyRate), 2);
    }

    /**
     * Institution-wide pay policy per date, from the staff calendar.
     *
     * Multiple entries may share a date. They are merged conservatively:
     * the earliest dismissal wins (the shortest day is the one that was
     * actually announced), and a paid treatment outranks an unpaid one.
     *
     * @param  \Illuminate\Support\Collection<int, StaffCalendarEvent>  $entries
     * @return array<string, array{pay_treatment: string, dismissal_time: ?string, label: string}>
     */
    private function buildDayPolicies(\Illuminate\Support\Collection $entries): array
    {
        $policies = [];

        foreach ($entries as $entry) {
            if (! $entry->affectsPay()) {
                continue;
            }

            $dateKey = Carbon::parse($entry->event_date)->toDateString();
            $dismissal = $entry->dismissal_time ? substr((string) $entry->dismissal_time, 0, 8) : null;
            $existing = $policies[$dateKey] ?? null;

            if ($existing === null) {
                $policies[$dateKey] = [
                    'pay_treatment' => $entry->pay_treatment,
                    'dismissal_time' => $dismissal,
                    'label' => $entry->title,
                ];

                continue;
            }

            if ($dismissal !== null && ($existing['dismissal_time'] === null || $dismissal < $existing['dismissal_time'])) {
                $policies[$dateKey]['dismissal_time'] = $dismissal;
            }

            if ($entry->pay_treatment === StaffCalendarEvent::PAY_FULL_DAY
                || ($entry->pay_treatment === StaffCalendarEvent::PAY_NO_PAY && $existing['pay_treatment'] === StaffCalendarEvent::PAY_NORMAL)) {
                $policies[$dateKey]['pay_treatment'] = $entry->pay_treatment;
            }

            $policies[$dateKey]['label'] = $existing['label'].' · '.$entry->title;
        }

        return $policies;
    }

    /**
     * Approved staff attendance requests, expanded to one entry per covered
     * date: [user_id][Y-m-d]. Only approved rows reach payroll — pending or
     * disapproved requests have no effect on pay.
     *
     * Overlapping approvals for the same day are unioned (any waiver granted
     * stays granted) since each was approved on its own merits.
     *
     * @param  array<int, string>  $userIds
     * @return array<string, array<string, array>>
     */
    private function buildStaffExceptions(string $institutionId, array $userIds, Carbon $from, Carbon $to): array
    {
        $requests = StaffAttendanceRequest::where('institution_id', $institutionId)
            ->where('status', StaffAttendanceRequest::STATUS_APPROVED)
            ->whereIn('user_id', $userIds ?: ['-'])
            ->whereDate('date_from', '<=', $to->toDateString())
            ->whereDate('date_to', '>=', $from->toDateString())
            ->orderBy('created_at')
            ->get();

        $exceptions = [];

        foreach ($requests as $requestRow) {
            $start = $requestRow->date_from->copy()->max($from->copy()->startOfDay());
            $end = $requestRow->date_to->copy()->min($to->copy()->startOfDay());
            $label = $this->kindLabel($requestRow->kind);

            foreach (CarbonPeriod::create($start, $end) as $date) {
                $dateKey = $date->toDateString();
                $existing = $exceptions[$requestRow->user_id][$dateKey] ?? null;

                $exceptions[$requestRow->user_id][$dateKey] = [
                    'waive_late' => ($existing['waive_late'] ?? false) || $requestRow->waive_late,
                    'waive_undertime' => ($existing['waive_undertime'] ?? false) || $requestRow->waive_undertime,
                    'pay_full_day' => ($existing['pay_full_day'] ?? false) || $requestRow->pay_full_day,
                    'credited_time_in' => $existing['credited_time_in'] ?? $requestRow->credited_time_in,
                    'credited_time_out' => $existing['credited_time_out'] ?? $requestRow->credited_time_out,
                    'label' => $existing ? $existing['label'].' · '.$label : $label,
                ];
            }
        }

        return $exceptions;
    }

    /**
     * Collapse the institution-wide policy and the staff member's own
     * approved request into the single set of knobs priceDay understands.
     *
     * Precedence: an individually approved `pay_full_day` beats a blanket
     * `no_pay`, because it was granted for that specific person and date.
     *
     * A rest day is never turned into a paid day by an institution-wide
     * policy — otherwise a paid holiday landing on a Sunday would hand every
     * staff member an extra day's pay for a day they never work. An
     * individually approved request still counts, since somebody reviewed it.
     *
     * @return array{waive_late: bool, waive_undertime: bool, pay_policy: string, dismissal_time: ?string, credited_time_in: ?string, credited_time_out: ?string, label: ?string}
     */
    private function mergeException(?array $policy, ?array $staffException, bool $isRestDay = false): array
    {
        $waiveLate = (bool) ($staffException['waive_late'] ?? false);
        $waiveUndertime = (bool) ($staffException['waive_undertime'] ?? false);
        $payFullDay = (bool) ($staffException['pay_full_day'] ?? false);
        $noPay = false;
        $labels = [];

        $dismissalTime = null;

        if ($policy !== null) {
            // The entry is still named on the printed record; only its pay
            // effect is suppressed on a rest day.
            $labels[] = $policy['label'];

            if (! $isRestDay) {
                $dismissalTime = $policy['dismissal_time'];

                if ($policy['pay_treatment'] === StaffCalendarEvent::PAY_FULL_DAY) {
                    // Nobody is expected to report on a fully-paid suspension,
                    // so any punch that does land must not be penalised.
                    $payFullDay = true;
                    $waiveLate = true;
                    $waiveUndertime = true;
                } elseif ($policy['pay_treatment'] === StaffCalendarEvent::PAY_NO_PAY) {
                    $noPay = true;
                }
            }
        }

        if (($staffException['label'] ?? null) !== null) {
            $labels[] = $staffException['label'];
        }

        $payPolicy = PayslipDay::PAY_NORMAL;
        if ($payFullDay) {
            $payPolicy = PayslipDay::PAY_FULL_DAY;
        } elseif ($noPay) {
            $payPolicy = PayslipDay::PAY_NO_PAY;
        }

        return [
            'waive_late' => $waiveLate,
            'waive_undertime' => $waiveUndertime,
            'pay_policy' => $payPolicy,
            'dismissal_time' => $dismissalTime,
            'credited_time_in' => $staffException['credited_time_in'] ?? null,
            'credited_time_out' => $staffException['credited_time_out'] ?? null,
            'label' => $labels === [] ? null : implode(' · ', $labels),
        ];
    }

    /**
     * The day's effective end time: normally the scheduled end, but pulled
     * back to an announced dismissal time when that lands earlier. Clamped to
     * the start so a dismissal before a staff member's shift even begins
     * yields a zero-length day rather than a negative one.
     */
    private function effectiveScheduleEnd(?string $scheduleStart, ?string $scheduleEnd, ?string $dismissalTime): ?string
    {
        if ($scheduleEnd === null || $dismissalTime === null) {
            return $scheduleEnd;
        }

        if ($this->toSeconds($dismissalTime) >= $this->toSeconds($scheduleEnd)) {
            return $scheduleEnd;
        }

        if ($scheduleStart !== null && $this->toSeconds($dismissalTime) <= $this->toSeconds($scheduleStart)) {
            return $scheduleStart;
        }

        return $dismissalTime;
    }

    private function kindLabel(string $kind): string
    {
        return match ($kind) {
            StaffAttendanceRequest::KIND_LATE_ARRIVAL => 'Excused late arrival',
            StaffAttendanceRequest::KIND_EARLY_OUT => 'Approved early out',
            StaffAttendanceRequest::KIND_OFFICIAL_BUSINESS => 'Official business',
            StaffAttendanceRequest::KIND_FORGOT_PUNCH => 'Missed punch',
            default => 'Attendance exception',
        };
    }

    /**
     * Scheduled hours minus the lunch break. The break is clipped to the
     * working window so a shortened day (dismissal at noon with a 12:00–13:00
     * lunch) is not charged for a break that never happened.
     */
    private function netScheduleHours(string $start, string $end, ?string $lunchStart, ?string $lunchEnd): float
    {
        $startSeconds = $this->toSeconds($start);
        $endSeconds = $this->toSeconds($end);
        $seconds = max(0, $endSeconds - $startSeconds);

        if ($lunchStart && $lunchEnd && $lunchEnd > $lunchStart) {
            $overlap = min($endSeconds, $this->toSeconds($lunchEnd)) - max($startSeconds, $this->toSeconds($lunchStart));
            $seconds -= max(0, $overlap);
        }

        return round(max(0, $seconds) / 3600, 2);
    }

    private function toSeconds(string $time): int
    {
        [$hours, $minutes, $seconds] = array_pad(array_map('intval', explode(':', $time)), 3, 0);

        return $hours * 3600 + $minutes * 60 + $seconds;
    }
}
