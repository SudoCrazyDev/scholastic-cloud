<?php

namespace App\Http\Controllers;

use App\Auth\StudentPortalUser;
use App\Models\PayrollCompensation;
use App\Models\PayrollCompensationDeduction;
use App\Models\PayrollDeductionBracket;
use App\Models\PayrollDeductionType;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

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

        $types = PayrollDeductionType::with('brackets')
            ->where('institution_id', $institutionId)
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

        $type = DB::transaction(function () use ($validated, $institutionId, $request) {
            $type = PayrollDeductionType::create($this->attributes(
                $validated,
                $validated['is_active'] ?? true,
                $validated['has_employer_share'] ?? false
            ) + [
                'institution_id' => $institutionId,
                'sort_order' => PayrollDeductionType::where('institution_id', $institutionId)->max('sort_order') + 1,
                'created_by' => $request->user()?->id,
            ]);

            $this->syncBrackets($type, $validated);

            return $type;
        });

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

        $type = PayrollDeductionType::with('brackets')->where('institution_id', $institutionId)->find($id);
        if (! $type) {
            return $this->notFound();
        }

        $validated = $this->validatePayload($request, $institutionId, $type->id);

        DB::transaction(function () use ($type, $validated) {
            $type->update($this->attributes(
                $validated,
                $validated['is_active'] ?? $type->is_active,
                $validated['has_employer_share'] ?? $type->has_employer_share
            ));

            $this->syncBrackets($type, $validated);
        });

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
     * The columns a save writes, with everything that does not apply to the
     * chosen calculation zeroed out: a percentage type carries no peso
     * defaults, a fixed one carries no rates, and a bracket type carries
     * neither — its figures all live in the range table. Keeping the unused
     * columns at 0 means switching a type between the three can never leave a
     * stale figure behind for payroll to pick up.
     *
     * @param  array<string, mixed>  $validated
     * @return array<string, mixed>
     */
    private function attributes(array $validated, bool $isActive, bool $hasEmployerShare): array
    {
        $calculationType = $this->calculationType($validated);
        $isPercentage = $calculationType === PayrollDeductionType::CALC_PERCENTAGE;
        $isBracket = $calculationType === PayrollDeductionType::CALC_BRACKET;
        $isFixed = $calculationType === PayrollDeductionType::CALC_FIXED;

        return [
            'name' => $validated['name'],
            'calculation_type' => $calculationType,
            'default_amount' => $isFixed ? ($validated['default_amount'] ?? 0) : 0,
            'rate_percent' => $isPercentage ? ($validated['rate_percent'] ?? 0) : 0,
            'has_employer_share' => $hasEmployerShare,
            'default_employer_amount' => ($isFixed && $hasEmployerShare)
                ? ($validated['default_employer_amount'] ?? 0)
                : 0,
            'employer_rate_percent' => ($isPercentage && $hasEmployerShare)
                ? ($validated['employer_rate_percent'] ?? 0)
                : 0,
            // A bracket type reads this too — it is the salary the table is
            // looked up on, and the same choice matters for the same reason.
            'percent_basis' => ($isPercentage || $isBracket)
                ? ($validated['percent_basis'] ?? PayrollDeductionType::BASIS_BASIC_PAY)
                : PayrollDeductionType::BASIS_BASIC_PAY,
            'is_active' => $isActive,
        ];
    }

    /**
     * @param  array<string, mixed>  $validated
     */
    private function calculationType(array $validated): string
    {
        $requested = $validated['calculation_type'] ?? PayrollDeductionType::CALC_FIXED;

        return in_array($requested, PayrollDeductionType::CALCULATION_TYPES, true)
            ? $requested
            : PayrollDeductionType::CALC_FIXED;
    }

    /**
     * Replace the type's range table with the one that was submitted.
     *
     * The ranges are stored in salary order regardless of the order they
     * arrived in, so the table reads top to bottom the way the published
     * schedules do. A type that is no longer a bracket type loses its table
     * outright — a stale schedule sitting behind a flat ₱500 deduction would
     * come back the moment somebody switched it again.
     *
     * @param  array<string, mixed>  $validated
     */
    private function syncBrackets(PayrollDeductionType $type, array $validated): void
    {
        $type->brackets()->delete();

        if (! $type->isBracket()) {
            $type->setRelation('brackets', collect());

            return;
        }

        $rows = collect($validated['brackets'] ?? [])
            ->sortBy(fn (array $bracket) => (float) $bracket['min_salary'])
            ->values();

        foreach ($rows as $index => $bracket) {
            $isPercentage = ($bracket['amount_type'] ?? PayrollDeductionBracket::AMOUNT_FIXED)
                === PayrollDeductionBracket::AMOUNT_PERCENTAGE;

            $type->brackets()->create([
                'min_salary' => $bracket['min_salary'],
                'max_salary' => $bracket['max_salary'] ?? null,
                'amount_type' => $isPercentage
                    ? PayrollDeductionBracket::AMOUNT_PERCENTAGE
                    : PayrollDeductionBracket::AMOUNT_FIXED,
                // Same rule as the type itself: the half that does not apply
                // is stored as 0 rather than left to linger.
                'employee_amount' => $isPercentage ? 0 : ($bracket['employee_amount'] ?? 0),
                'employee_rate_percent' => $isPercentage ? ($bracket['employee_rate_percent'] ?? 0) : 0,
                'employer_amount' => ($isPercentage || ! $type->has_employer_share)
                    ? 0
                    : ($bracket['employer_amount'] ?? 0),
                'employer_rate_percent' => ($isPercentage && $type->has_employer_share)
                    ? ($bracket['employer_rate_percent'] ?? 0)
                    : 0,
                'sort_order' => $index,
            ]);
        }

        $type->load('brackets');
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
     * A bracket type hands out nothing: the table already applies to everybody
     * and works out each employee's figure from their own salary. The only
     * per-staff thing it has is the exemption, which is set in Employee Rates
     * and must not be handed out by definition.
     *
     * @return int staff whose rates gained or changed this deduction
     */
    private function applyDefaultsToStaff(PayrollDeductionType $type, bool $overwrite): int
    {
        if ($type->isBracket()) {
            return 0;
        }

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
        $isBracket = $request->input('calculation_type') === PayrollDeductionType::CALC_BRACKET;

        $validated = $request->validate([
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

            // The salary range table. Only read for a bracket type, and a
            // bracket type is nothing without it.
            'brackets' => [$isBracket ? 'required' : 'nullable', 'array', 'max:60'],
            'brackets.*.min_salary' => 'required|numeric|min:0|max:99999999',
            // Null is the open-ended top range ("₱30,000 and above").
            'brackets.*.max_salary' => 'nullable|numeric|min:0|max:99999999',
            'brackets.*.amount_type' => ['nullable', Rule::in(PayrollDeductionBracket::AMOUNT_TYPES)],
            'brackets.*.employee_amount' => 'nullable|numeric|min:0|max:999999',
            'brackets.*.employee_rate_percent' => 'nullable|numeric|min:0|max:100',
            'brackets.*.employer_amount' => 'nullable|numeric|min:0|max:999999',
            'brackets.*.employer_rate_percent' => 'nullable|numeric|min:0|max:100',
        ], [
            'name.unique' => 'A deduction type with this name already exists.',
            'brackets.required' => 'A salary-range deduction needs at least one range.',
        ]);

        if ($isBracket) {
            $this->assertRangesAreCoherent($validated['brackets'] ?? []);
        }

        return $validated;
    }

    /**
     * A salary must never pick two different contributions, so the ranges are
     * checked for the two ways an admin can make that happen: a range that
     * ends before it starts, and two ranges that overlap.
     *
     * Gaps are allowed and not an error — payroll rounds a salary that falls
     * in one down to the range below it — but an overlap has no answer at all,
     * so it is refused at the point it is typed rather than quietly resolved
     * on somebody's payslip.
     *
     * @param  array<int, array<string, mixed>>  $brackets
     */
    private function assertRangesAreCoherent(array $brackets): void
    {
        $ordered = collect($brackets)
            ->sortBy(fn (array $bracket) => (float) $bracket['min_salary'])
            ->values();

        $openEnded = $ordered->filter(fn (array $bracket) => ($bracket['max_salary'] ?? null) === null);
        if ($openEnded->count() > 1) {
            throw ValidationException::withMessages([
                'brackets' => 'Only the last range can be left open-ended — the rest need an upper limit.',
            ]);
        }

        foreach ($ordered as $index => $bracket) {
            $min = (float) $bracket['min_salary'];
            $max = $bracket['max_salary'] ?? null;

            if ($max !== null && (float) $max < $min) {
                throw ValidationException::withMessages([
                    'brackets' => 'Range '.($index + 1).' ends below where it starts.',
                ]);
            }

            $next = $ordered->get($index + 1);
            if ($next === null) {
                continue;
            }

            // An earlier range with no ceiling swallows everything after it.
            if ($max === null || (float) $max >= (float) $next['min_salary']) {
                throw ValidationException::withMessages([
                    'brackets' => 'Ranges '.($index + 1).' and '.($index + 2).' overlap — a salary in both has no single contribution.',
                ]);
            }
        }
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
            'brackets' => $type->brackets->map(fn (PayrollDeductionBracket $bracket) => [
                'id' => $bracket->id,
                'min_salary' => (float) $bracket->min_salary,
                'max_salary' => $bracket->max_salary !== null ? (float) $bracket->max_salary : null,
                'amount_type' => $bracket->amount_type,
                'employee_amount' => (float) $bracket->employee_amount,
                'employee_rate_percent' => (float) $bracket->employee_rate_percent,
                'employer_amount' => (float) $bracket->employer_amount,
                'employer_rate_percent' => (float) $bracket->employer_rate_percent,
            ])->values(),
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
