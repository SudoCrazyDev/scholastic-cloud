<?php

namespace App\Http\Controllers;

use App\Auth\StudentPortalUser;
use App\Models\PayrollCompensation;
use App\Models\PayrollCompensationDeduction;
use App\Models\PayrollDeductionType;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class PayrollDeductionTypeController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        if (! $this->isPayrollManager($request)) {
            return $this->payrollForbidden();
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return $this->noInstitution();
        }

        $types = PayrollDeductionType::where('institution_id', $institutionId)
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get();

        return response()->json([
            'success' => true,
            'data' => $types->map(fn ($type) => $this->serialize($type))->values(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        if (! $this->isPayrollManager($request)) {
            return $this->payrollForbidden();
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return $this->noInstitution();
        }

        $validated = $this->validatePayload($request, $institutionId);

        $type = PayrollDeductionType::create($this->attributes(
            $validated,
            $validated['is_active'] ?? true,
            $validated['has_employer_share'] ?? false
        ) + [
            'institution_id' => $institutionId,
            'sort_order' => PayrollDeductionType::where('institution_id', $institutionId)->max('sort_order') + 1,
            'created_by' => $request->user()?->id,
        ]);

        $applied = $this->applyDefaultsToStaff($type, false);

        return response()->json([
            'success' => true,
            'message' => $this->savedMessage('Deduction type created successfully', $applied),
            'data' => $this->serialize($type),
        ], 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        if (! $this->isPayrollManager($request)) {
            return $this->payrollForbidden();
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return $this->noInstitution();
        }

        $type = PayrollDeductionType::where('institution_id', $institutionId)->find($id);
        if (! $type) {
            return $this->notFound();
        }

        $validated = $this->validatePayload($request, $institutionId, $type->id);

        $type->update($this->attributes(
            $validated,
            $validated['is_active'] ?? $type->is_active,
            $validated['has_employer_share'] ?? $type->has_employer_share
        ));

        $applied = $this->applyDefaultsToStaff($type, (bool) ($validated['apply_to_all_staff'] ?? false));

        return response()->json([
            'success' => true,
            'message' => $this->savedMessage('Deduction type updated successfully', $applied),
            'data' => $this->serialize($type),
        ]);
    }

    /**
     * Deleting a type removes it from staff compensation defaults (cascade)
     * but keeps existing payslip lines — their names are snapshots.
     */
    public function destroy(Request $request, string $id): JsonResponse
    {
        if (! $this->isPayrollManager($request)) {
            return $this->payrollForbidden();
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return $this->noInstitution();
        }

        $type = PayrollDeductionType::where('institution_id', $institutionId)->find($id);
        if (! $type) {
            return $this->notFound();
        }

        $type->delete();

        return response()->json([
            'success' => true,
            'message' => 'Deduction type deleted successfully',
        ]);
    }

    /**
     * The columns a save writes, with the half that does not apply to the
     * chosen calculation zeroed out: a percentage type carries no peso
     * defaults, and a fixed one carries no rates. Keeping the unused half at 0
     * means switching a type between the two can never leave a stale figure
     * behind for payroll to pick up.
     *
     * @param  array<string, mixed>  $validated
     * @return array<string, mixed>
     */
    private function attributes(array $validated, bool $isActive, bool $hasEmployerShare): array
    {
        $isPercentage = ($validated['calculation_type'] ?? PayrollDeductionType::CALC_FIXED)
            === PayrollDeductionType::CALC_PERCENTAGE;

        return [
            'name' => $validated['name'],
            'calculation_type' => $isPercentage
                ? PayrollDeductionType::CALC_PERCENTAGE
                : PayrollDeductionType::CALC_FIXED,
            'default_amount' => $isPercentage ? 0 : ($validated['default_amount'] ?? 0),
            'rate_percent' => $isPercentage ? ($validated['rate_percent'] ?? 0) : 0,
            'has_employer_share' => $hasEmployerShare,
            'default_employer_amount' => (! $isPercentage && $hasEmployerShare)
                ? ($validated['default_employer_amount'] ?? 0)
                : 0,
            'employer_rate_percent' => ($isPercentage && $hasEmployerShare)
                ? ($validated['employer_rate_percent'] ?? 0)
                : 0,
            'percent_basis' => $validated['percent_basis'] ?? PayrollDeductionType::BASIS_BASIC_PAY,
            'is_active' => $isActive,
        ];
    }

    /**
     * Push a type's defaults onto every staff member's rates, so a new
     * deduction never has to be typed into each employee one by one. A
     * percentage type hands out its rates; a fixed one its peso amounts.
     *
     * Staff that already carry the deduction keep their own figures — those
     * are deliberate per-employee values — unless $overwrite is set, which is
     * the explicit "apply to all employees" the edit form offers for a rate
     * change.
     *
     * Staff without a compensation record are skipped: they generate no
     * payslip yet, and the rates editor already pre-fills these defaults when
     * their rates are first set up.
     *
     * @return int staff whose rates gained or changed this deduction
     */
    private function applyDefaultsToStaff(PayrollDeductionType $type, bool $overwrite): int
    {
        $isPercentage = $type->isPercentage();

        $amount = $isPercentage ? 0.0 : (float) $type->default_amount;
        $employerAmount = (! $isPercentage && $type->has_employer_share)
            ? (float) $type->default_employer_amount
            : 0.0;
        $rate = $isPercentage ? (float) $type->rate_percent : 0.0;
        $employerRate = ($isPercentage && $type->has_employer_share)
            ? (float) $type->employer_rate_percent
            : 0.0;

        // Nothing to hand out — and an inactive type is ignored on payslips anyway.
        if (! $type->is_active || ($amount <= 0 && $employerAmount <= 0 && $rate <= 0 && $employerRate <= 0)) {
            return 0;
        }

        $compensations = PayrollCompensation::where('institution_id', $type->institution_id)->get();
        if ($compensations->isEmpty()) {
            return 0;
        }

        $existing = PayrollCompensationDeduction::where('deduction_type_id', $type->id)
            ->whereIn('payroll_compensation_id', $compensations->pluck('id'))
            ->get()
            ->keyBy('payroll_compensation_id');

        $figures = [
            'amount' => $amount,
            'rate_percent' => $rate,
            'employer_amount' => $employerAmount,
            'employer_rate_percent' => $employerRate,
        ];

        $affected = 0;

        DB::transaction(function () use ($compensations, $existing, $type, $figures, $overwrite, &$affected) {
            foreach ($compensations as $compensation) {
                $row = $existing->get($compensation->id);

                if ($row) {
                    if (! $overwrite) {
                        continue;
                    }
                    $row->update($figures);
                } else {
                    PayrollCompensationDeduction::create($figures + [
                        'payroll_compensation_id' => $compensation->id,
                        'deduction_type_id' => $type->id,
                    ]);
                }

                $affected++;
            }
        });

        return $affected;
    }

    private function savedMessage(string $base, int $applied): string
    {
        if ($applied === 0) {
            return $base;
        }

        return $base.' — applied to '.$applied.' '.($applied === 1 ? 'employee' : 'employees').'.';
    }

    private function validatePayload(Request $request, string $institutionId, ?string $ignoreId = null): array
    {
        return $request->validate([
            'name' => [
                'required',
                'string',
                'max:255',
                Rule::unique('payroll_deduction_types')
                    ->where(fn ($query) => $query->where('institution_id', $institutionId))
                    ->ignore($ignoreId),
            ],
            'calculation_type' => ['nullable', Rule::in(PayrollDeductionType::CALCULATION_TYPES)],
            'default_amount' => 'nullable|numeric|min:0|max:999999',
            // Percent, not a fraction: 5 is 5%.
            'rate_percent' => 'nullable|numeric|min:0|max:100',
            'has_employer_share' => 'nullable|boolean',
            'default_employer_amount' => 'nullable|numeric|min:0|max:999999',
            'employer_rate_percent' => 'nullable|numeric|min:0|max:100',
            'percent_basis' => ['nullable', Rule::in(PayrollDeductionType::PERCENT_BASES)],
            'is_active' => 'nullable|boolean',
            // Opt-in on edit: replace every staff member's own amount with the
            // new defaults (a rate change everyone is on, e.g. a new circular).
            'apply_to_all_staff' => 'nullable|boolean',
        ], [
            'name.unique' => 'A deduction type with this name already exists.',
        ]);
    }

    private function serialize(PayrollDeductionType $type): array
    {
        return [
            'id' => $type->id,
            'name' => $type->name,
            'calculation_type' => $type->calculation_type,
            'default_amount' => (float) $type->default_amount,
            'rate_percent' => (float) $type->rate_percent,
            'has_employer_share' => (bool) $type->has_employer_share,
            'default_employer_amount' => (float) $type->default_employer_amount,
            'employer_rate_percent' => (float) $type->employer_rate_percent,
            'percent_basis' => $type->percent_basis,
            'is_active' => (bool) $type->is_active,
            'sort_order' => (int) $type->sort_order,
            'updated_at' => $type->updated_at?->toIso8601String(),
        ];
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
     * Payroll is restricted to roles granted the module — salaries are too
     * sensitive for the usual "any staff" HRIS access. Read off permissions
     * rather than a fixed slug list, so a school can build its own payroll
     * role, and so a super-administrator's wildcard reaches it like anything
     * else.
     */
    private function isPayrollManager(Request $request): bool
    {
        $user = $request->user();
        if (! $user || $user instanceof StudentPortalUser) {
            return false;
        }

        return $user->hasModuleAccess('payroll', 'manage');
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
            'message' => 'Deduction type not found',
        ], 404);
    }
}
