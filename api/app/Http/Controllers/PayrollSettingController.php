<?php

namespace App\Http\Controllers;

use App\Auth\StudentPortalUser;
use App\Models\Institution;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Institution-wide payroll settings (late/undertime penalty rates).
 * Rates are snapshotted onto payslips at generation time, so changing
 * them here only affects payrolls generated afterwards.
 */
class PayrollSettingController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        if (! $this->isPayrollManager($request)) {
            return $this->payrollForbidden();
        }

        $institution = $this->resolveInstitution($request);
        if (! $institution) {
            return $this->noInstitution();
        }

        return response()->json([
            'success' => true,
            'data' => $this->serialize($institution),
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        if (! $this->isPayrollManager($request)) {
            return $this->payrollForbidden();
        }

        $institution = $this->resolveInstitution($request);
        if (! $institution) {
            return $this->noInstitution();
        }

        $validated = $request->validate([
            'late_penalty_per_minute' => 'required|numeric|min:0|max:9999',
            'undertime_penalty_per_minute' => 'required|numeric|min:0|max:9999',
            'overtime_rate_per_minute' => 'required|numeric|min:0|max:9999',
        ]);

        $institution->update($validated);

        return response()->json([
            'success' => true,
            'message' => 'Payroll settings updated. They apply to payrolls generated from now on.',
            'data' => $this->serialize($institution->fresh()),
        ]);
    }

    private function serialize(Institution $institution): array
    {
        return [
            'late_penalty_per_minute' => (float) ($institution->late_penalty_per_minute ?? 0),
            'undertime_penalty_per_minute' => (float) ($institution->undertime_penalty_per_minute ?? 0),
            'overtime_rate_per_minute' => (float) ($institution->overtime_rate_per_minute ?? 0),
        ];
    }

    private function resolveInstitution(Request $request): ?Institution
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

        return $institutionId ? Institution::find($institutionId) : null;
    }

    /**
     * Same restriction as the rest of payroll — salaries are too sensitive
     * for the usual "any staff" HRIS access.
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
}
