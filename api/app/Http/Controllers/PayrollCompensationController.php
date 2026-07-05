<?php

namespace App\Http\Controllers;

use App\Auth\StudentPortalUser;
use App\Models\PayrollCompensation;
use App\Models\Role;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class PayrollCompensationController extends Controller
{
    /**
     * List staff of the current institution with their compensation
     * settings (null when rates have not been set yet).
     */
    public function index(Request $request): JsonResponse
    {
        if (! $this->isPayrollManager($request)) {
            return $this->payrollForbidden();
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return $this->noInstitution();
        }

        $excludedRoleIds = Role::whereIn('slug', ['super-administrator', 'student'])->pluck('id');

        $query = User::whereHas('userInstitutions', function ($q) use ($institutionId, $excludedRoleIds) {
            $q->where('institution_id', $institutionId);
            if ($excludedRoleIds->isNotEmpty()) {
                $q->where(function ($sub) use ($excludedRoleIds) {
                    $sub->whereNull('role_id')->orWhereNotIn('role_id', $excludedRoleIds);
                });
            }
        })->with(['userInstitutions' => fn ($q) => $q->where('institution_id', $institutionId)->with('role')]);

        if ($request->filled('search')) {
            $search = $request->get('search');
            $query->where(function ($q) use ($search) {
                $q->where('first_name', 'like', "%{$search}%")
                    ->orWhere('middle_name', 'like', "%{$search}%")
                    ->orWhere('last_name', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%");
            });
        }

        $staff = $query->orderBy('first_name')->orderBy('last_name')->get();

        $compensations = PayrollCompensation::where('institution_id', $institutionId)
            ->whereIn('user_id', $staff->pluck('id'))
            ->get()
            ->keyBy('user_id');

        return response()->json([
            'success' => true,
            'data' => $staff->map(function (User $user) use ($compensations) {
                return [
                    'user_id' => $user->id,
                    'staff_name' => $this->staffName($user),
                    'email' => $user->email,
                    'role_title' => $user->userInstitutions->first()?->role?->title,
                    'compensation' => $this->serialize($compensations->get($user->id)),
                ];
            })->values(),
        ]);
    }

    /**
     * Create or update the compensation settings of one staff member.
     */
    public function upsert(Request $request, string $userId): JsonResponse
    {
        if (! $this->isPayrollManager($request)) {
            return $this->payrollForbidden();
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return $this->noInstitution();
        }

        $exists = Rule::exists('user_institutions', 'user_id')
            ->where(fn ($query) => $query->where('institution_id', $institutionId));

        $request->merge(['user_id' => $userId]);
        $validated = $request->validate([
            'user_id' => ['required', 'uuid', $exists],
            'designation' => 'nullable|string|max:255',
            'daily_rate' => 'required|numeric|min:0|max:999999',
            'hourly_rate' => 'nullable|numeric|min:0|max:999999',
            'hours_per_day' => 'required|numeric|min:1|max:24',
            'sss_employee' => 'nullable|numeric|min:0|max:999999',
            'pagibig_employee' => 'nullable|numeric|min:0|max:999999',
            'philhealth_employee' => 'nullable|numeric|min:0|max:999999',
            'sss_employer' => 'nullable|numeric|min:0|max:999999',
            'pagibig_employer' => 'nullable|numeric|min:0|max:999999',
            'philhealth_employer' => 'nullable|numeric|min:0|max:999999',
        ], [
            'user_id.exists' => 'This staff member does not belong to your institution.',
        ]);

        $compensation = PayrollCompensation::updateOrCreate(
            ['institution_id' => $institutionId, 'user_id' => $userId],
            [
                'designation' => $validated['designation'] ?? null,
                'daily_rate' => $validated['daily_rate'],
                'hourly_rate' => $validated['hourly_rate'] ?? null,
                'hours_per_day' => $validated['hours_per_day'],
                'sss_employee' => $validated['sss_employee'] ?? 0,
                'pagibig_employee' => $validated['pagibig_employee'] ?? 0,
                'philhealth_employee' => $validated['philhealth_employee'] ?? 0,
                'sss_employer' => $validated['sss_employer'] ?? 0,
                'pagibig_employer' => $validated['pagibig_employer'] ?? 0,
                'philhealth_employer' => $validated['philhealth_employer'] ?? 0,
                'created_by' => $request->user()?->id,
            ]
        );

        return response()->json([
            'success' => true,
            'message' => 'Compensation saved successfully',
            'data' => $this->serialize($compensation),
        ]);
    }

    private function serialize(?PayrollCompensation $compensation): ?array
    {
        if (! $compensation) {
            return null;
        }

        return [
            'id' => $compensation->id,
            'user_id' => $compensation->user_id,
            'designation' => $compensation->designation,
            'daily_rate' => (float) $compensation->daily_rate,
            'hourly_rate' => $compensation->hourly_rate !== null ? (float) $compensation->hourly_rate : null,
            'effective_hourly_rate' => $compensation->effectiveHourlyRate(),
            'hours_per_day' => (float) $compensation->hours_per_day,
            'sss_employee' => (float) $compensation->sss_employee,
            'pagibig_employee' => (float) $compensation->pagibig_employee,
            'philhealth_employee' => (float) $compensation->philhealth_employee,
            'sss_employer' => (float) $compensation->sss_employer,
            'pagibig_employer' => (float) $compensation->pagibig_employer,
            'philhealth_employer' => (float) $compensation->philhealth_employer,
            'updated_at' => $compensation->updated_at?->toIso8601String(),
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
}
