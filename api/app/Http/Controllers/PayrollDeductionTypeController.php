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

        $type = PayrollDeductionType::create([
            'institution_id' => $institutionId,
            'name' => $validated['name'],
            'default_amount' => $validated['default_amount'] ?? 0,
            'has_employer_share' => $validated['has_employer_share'] ?? false,
            'default_employer_amount' => ($validated['has_employer_share'] ?? false)
                ? ($validated['default_employer_amount'] ?? 0)
                : 0,
            'is_active' => $validated['is_active'] ?? true,
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

        $hasEmployerShare = $validated['has_employer_share'] ?? $type->has_employer_share;

        $type->update([
            'name' => $validated['name'],
            'default_amount' => $validated['default_amount'] ?? 0,
            'has_employer_share' => $hasEmployerShare,
            'default_employer_amount' => $hasEmployerShare ? ($validated['default_employer_amount'] ?? 0) : 0,
            'is_active' => $validated['is_active'] ?? $type->is_active,
        ]);

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
     * Push a type's default amounts onto every staff member's rates, so a new
     * deduction never has to be typed into each employee one by one.
     *
     * Staff that already carry the deduction keep their own amount — those are
     * deliberate per-employee figures — unless $overwrite is set, which is the
     * explicit "apply to all employees" the edit form offers for a rate change.
     *
     * Staff without a compensation record are skipped: they generate no
     * payslip yet, and the rates editor already pre-fills these defaults when
     * their rates are first set up.
     *
     * @return int staff whose rates gained or changed this deduction
     */
    private function applyDefaultsToStaff(PayrollDeductionType $type, bool $overwrite): int
    {
        $amount = (float) $type->default_amount;
        $employerAmount = $type->has_employer_share ? (float) $type->default_employer_amount : 0.0;

        // Nothing to hand out — and an inactive type is ignored on payslips anyway.
        if (! $type->is_active || ($amount <= 0 && $employerAmount <= 0)) {
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

        $affected = 0;

        DB::transaction(function () use ($compensations, $existing, $type, $amount, $employerAmount, $overwrite, &$affected) {
            foreach ($compensations as $compensation) {
                $row = $existing->get($compensation->id);

                if ($row) {
                    if (! $overwrite) {
                        continue;
                    }
                    $row->update(['amount' => $amount, 'employer_amount' => $employerAmount]);
                } else {
                    PayrollCompensationDeduction::create([
                        'payroll_compensation_id' => $compensation->id,
                        'deduction_type_id' => $type->id,
                        'amount' => $amount,
                        'employer_amount' => $employerAmount,
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
            'default_amount' => 'nullable|numeric|min:0|max:999999',
            'has_employer_share' => 'nullable|boolean',
            'default_employer_amount' => 'nullable|numeric|min:0|max:999999',
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
            'default_amount' => (float) $type->default_amount,
            'has_employer_share' => (bool) $type->has_employer_share,
            'default_employer_amount' => (float) $type->default_employer_amount,
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
            'message' => 'Deduction type not found',
        ], 404);
    }
}
