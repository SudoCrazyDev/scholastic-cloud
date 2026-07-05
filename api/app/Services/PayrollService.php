<?php

namespace App\Services;

use App\Models\AttendanceLog;
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

        DB::transaction(function () use ($period, $compensations, $assignments, $punches, $holidayDates, &$generated) {
            $period->payslips()->delete();

            foreach ($compensations as $compensation) {
                $this->buildPayslip($period, $compensation, $assignments->get($compensation->user_id), $punches[$compensation->user_id] ?? [], $holidayDates);
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
        \Illuminate\Support\Collection $holidayDates
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
            'sss_employer' => $compensation->sss_employer,
            'pagibig_employer' => $compensation->pagibig_employer,
            'philhealth_employer' => $compensation->philhealth_employer,
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

            $hours = $this->workedHours($timeIn, $timeOut, $lunchStart, $lunchEnd);
            $earned = $this->earnedAmount($hours, $requiredHours, (float) $compensation->daily_rate, $hourlyRate);

            $rows[] = new PayslipDay([
                'work_date' => $dateKey,
                'time_in' => $timeIn,
                'time_out' => $timeOut,
                'lunch_start' => $lunchStart,
                'lunch_end' => $lunchEnd,
                'required_hours' => round($requiredHours, 2),
                'hours_worked' => $hours,
                'amount_earned' => $earned,
                'is_holiday' => $holidayDates->has($dateKey),
                'is_rest_day' => $isRestDay,
            ]);
        }

        $payslip->days()->saveMany($rows);

        // Copy the staff member's default deductions onto the payslip.
        foreach ($compensation->deductions as $deduction) {
            if ((float) $deduction->amount <= 0 || ! $deduction->deductionType?->is_active) {
                continue;
            }
            $payslip->deductions()->create([
                'deduction_type_id' => $deduction->deduction_type_id,
                'name' => $deduction->deductionType->name,
                'amount' => $deduction->amount,
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
        $earned = $this->earnedAmount(
            $hours,
            (float) $day->required_hours,
            (float) $payslip->daily_rate,
            (float) $payslip->hourly_rate
        );

        $day->update([
            'hours_worked' => $hours,
            'amount_earned' => $earned,
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
            $day->update([
                'amount_earned' => $this->earnedAmount(
                    (float) $day->hours_worked,
                    (float) $day->required_hours,
                    (float) $payslip->daily_rate,
                    (float) $payslip->hourly_rate
                ),
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
