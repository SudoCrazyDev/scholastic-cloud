<?php

namespace App\Http\Controllers;

use App\Auth\StudentPortalUser;
use App\Models\PayrollPeriod;
use App\Services\PayrollService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

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

        $periods = PayrollPeriod::with('staffSchedules:id,name')
            ->withCount('payslips')
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
            'schedule_scope' => $validated['schedule_scope'],
            'created_by' => $request->user()?->id,
        ]);

        $period->staffSchedules()->sync($validated['staff_schedule_ids']);

        return response()->json([
            'success' => true,
            'message' => 'Payroll period created successfully',
            'data' => $this->serialize($period->load('staffSchedules:id,name')->loadCount('payslips')),
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

        $period = PayrollPeriod::with('staffSchedules:id,name')
            ->withCount('payslips')
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
            'schedule_scope' => $validated['schedule_scope'],
        ]);

        $period->staffSchedules()->sync($validated['staff_schedule_ids']);

        return response()->json([
            'success' => true,
            'message' => 'Payroll period updated successfully. Regenerate payslips if the dates or covered schedules changed.',
            'data' => $this->serialize($period->load('staffSchedules:id,name')->loadCount('payslips')),
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
                'message' => $period->coversAllSchedules()
                    ? 'No payslips generated. Set the staff compensation rates first in the Employee Rates tab.'
                    : 'No payslips generated. No employee on this period\'s staff schedules has a compensation rate yet.',
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
        $validated = $request->validate([
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
            'schedule_scope' => ['nullable', Rule::in([PayrollPeriod::SCOPE_ALL, PayrollPeriod::SCOPE_SCHEDULES])],
            'staff_schedule_ids' => 'nullable|array',
            'staff_schedule_ids.*' => [
                'uuid',
                'distinct',
                Rule::exists('staff_schedules', 'id')
                    ->where(fn ($query) => $query->where('institution_id', $institutionId)),
            ],
        ], [
            'name.unique' => 'A payroll period with this name already exists.',
            'date_to.after_or_equal' => 'The end date must be on or after the start date.',
            'staff_schedule_ids.*.exists' => 'One of the selected staff schedules does not belong to this institution.',
        ]);

        $scope = $validated['schedule_scope'] ?? PayrollPeriod::SCOPE_ALL;

        // 'all' ignores any ids that came along, so a scope switch cannot leave
        // stale targeting rows behind.
        $scheduleIds = $scope === PayrollPeriod::SCOPE_SCHEDULES
            ? array_values(array_unique($validated['staff_schedule_ids'] ?? []))
            : [];

        if ($scope === PayrollPeriod::SCOPE_SCHEDULES && empty($scheduleIds)) {
            throw ValidationException::withMessages([
                'staff_schedule_ids' => 'Select at least one staff schedule for this payroll period.',
            ]);
        }

        $validated['schedule_scope'] = $scope;
        $validated['staff_schedule_ids'] = $scheduleIds;

        return $validated;
    }

    private function serialize(PayrollPeriod $period): array
    {
        $period->loadMissing('staffSchedules:id,name');

        return [
            'id' => $period->id,
            'institution_id' => $period->institution_id,
            'name' => $period->name,
            'date_from' => $period->date_from?->toDateString(),
            'date_to' => $period->date_to?->toDateString(),
            'schedule_scope' => $period->schedule_scope ?? PayrollPeriod::SCOPE_ALL,
            'staff_schedule_ids' => $period->staffSchedules->pluck('id')->values(),
            'staff_schedules' => $period->staffSchedules
                ->map(fn ($schedule) => ['id' => $schedule->id, 'name' => $schedule->name])
                ->values(),
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
