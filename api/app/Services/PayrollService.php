<?php

namespace App\Services;

use App\Models\AttendanceLog;
use App\Models\Institution;
use App\Models\PayrollCompensation;
use App\Models\PayrollPeriod;
use App\Models\Payslip;
use App\Models\PayslipDay;
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

        $holidayDates = StaffCalendarEvent::where('institution_id', $institutionId)
            ->where('type', 'holiday')
            ->whereBetween('event_date', [$from->toDateString(), $to->toDateString()])
            ->pluck('event_date')
            ->map(fn ($date) => Carbon::parse($date)->toDateString())
            ->flip();

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

        DB::transaction(function () use ($period, $compensations, $assignments, $punches, $holidayDates, $lateRate, $undertimeRate, $defaultOvertimeRate, &$generated) {
            $period->payslips()->delete();

            foreach ($compensations as $compensation) {
                // Per-staff overtime rate, falling back to the institution default.
                $overtimeRate = $compensation->effectiveOvertimeRate($defaultOvertimeRate);
                $this->buildPayslip($period, $compensation, $assignments->get($compensation->user_id), $punches[$compensation->user_id] ?? [], $holidayDates, $lateRate, $undertimeRate, $overtimeRate);
                $generated++;
            }
        });

        return ['generated' => $generated];
    }

    private function buildPayslip(
        PayrollPeriod $period,
        PayrollCompensation $compensation,
        ?StaffScheduleAssignment $assignment,
        array $userPunches,
        \Illuminate\Support\Collection $holidayDates,
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

            $dayPunches = $userPunches[$dateKey] ?? [];
            $timeIn = null;
            $timeOut = null;
            if (count($dayPunches) >= 1) {
                $timeIn = $dayPunches[0]->format('H:i:s');
            }
            if (count($dayPunches) >= 2) {
                $timeOut = end($dayPunches)->format('H:i:s');
            }

            $lunchStart = $scheduleDay?->lunch_start;
            $lunchEnd = $scheduleDay?->lunch_end;

            $requiredHours = $scheduleDay
                ? $this->netScheduleHours($scheduleDay->start_time, $scheduleDay->end_time, $lunchStart, $lunchEnd)
                : (float) $compensation->hours_per_day;

            $isHoliday = $holidayDates->has($dateKey);
            $hours = $this->workedHours($timeIn, $timeOut, $lunchStart, $lunchEnd);
            $priced = $this->priceDay(
                $timeIn,
                $timeOut,
                $scheduleDay?->start_time,
                $scheduleDay?->end_time,
                (int) ($scheduleDay->grace_minutes ?? 0),
                $isHoliday,
                $hours,
                $requiredHours,
                (float) $compensation->daily_rate,
                $hourlyRate,
                $lateRate,
                $undertimeRate,
                0, // approved overtime starts at zero — a payroll manager grants it per day
                $overtimeRate
            );

            $rows[] = new PayslipDay([
                'work_date' => $dateKey,
                'time_in' => $timeIn,
                'time_out' => $timeOut,
                'lunch_start' => $lunchStart,
                'lunch_end' => $lunchEnd,
                'schedule_start' => $scheduleDay?->start_time,
                'schedule_end' => $scheduleDay?->end_time,
                'grace_minutes' => (int) ($scheduleDay->grace_minutes ?? 0),
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

        // Copy the staff member's default deductions onto the payslip.
        foreach ($compensation->deductions as $deduction) {
            $hasAmount = (float) $deduction->amount > 0 || (float) $deduction->employer_amount > 0;
            if (! $hasAmount || ! $deduction->deductionType?->is_active) {
                continue;
            }
            $payslip->deductions()->create([
                'deduction_type_id' => $deduction->deduction_type_id,
                'name' => $deduction->deductionType->name,
                'amount' => $deduction->amount,
                'employer_amount' => $deduction->employer_amount,
            ]);
        }

        $this->recomputeTotals($payslip);

        return $payslip;
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
            'days_worked' => $days->filter(fn ($day) => (float) $day->hours_worked > 0)->count(),
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
        float $overtimeRate
    ): array {
        $detectedOvertime = 0;
        if (! $isHoliday && $scheduleEnd && $timeOut) {
            $detectedOvertime = intdiv(max(0, $this->toSeconds($timeOut) - $this->toSeconds($scheduleEnd)), 60);
        }

        $overtimeAmount = round($overtimeMinutes * $overtimeRate, 2);

        $usePenalties = ! $isHoliday
            && $scheduleStart && $scheduleEnd
            && $timeIn && $timeOut
            && ($lateRate > 0 || $undertimeRate > 0);

        if (! $usePenalties) {
            return [
                'late_minutes' => 0,
                'undertime_minutes' => 0,
                'penalty_amount' => 0.0,
                'detected_overtime_minutes' => $detectedOvertime,
                'overtime_amount' => $overtimeAmount,
                'amount_earned' => round($this->earnedAmount($hours, $requiredHours, $dailyRate, $hourlyRate) + $overtimeAmount, 2),
            ];
        }

        $graceEnd = $this->toSeconds($scheduleStart) + $graceMinutes * 60;
        $lateMinutes = intdiv(max(0, $this->toSeconds($timeIn) - $graceEnd), 60);
        $undertimeMinutes = intdiv(max(0, $this->toSeconds($scheduleEnd) - $this->toSeconds($timeOut)), 60);
        $penalty = round($lateMinutes * $lateRate + $undertimeMinutes * $undertimeRate, 2);

        return [
            'late_minutes' => $lateMinutes,
            'undertime_minutes' => $undertimeMinutes,
            'penalty_amount' => $penalty,
            'detected_overtime_minutes' => $detectedOvertime,
            'overtime_amount' => $overtimeAmount,
            'amount_earned' => round(max(0, $dailyRate - $penalty) + $overtimeAmount, 2),
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
            (float) $payslip->overtime_rate_per_minute
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

    private function netScheduleHours(string $start, string $end, ?string $lunchStart, ?string $lunchEnd): float
    {
        $seconds = $this->toSeconds($end) - $this->toSeconds($start);

        if ($lunchStart && $lunchEnd && $lunchEnd > $lunchStart) {
            $seconds -= $this->toSeconds($lunchEnd) - $this->toSeconds($lunchStart);
        }

        return round(max(0, $seconds) / 3600, 2);
    }

    private function toSeconds(string $time): int
    {
        [$hours, $minutes, $seconds] = array_pad(array_map('intval', explode(':', $time)), 3, 0);

        return $hours * 3600 + $minutes * 60 + $seconds;
    }
}
