<?php

namespace App\Http\Controllers;

use App\Auth\StudentPortalUser;
use App\Models\PayrollPeriod;
use App\Models\Payslip;
use App\Models\PayslipDay;
use App\Models\PayslipDeduction;
use App\Models\User;
use App\Services\PayrollService;
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
            'data' => $payslips->map(fn (Payslip $payslip) => $this->serializeSummary($payslip))->values(),
        ]);
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
                    $payslip->deductions()->create([
                        'deduction_type_id' => $deduction['deduction_type_id'] ?? null,
                        'name' => $deduction['name'],
                        'amount' => $deduction['amount'],
                        'employer_amount' => $deduction['employer_amount'] ?? 0,
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
        ]);

        $timeIn = ($validated['time_in'] ?? null) ? $validated['time_in'].':00' : null;
        $timeOut = ($validated['time_out'] ?? null) ? $validated['time_out'].':00' : null;

        if ($timeIn && $timeOut && $timeOut <= $timeIn) {
            throw ValidationException::withMessages([
                'time_out' => 'Time out must be after time in.',
            ]);
        }

        $day->update(['time_in' => $timeIn, 'time_out' => $timeOut]);
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
            'hours_worked' => (float) $payslip->hours_worked,
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
            'days_worked' => (float) $payslip->days_worked,
            'hours_worked' => (float) $payslip->hours_worked,
            'gross_pay' => (float) $payslip->gross_pay,
            'deductions' => $payslip->deductions->map(fn (PayslipDeduction $deduction) => [
                'id' => $deduction->id,
                'deduction_type_id' => $deduction->deduction_type_id,
                'name' => $deduction->name,
                'amount' => (float) $deduction->amount,
                'employer_amount' => (float) $deduction->employer_amount,
            ])->values(),
            'employer_share_total' => round((float) $payslip->deductions->sum('employer_amount'), 2),
            'total_deductions' => (float) $payslip->total_deductions,
            'net_pay' => (float) $payslip->net_pay,
            'days' => $payslip->days->map(fn (PayslipDay $day) => [
                'id' => $day->id,
                'work_date' => $day->work_date?->toDateString(),
                'time_in' => $this->formatTime($day->time_in),
                'time_out' => $this->formatTime($day->time_out),
                'required_hours' => (float) $day->required_hours,
                'hours_worked' => (float) $day->hours_worked,
                'amount_earned' => (float) $day->amount_earned,
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
