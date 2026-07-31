<?php

namespace App\Http\Controllers;

use App\Auth\StudentPortalUser;
use App\Models\PayrollDeductionType;
use App\Models\PayrollPeriod;
use App\Models\Payslip;
use App\Models\PayslipDay;
use App\Models\PayslipDeduction;
use App\Models\User;
use App\Services\PayrollService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class PayslipController extends Controller
{
    /**
     * List the payslips of one payroll period.
     */
    public function indexByPeriod(Request $request, string $periodId): JsonResponse
    {
        if (! $this->isPayrollManager($request)) {
            return $this->payrollForbidden();
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return $this->noInstitution();
        }

        $period = PayrollPeriod::where('institution_id', $institutionId)->find($periodId);
        if (! $period) {
            return response()->json(['success' => false, 'message' => 'Payroll period not found'], 404);
        }

        $payslips = $period->payslips()->with('user')->get()
            ->sortBy(fn (Payslip $payslip) => mb_strtolower((string) $this->staffName($payslip->user)))
            ->values();

        return response()->json([
            'success' => true,
            // The dates these payslips are resting on assumed punches for.
            // Finalizing pays them out, so the screen names them first.
            'assumed_dates' => $this->assumedDates($payslips),
            'data' => $payslips->map(fn (Payslip $payslip) => $this->serializeSummary($payslip))->values(),
        ]);
    }

    /**
     * Every date in these payslips that carries an assumed punch, oldest first.
     *
     * @param  \Illuminate\Support\Collection<int, Payslip>  $payslips
     * @return array<int, string>
     */
    private function assumedDates(\Illuminate\Support\Collection $payslips): array
    {
        $ids = $payslips->where('assumed_days', '>', 0)->pluck('id');

        if ($ids->isEmpty()) {
            return [];
        }

        return PayslipDay::whereIn('payslip_id', $ids)
            ->where(fn ($query) => $query->where('assumed_time_in', true)->orWhere('assumed_time_out', true))
            ->orderBy('work_date')
            ->pluck('work_date')
            ->map(fn ($date) => Carbon::parse($date)->toDateString())
            ->unique()
            ->values()
            ->all();
    }

    /**
     * The whole period on one sheet — the printed "Monthly Summary of
     * Employee's Working Time & Salary". One row per payslip, with a column
     * per deduction line used anywhere in the period so the sheet only ever
     * carries the columns this institution actually uses.
     */
    public function sheetByPeriod(Request $request, string $periodId): JsonResponse
    {
        if (! $this->isPayrollManager($request)) {
            return $this->payrollForbidden();
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return $this->noInstitution();
        }

        $period = PayrollPeriod::with('institution')
            ->where('institution_id', $institutionId)
            ->find($periodId);

        if (! $period) {
            return response()->json(['success' => false, 'message' => 'Payroll period not found'], 404);
        }

        // Sorted by the name the sheet prints — surname first, so the column
        // reads down alphabetically.
        $payslips = $period->payslips()->with(['user', 'deductions', 'days'])->get()
            ->sortBy(fn (Payslip $payslip) => mb_strtolower((string) $this->sheetStaffName($payslip->user)))
            ->values();

        // Column order follows the institution's deduction catalog so the sheet
        // keeps the same shape month to month.
        $catalog = PayrollDeductionType::where('institution_id', $institutionId)
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get()
            ->values();
        $catalogPosition = $catalog->pluck('id')->flip();

        // A line the employer co-pays gets a column under OTHER BENEFITS as
        // well — that is what separates an SSS contribution from a cash advance.
        $sharesEmployer = $catalog->filter(fn (PayrollDeductionType $type) => (bool) $type->has_employer_share)
            ->pluck('id')
            ->flip();

        $lines = [];
        foreach ($payslips as $payslip) {
            foreach ($payslip->deductions as $deduction) {
                $key = $this->sheetLineKey($deduction);
                if (! isset($lines[$key])) {
                    $lines[$key] = [
                        'key' => $key,
                        'label' => $deduction->name,
                        // Ad-hoc lines (no catalog type) trail behind the catalog ones.
                        'position' => $deduction->deduction_type_id !== null
                            ? ($catalogPosition[$deduction->deduction_type_id] ?? 9998)
                            : 9999,
                        'employer' => $deduction->deduction_type_id !== null
                            && $sharesEmployer->has($deduction->deduction_type_id),
                    ];
                }
                if ((float) $deduction->employer_amount > 0) {
                    $lines[$key]['employer'] = true;
                }
            }
        }

        $ordered = collect($lines)
            ->sortBy(fn (array $line) => sprintf('%04d', $line['position']).mb_strtolower($line['label']))
            ->values()
            ->map(fn (array $line) => ['key' => $line['key'], 'label' => $line['label'], 'employer' => $line['employer']]);

        $deductionColumns = $ordered->map(fn (array $line) => ['key' => $line['key'], 'label' => $line['label']])->values();
        $benefitColumns = $ordered->filter(fn (array $line) => $line['employer'])
            ->map(fn (array $line) => ['key' => $line['key'], 'label' => $line['label']])
            ->values();

        $rows = $payslips->map(function (Payslip $payslip, int $index) use ($benefitColumns, $deductionColumns) {
            // Two lines can collapse onto one column (same catalog type, or the
            // same ad-hoc name) — the sheet shows their sum.
            $byKey = [];
            foreach ($payslip->deductions as $deduction) {
                $key = $this->sheetLineKey($deduction);
                $byKey[$key] = [
                    'amount' => ($byKey[$key]['amount'] ?? 0) + (float) $deduction->amount,
                    'employer_amount' => ($byKey[$key]['employer_amount'] ?? 0) + (float) $deduction->employer_amount,
                ];
            }

            return [
                'no' => $index + 1,
                'payslip_id' => $payslip->id,
                'staff_name' => $this->sheetStaffName($payslip->user),
                'designation' => $payslip->designation,
                'days_worked' => (float) $payslip->days_worked,
                // Marked on the printed sheet: this is the copy that leaves the
                // system, and a figure resting on punches nobody made yet must
                // not read as a biometric total.
                'assumed_days' => (int) $payslip->assumed_days,
                'hours_worked' => (float) $payslip->hours_worked,
                'daily_rate' => (float) $payslip->daily_rate,
                'benefits' => $benefitColumns
                    ->map(fn (array $col) => round((float) ($byKey[$col['key']]['employer_amount'] ?? 0), 2))
                    ->values(),
                'employer_share_total' => round((float) $payslip->deductions->sum('employer_amount'), 2),
                'gross_pay' => (float) $payslip->gross_pay,
                // Late and undertime are already netted out of gross_pay. The
                // sheet itemizes them under DEDUCTIONS instead, so it needs the
                // figure back — and the figure the salary actually carried,
                // which is a penalty clipped to the day it was charged on.
                'penalty_charged' => $this->penaltyCharged($payslip),
                'overtime_total' => (float) $payslip->overtime_total,
                'deductions' => $deductionColumns
                    ->map(fn (array $col) => round((float) ($byKey[$col['key']]['amount'] ?? 0), 2))
                    ->values(),
                'total_deductions' => (float) $payslip->total_deductions,
                'net_pay' => (float) $payslip->net_pay,
            ];
        })->values();

        return response()->json([
            'success' => true,
            'data' => [
                'period' => [
                    'id' => $period->id,
                    'name' => $period->name,
                    'date_from' => $period->date_from?->toDateString(),
                    'date_to' => $period->date_to?->toDateString(),
                    'status' => $period->status,
                    'paid_on' => $period->paid_on?->toDateString(),
                ],
                'institution' => [
                    'name' => $period->institution?->title,
                    'address' => $period->institution?->address,
                    'logo' => $period->institution?->logo,
                ],
                'benefit_columns' => $benefitColumns,
                'deduction_columns' => $deductionColumns,
                'rows' => $rows,
            ],
        ]);
    }

    /**
     * Which sheet column a deduction line belongs to. Lines off the same
     * catalog type share a column; ad-hoc lines group by name.
     */
    private function sheetLineKey(PayslipDeduction $deduction): string
    {
        return $deduction->deduction_type_id ?: 'name:'.mb_strtolower(trim($deduction->name));
    }

    /**
     * How much late and undertime the salary actually gave up.
     *
     * A day's penalty can never eat more than that day's rate — pricing clips
     * it there — while `penalty_total` keeps the raw figure. The sheet charges
     * the clipped one so TOTAL SALARY EARNED less TOTAL DEDUCTION still comes
     * out at NET CASH EARNED.
     */
    private function penaltyCharged(Payslip $payslip): float
    {
        $dailyRate = (float) $payslip->daily_rate;

        return round((float) $payslip->days->sum(
            fn (PayslipDay $day) => min((float) $day->penalty_amount, $dailyRate)
        ), 2);
    }

    /**
     * What attendance cost this payslip, itemized the way a pay slip prints it.
     *
     * Late, undertime and absences never come off a deduction line — they are
     * taken out of the salary itself, so a slip showing only the surviving
     * salary leaves a staff member no way to see why it is short. The printed
     * slip charges them under DEDUCTIONS and adds them back into TOTAL SALARY
     * EARNED instead, which only stays honest if these are the figures the
     * salary actually gave up:
     *
     * - A day's penalty is clipped at that day's rate, exactly as pricing
     *   clipped it, and the clip is shared between late and undertime in
     *   proportion to what each side charged.
     * - An absence is a day that earned nothing and was charged no penalty:
     *   no punches at all, or a single punch payroll cannot bracket a day
     *   with. Requiring both keeps a day whose penalty ate the whole rate from
     *   being charged twice — once as the penalty, again as an absence.
     *
     * @return array{late: float, undertime: float, absent_days: int, absences: float}
     */
    private function attendanceCharges(Payslip $payslip): array
    {
        $dailyRate = (float) $payslip->daily_rate;
        $lateRate = (float) $payslip->late_penalty_per_minute;
        $undertimeRate = (float) $payslip->undertime_penalty_per_minute;

        $late = 0.0;
        $undertime = 0.0;
        $absentDays = 0;

        foreach ($payslip->days as $day) {
            $penalty = (float) $day->penalty_amount;

            if ($penalty > 0) {
                // The two sides add up to the penalty, so sharing out the clip
                // this way neither loses nor invents pesos.
                $scale = min($penalty, $dailyRate) / $penalty;
                $late += (int) $day->late_minutes * $lateRate * $scale;
                $undertime += (int) $day->undertime_minutes * $undertimeRate * $scale;

                continue;
            }

            if ($this->isAbsence($day)) {
                $absentDays++;
            }
        }

        return [
            'late' => round($late, 2),
            'undertime' => round($undertime, 2),
            'absent_days' => $absentDays,
            'absences' => round($absentDays * $dailyRate, 2),
        ];
    }

    /**
     * A scheduled working day the staff member earned nothing for.
     *
     * A rest day was never part of the salary, a holiday nobody is expected to
     * report on, and a day signed off as fully paid pays without punches. A day
     * still resting on assumed punches is not an absence either — payroll was
     * generated before it had the chance to record anything.
     */
    private function isAbsence(PayslipDay $day): bool
    {
        if ($day->is_rest_day || $day->is_holiday || $day->isAssumed()) {
            return false;
        }

        if ($day->pay_policy === PayslipDay::PAY_FULL_DAY) {
            return false;
        }

        return (float) $day->amount_earned <= 0;
    }

    /**
     * "DELA CRUZ, JUAN P." — the printed sheet lists staff surname first.
     * Falls back to the plain name for anyone with no surname on file.
     */
    private function sheetStaffName(?User $user): ?string
    {
        if (! $user) {
            return null;
        }

        // An extension belongs to the surname: "DELA CRUZ JR., JUAN P."
        $surname = trim(implode(' ', array_filter([$user->last_name, $user->ext_name])));
        if ($surname === '') {
            return $this->staffName($user);
        }

        // A middle name is printed as an initial, whether it is stored as one
        // ("P") or spelled out ("Perez").
        $initial = mb_substr(trim((string) $user->middle_name), 0, 1);
        $given = trim(trim((string) $user->first_name).($initial !== '' ? ' '.mb_strtoupper($initial).'.' : ''));

        return $given === '' ? $surname : $surname.', '.$given;
    }

    /**
     * Full payslip with the daily working-time breakdown (print-ready).
     */
    public function show(Request $request, string $id): JsonResponse
    {
        if (! $this->isPayrollManager($request)) {
            return $this->payrollForbidden();
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return $this->noInstitution();
        }

        $payslip = Payslip::with(['user', 'days', 'deductions', 'payrollPeriod', 'institution'])
            ->where('institution_id', $institutionId)
            ->find($id);

        if (! $payslip) {
            return $this->notFound();
        }

        return response()->json([
            'success' => true,
            'data' => $this->serializeFull($payslip),
        ]);
    }

    /**
     * Update editable payslip fields (rates, deductions, designation)
     * and recompute earnings + totals.
     */
    public function update(Request $request, string $id, PayrollService $payrollService): JsonResponse
    {
        if (! $this->isPayrollManager($request)) {
            return $this->payrollForbidden();
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return $this->noInstitution();
        }

        $payslip = Payslip::with('payrollPeriod')
            ->where('institution_id', $institutionId)
            ->find($id);

        if (! $payslip) {
            return $this->notFound();
        }

        if ($payslip->payrollPeriod?->isFinalized()) {
            return $this->finalizedConflict();
        }

        $validated = $request->validate([
            'designation' => 'sometimes|nullable|string|max:255',
            'daily_rate' => 'sometimes|numeric|min:0|max:999999',
            'hourly_rate' => 'sometimes|numeric|min:0|max:999999',
            'deductions' => 'sometimes|array',
            'deductions.*.deduction_type_id' => [
                'nullable',
                'uuid',
                Rule::exists('payroll_deduction_types', 'id')
                    ->where(fn ($query) => $query->where('institution_id', $institutionId)),
            ],
            'deductions.*.name' => 'required|string|max:255',
            'deductions.*.amount' => 'required|numeric|min:0|max:999999',
            'deductions.*.employer_amount' => 'nullable|numeric|min:0|max:999999',
            'deductions.*.calculation_type' => ['nullable', Rule::in(PayrollDeductionType::CALCULATION_TYPES)],
            // On a percentage line the rates are what is saved; the pesos are
            // recomputed from the salary right after.
            'deductions.*.rate_percent' => 'nullable|numeric|min:0|max:100',
            'deductions.*.employer_rate_percent' => 'nullable|numeric|min:0|max:100',
            'deductions.*.percent_basis' => ['nullable', Rule::in(PayrollDeductionType::PERCENT_BASES)],
        ], [
            'deductions.*.deduction_type_id.exists' => 'One of the deductions does not belong to your institution.',
            'deductions.*.name.required' => 'Each deduction needs a name.',
        ]);

        if ($validated === []) {
            throw ValidationException::withMessages(['payslip' => 'Nothing to update.']);
        }

        $ratesChanged = array_key_exists('daily_rate', $validated) || array_key_exists('hourly_rate', $validated);
        $deductions = $validated['deductions'] ?? null;
        unset($validated['deductions']);

        DB::transaction(function () use ($payslip, $validated, $deductions) {
            if ($validated !== []) {
                $payslip->update($validated);
            }

            if ($deductions !== null) {
                // Deduction lines are fully replaced on every save.
                $payslip->deductions()->delete();
                foreach ($deductions as $deduction) {
                    $isPercentage = ($deduction['calculation_type'] ?? PayrollDeductionType::CALC_FIXED)
                        === PayrollDeductionType::CALC_PERCENTAGE;

                    $payslip->deductions()->create([
                        'deduction_type_id' => $deduction['deduction_type_id'] ?? null,
                        'name' => $deduction['name'],
                        'calculation_type' => $isPercentage
                            ? PayrollDeductionType::CALC_PERCENTAGE
                            : PayrollDeductionType::CALC_FIXED,
                        // A percentage line's pesos are overwritten by
                        // recomputeTotals below, from the rates saved here.
                        'amount' => $isPercentage ? 0 : $deduction['amount'],
                        'rate_percent' => $isPercentage ? ($deduction['rate_percent'] ?? 0) : 0,
                        'employer_amount' => $isPercentage ? 0 : ($deduction['employer_amount'] ?? 0),
                        'employer_rate_percent' => $isPercentage ? ($deduction['employer_rate_percent'] ?? 0) : 0,
                        'percent_basis' => $isPercentage
                            ? ($deduction['percent_basis'] ?? PayrollDeductionType::BASIS_BASIC_PAY)
                            : null,
                        'basis_amount' => 0,
                    ]);
                }
            }
        });

        if ($ratesChanged) {
            $payrollService->applyRates($payslip);
        } else {
            $payrollService->recomputeTotals($payslip);
        }

        $payslip->refresh()->load(['user', 'days', 'deductions', 'payrollPeriod', 'institution']);

        return response()->json([
            'success' => true,
            'message' => 'Payslip updated successfully',
            'data' => $this->serializeFull($payslip),
        ]);
    }

    /**
     * Manually correct one day's time in/out, then recompute.
     */
    public function updateDay(Request $request, string $id, string $dayId, PayrollService $payrollService): JsonResponse
    {
        if (! $this->isPayrollManager($request)) {
            return $this->payrollForbidden();
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return $this->noInstitution();
        }

        $payslip = Payslip::with('payrollPeriod')
            ->where('institution_id', $institutionId)
            ->find($id);

        if (! $payslip) {
            return $this->notFound();
        }

        if ($payslip->payrollPeriod?->isFinalized()) {
            return $this->finalizedConflict();
        }

        $day = $payslip->days()->find($dayId);
        if (! $day) {
            return response()->json(['success' => false, 'message' => 'Payslip day not found'], 404);
        }

        $validated = $request->validate([
            'time_in' => 'nullable|date_format:H:i',
            'time_out' => 'nullable|date_format:H:i',
            'overtime_minutes' => 'sometimes|nullable|integer|min:0|max:1440',
        ]);

        $timeIn = ($validated['time_in'] ?? null) ? $validated['time_in'].':00' : null;
        $timeOut = ($validated['time_out'] ?? null) ? $validated['time_out'].':00' : null;

        if ($timeIn && $timeOut && $timeOut <= $timeIn) {
            throw ValidationException::withMessages([
                'time_out' => 'Time out must be after time in.',
            ]);
        }

        // A payroll manager typing a time replaces whatever was assumed from
        // the schedule, so the day stops being flagged as an assumption — it is
        // somebody's entry now, and the sheet should not keep hedging about it.
        $update = [
            'time_in' => $timeIn,
            'time_out' => $timeOut,
            'assumed_time_in' => false,
            'assumed_time_out' => false,
        ];
        if (array_key_exists('overtime_minutes', $validated)) {
            // Approved overtime — the only minutes that are actually paid.
            $update['overtime_minutes'] = (int) ($validated['overtime_minutes'] ?? 0);
        }

        $day->update($update);
        $payrollService->recomputeDay($payslip, $day->refresh());

        $payslip->refresh()->load(['user', 'days', 'deductions', 'payrollPeriod', 'institution']);

        return response()->json([
            'success' => true,
            'message' => 'Day updated successfully',
            'data' => $this->serializeFull($payslip),
        ]);
    }

    private function serializeSummary(Payslip $payslip): array
    {
        return [
            'id' => $payslip->id,
            'user_id' => $payslip->user_id,
            'staff_name' => $this->staffName($payslip->user),
            'designation' => $payslip->designation,
            'daily_rate' => (float) $payslip->daily_rate,
            'days_worked' => (float) $payslip->days_worked,
            'assumed_days' => (int) $payslip->assumed_days,
            'hours_worked' => (float) $payslip->hours_worked,
            'late_minutes' => (int) $payslip->late_minutes,
            'undertime_minutes' => (int) $payslip->undertime_minutes,
            'penalty_total' => (float) $payslip->penalty_total,
            'overtime_minutes' => (int) $payslip->overtime_minutes,
            'overtime_total' => (float) $payslip->overtime_total,
            'basic_pay' => (float) $payslip->basic_pay,
            'gross_pay' => (float) $payslip->gross_pay,
            'total_deductions' => (float) $payslip->total_deductions,
            'net_pay' => (float) $payslip->net_pay,
        ];
    }

    private function serializeFull(Payslip $payslip): array
    {
        $period = $payslip->payrollPeriod;

        return [
            'id' => $payslip->id,
            'user_id' => $payslip->user_id,
            'staff_name' => $this->staffName($payslip->user),
            'designation' => $payslip->designation,
            'institution_name' => $payslip->institution?->title,
            'institution_address' => $payslip->institution?->address,
            'institution_logo' => $payslip->institution?->logo,
            'period' => $period ? [
                'id' => $period->id,
                'name' => $period->name,
                'date_from' => $period->date_from?->toDateString(),
                'date_to' => $period->date_to?->toDateString(),
                'status' => $period->status,
                'paid_on' => $period->paid_on?->toDateString(),
            ] : null,
            'daily_rate' => (float) $payslip->daily_rate,
            'hourly_rate' => (float) $payslip->hourly_rate,
            'hours_per_day' => (float) $payslip->hours_per_day,
            'late_penalty_per_minute' => (float) $payslip->late_penalty_per_minute,
            'undertime_penalty_per_minute' => (float) $payslip->undertime_penalty_per_minute,
            'overtime_rate_per_minute' => (float) $payslip->overtime_rate_per_minute,
            'days_worked' => (float) $payslip->days_worked,
            'assumed_days' => (int) $payslip->assumed_days,
            'hours_worked' => (float) $payslip->hours_worked,
            'late_minutes' => (int) $payslip->late_minutes,
            'undertime_minutes' => (int) $payslip->undertime_minutes,
            'penalty_total' => (float) $payslip->penalty_total,
            'overtime_minutes' => (int) $payslip->overtime_minutes,
            'overtime_total' => (float) $payslip->overtime_total,
            'basic_pay' => (float) $payslip->basic_pay,
            'gross_pay' => (float) $payslip->gross_pay,
            'deductions' => $payslip->deductions->map(fn (PayslipDeduction $deduction) => [
                'id' => $deduction->id,
                'deduction_type_id' => $deduction->deduction_type_id,
                'name' => $deduction->name,
                'calculation_type' => $deduction->calculation_type,
                'amount' => (float) $deduction->amount,
                'rate_percent' => (float) $deduction->rate_percent,
                'employer_amount' => (float) $deduction->employer_amount,
                'employer_rate_percent' => (float) $deduction->employer_rate_percent,
                'percent_basis' => $deduction->percent_basis,
                'basis_amount' => (float) $deduction->basis_amount,
            ])->values(),
            'employer_share_total' => round((float) $payslip->deductions->sum('employer_amount'), 2),
            'total_deductions' => (float) $payslip->total_deductions,
            // Already netted out of gross_pay — the printed slip itemizes them
            // under DEDUCTIONS rather than absorbing them silently.
            'attendance_charges' => $this->attendanceCharges($payslip),
            'net_pay' => (float) $payslip->net_pay,
            'days' => $payslip->days->map(fn (PayslipDay $day) => [
                'id' => $day->id,
                'work_date' => $day->work_date?->toDateString(),
                'time_in' => $this->formatTime($day->time_in),
                'time_out' => $this->formatTime($day->time_out),
                'assumed_time_in' => (bool) $day->assumed_time_in,
                'assumed_time_out' => (bool) $day->assumed_time_out,
                'required_hours' => (float) $day->required_hours,
                'hours_worked' => (float) $day->hours_worked,
                'late_minutes' => (int) $day->late_minutes,
                'undertime_minutes' => (int) $day->undertime_minutes,
                'penalty_amount' => (float) $day->penalty_amount,
                'detected_overtime_minutes' => (int) $day->detected_overtime_minutes,
                'overtime_minutes' => (int) $day->overtime_minutes,
                'overtime_amount' => (float) $day->overtime_amount,
                'amount_earned' => (float) $day->amount_earned,
                'schedule_start' => $this->formatTime($day->schedule_start),
                'schedule_end' => $this->formatTime($day->schedule_end),
                'waive_late' => (bool) $day->waive_late,
                'waive_undertime' => (bool) $day->waive_undertime,
                'pay_policy' => (string) ($day->pay_policy ?: PayslipDay::PAY_NORMAL),
                'exception_label' => $day->exception_label,
                'is_holiday' => (bool) $day->is_holiday,
                'is_rest_day' => (bool) $day->is_rest_day,
            ])->values(),
            'updated_at' => $payslip->updated_at?->toIso8601String(),
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

    /**
     * Payroll is restricted to the roles that see it in the sidebar —
     * salaries are too sensitive for the usual "any staff" HRIS access.
     */
    private function isPayrollManager(Request $request): bool
    {
        $user = $request->user();
        if (! $user || $user instanceof StudentPortalUser) {
            return false;
        }

        $role = method_exists($user, 'getRole') ? $user->getRole() : null;

        return in_array((string) ($role->slug ?? ''), ['principal', 'institution-administrator'], true);
    }

    private function payrollForbidden(): JsonResponse
    {
        return response()->json([
            'success' => false,
            'message' => 'You are not allowed to manage payroll',
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
            'message' => 'Payslip not found',
        ], 404);
    }

    private function finalizedConflict(): JsonResponse
    {
        return response()->json([
            'success' => false,
            'message' => 'This payroll period is finalized. Reopen it before making changes.',
        ], 409);
    }
}
