<?php

namespace App\Http\Controllers;

use App\Auth\StudentPortalUser;
use App\Models\PayrollPeriod;
use App\Services\PayrollService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class PayrollPeriodController extends Controller
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

        $periods = PayrollPeriod::withCount('payslips')
            ->withSum('payslips as gross_total', 'gross_pay')
            ->withSum('payslips as net_total', 'net_pay')
            ->where('institution_id', $institutionId)
            ->orderByDesc('date_from')
            ->get();

        return response()->json([
            'success' => true,
            'data' => $periods->map(fn ($period) => $this->serialize($period))->values(),
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

        $period = PayrollPeriod::create([
            'institution_id' => $institutionId,
            'name' => $validated['name'],
            'date_from' => $validated['date_from'],
            'date_to' => $validated['date_to'],
            'created_by' => $request->user()?->id,
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Payroll period created successfully',
            'data' => $this->serialize($period->loadCount('payslips')),
        ], 201);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        if (! $this->isPayrollManager($request)) {
            return $this->payrollForbidden();
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return $this->noInstitution();
        }

        $period = PayrollPeriod::withCount('payslips')
            ->withSum('payslips as gross_total', 'gross_pay')
            ->withSum('payslips as net_total', 'net_pay')
            ->where('institution_id', $institutionId)
            ->find($id);

        if (! $period) {
            return $this->notFound();
        }

        return response()->json([
            'success' => true,
            'data' => $this->serialize($period),
        ]);
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

        $period = PayrollPeriod::where('institution_id', $institutionId)->find($id);
        if (! $period) {
            return $this->notFound();
        }

        if ($period->isFinalized()) {
            return $this->finalizedConflict();
        }

        $validated = $this->validatePayload($request, $institutionId, $period->id);

        $period->update([
            'name' => $validated['name'],
            'date_from' => $validated['date_from'],
            'date_to' => $validated['date_to'],
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Payroll period updated successfully. Regenerate payslips if the dates changed.',
            'data' => $this->serialize($period->loadCount('payslips')),
        ]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        if (! $this->isPayrollManager($request)) {
            return $this->payrollForbidden();
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return $this->noInstitution();
        }

        $period = PayrollPeriod::where('institution_id', $institutionId)->find($id);
        if (! $period) {
            return $this->notFound();
        }

        if ($period->isFinalized()) {
            return $this->finalizedConflict();
        }

        $period->delete();

        return response()->json([
            'success' => true,
            'message' => 'Payroll period deleted successfully',
        ]);
    }

    /**
     * (Re)generate every payslip in the period from attendance logs.
     */
    public function generate(Request $request, string $id, PayrollService $payrollService): JsonResponse
    {
        if (! $this->isPayrollManager($request)) {
            return $this->payrollForbidden();
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return $this->noInstitution();
        }

        $period = PayrollPeriod::where('institution_id', $institutionId)->find($id);
        if (! $period) {
            return $this->notFound();
        }

        if ($period->isFinalized()) {
            return $this->finalizedConflict();
        }

        $result = $payrollService->generateForPeriod($period);

        if ($result['generated'] === 0) {
            return response()->json([
                'success' => false,
                'message' => 'No payslips generated. Set the staff compensation rates first in the Employee Rates tab.',
            ], 422);
        }

        return response()->json([
            'success' => true,
            'message' => "Generated {$result['generated']} payslip(s) from attendance logs.",
            'data' => $this->serialize($period->fresh()->loadCount('payslips')),
        ]);
    }

    public function finalize(Request $request, string $id): JsonResponse
    {
        if (! $this->isPayrollManager($request)) {
            return $this->payrollForbidden();
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return $this->noInstitution();
        }

        $period = PayrollPeriod::where('institution_id', $institutionId)->find($id);
        if (! $period) {
            return $this->notFound();
        }

        $validated = $request->validate([
            'paid_on' => 'nullable|date',
        ]);

        if (! $period->payslips()->exists()) {
            return response()->json([
                'success' => false,
                'message' => 'Generate payslips before finalizing this period.',
            ], 422);
        }

        $period->update([
            'status' => PayrollPeriod::STATUS_FINALIZED,
            'paid_on' => $validated['paid_on'] ?? now()->toDateString(),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Payroll period finalized',
            'data' => $this->serialize($period->loadCount('payslips')),
        ]);
    }

    public function reopen(Request $request, string $id): JsonResponse
    {
        if (! $this->isPayrollManager($request)) {
            return $this->payrollForbidden();
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return $this->noInstitution();
        }

        $period = PayrollPeriod::where('institution_id', $institutionId)->find($id);
        if (! $period) {
            return $this->notFound();
        }

        $period->update([
            'status' => PayrollPeriod::STATUS_DRAFT,
            'paid_on' => null,
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Payroll period reopened for editing',
            'data' => $this->serialize($period->loadCount('payslips')),
        ]);
    }

    private function validatePayload(Request $request, string $institutionId, ?string $ignoreId = null): array
    {
        return $request->validate([
            'name' => [
                'required',
                'string',
                'max:255',
                Rule::unique('payroll_periods')
                    ->where(fn ($query) => $query->where('institution_id', $institutionId))
                    ->ignore($ignoreId),
            ],
            'date_from' => 'required|date',
            'date_to' => 'required|date|after_or_equal:date_from',
        ], [
            'name.unique' => 'A payroll period with this name already exists.',
            'date_to.after_or_equal' => 'The end date must be on or after the start date.',
        ]);
    }

    private function serialize(PayrollPeriod $period): array
    {
        return [
            'id' => $period->id,
            'institution_id' => $period->institution_id,
            'name' => $period->name,
            'date_from' => $period->date_from?->toDateString(),
            'date_to' => $period->date_to?->toDateString(),
            'status' => $period->status,
            'paid_on' => $period->paid_on?->toDateString(),
            'payslip_count' => (int) ($period->payslips_count ?? 0),
            'gross_total' => round((float) ($period->gross_total ?? 0), 2),
            'net_total' => round((float) ($period->net_total ?? 0), 2),
            'created_at' => $period->created_at?->toIso8601String(),
            'updated_at' => $period->updated_at?->toIso8601String(),
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
            'message' => 'Payroll period not found',
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
