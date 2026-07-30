<?php

namespace App\Http\Controllers;

use App\Auth\StudentPortalUser;
use App\Models\Institution;
use App\Models\PayrollCompensation;
use App\Models\PayrollDeductionType;
use App\Models\Role;
use App\Models\User;
use App\Services\PayrollService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class PayrollCompensationController extends Controller
{
    public function __construct(private readonly PayrollService $payrollService) {}

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

        $compensations = PayrollCompensation::with('deductions.deductionType')
            ->where('institution_id', $institutionId)
            ->whereIn('user_id', $staff->pluck('id'))
            ->get()
            ->keyBy('user_id');

        $defaultOvertimeRate = $this->defaultOvertimeRate($institutionId);
        $types = $this->activeDeductionTypes($institutionId);

        return response()->json([
            'success' => true,
            'data' => $staff->map(function (User $user) use ($compensations, $defaultOvertimeRate, $types) {
                return [
                    'user_id' => $user->id,
                    'staff_name' => $this->staffName($user),
                    'email' => $user->email,
                    'role_title' => $user->userInstitutions->first()?->role?->title,
                    'default_overtime_rate' => $defaultOvertimeRate,
                    'compensation' => $this->serialize($compensations->get($user->id), $defaultOvertimeRate, $types),
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
            'overtime_rate_per_minute' => 'nullable|numeric|min:0|max:9999',
            'deductions' => 'nullable|array',
            'deductions.*.deduction_type_id' => [
                'required',
                'uuid',
                'distinct',
                Rule::exists('payroll_deduction_types', 'id')
                    ->where(fn ($query) => $query->where('institution_id', $institutionId)),
            ],
            'deductions.*.amount' => 'required|numeric|min:0|max:999999',
            'deductions.*.employer_amount' => 'nullable|numeric|min:0|max:999999',
            // Only read for a percentage type; percent, not a fraction.
            'deductions.*.rate_percent' => 'nullable|numeric|min:0|max:100',
            'deductions.*.employer_rate_percent' => 'nullable|numeric|min:0|max:100',
        ], [
            'user_id.exists' => 'This staff member does not belong to your institution.',
            'deductions.*.deduction_type_id.exists' => 'One of the deductions does not belong to your institution.',
        ]);

        $compensation = DB::transaction(function () use ($validated, $institutionId, $userId, $request) {
            $compensation = PayrollCompensation::updateOrCreate(
                ['institution_id' => $institutionId, 'user_id' => $userId],
                [
                    'designation' => $validated['designation'] ?? null,
                    'daily_rate' => $validated['daily_rate'],
                    'hourly_rate' => $validated['hourly_rate'] ?? null,
                    'hours_per_day' => $validated['hours_per_day'],
                    'overtime_rate_per_minute' => $validated['overtime_rate_per_minute'] ?? null,
                    'created_by' => $request->user()?->id,
                ]
            );

            // Deduction defaults are fully replaced on every save.
            $compensation->deductions()->delete();
            $defaults = $this->deductionDefaults($institutionId);

            foreach ($validated['deductions'] ?? [] as $deduction) {
                $default = $defaults->get($deduction['deduction_type_id']);
                $isPercentage = $default?->isPercentage() ?? false;

                // A percentage type is carried per staff member as a rate; the
                // peso is only ever computed on the payslip, from the salary.
                $figures = $isPercentage
                    ? [
                        'amount' => 0,
                        'rate_percent' => (float) ($deduction['rate_percent'] ?? 0),
                        'employer_amount' => 0,
                        'employer_rate_percent' => (float) ($deduction['employer_rate_percent'] ?? 0),
                    ]
                    : [
                        'amount' => (float) $deduction['amount'],
                        'rate_percent' => 0,
                        'employer_amount' => (float) ($deduction['employer_amount'] ?? 0),
                        'employer_rate_percent' => 0,
                    ];

                // An all-zero row against a type with no default of its own
                // says nothing — storing it would only stop a default set
                // later from reaching this staff member. Against a type that
                // does carry a default, the same row is a deliberate
                // exemption and is kept.
                $typeHasDefault = $default !== null && ($isPercentage
                    ? ((float) $default->rate_percent > 0 || (float) $default->employer_rate_percent > 0)
                    : ((float) $default->default_amount > 0 || (float) $default->default_employer_amount > 0));

                $saysNothing = collect($figures)->every(fn ($value) => (float) $value <= 0);

                if ($saysNothing && ! $typeHasDefault) {
                    continue;
                }

                $compensation->deductions()->create($figures + [
                    'deduction_type_id' => $deduction['deduction_type_id'],
                ]);
            }

            return $compensation;
        });

        return response()->json([
            'success' => true,
            'message' => 'Compensation saved successfully',
            'data' => $this->serialize(
                $compensation->fresh('deductions.deductionType'),
                $this->defaultOvertimeRate($institutionId),
                $this->activeDeductionTypes($institutionId)
            ),
        ]);
    }

    /**
     * The institution's active deduction catalog, keyed by id.
     *
     * @return Collection<string, PayrollDeductionType>
     */
    private function activeDeductionTypes(string $institutionId): Collection
    {
        return PayrollDeductionType::where('institution_id', $institutionId)
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get()
            ->keyBy('id');
    }

    /**
     * Same lookup keyed for the upsert guard, without the active filter — an
     * inactive type's default still counts as "the type has a default".
     *
     * @return Collection<string, PayrollDeductionType>
     */
    private function deductionDefaults(string $institutionId): Collection
    {
        return PayrollDeductionType::where('institution_id', $institutionId)->get()->keyBy('id');
    }

    /**
     * @param  Collection<string, PayrollDeductionType>  $types
     */
    private function serialize(?PayrollCompensation $compensation, float $defaultOvertimeRate, Collection $types): ?array
    {
        if (! $compensation) {
            return null;
        }

        // What payroll would actually deduct, so the grid shows the catalog
        // defaults a staff member inherits and not just their own rows.
        // Percentage lines come back priced at 0 — there is no payslip here to
        // take a percentage of — so the grid shows their rate instead.
        $ownTypeIds = $compensation->deductions->pluck('deduction_type_id')->flip();
        $effective = collect($this->payrollService->resolveDeductions($compensation, $types->values()))
            ->map(fn (array $line) => [
                'deduction_type_id' => $line['deduction_type_id'],
                'name' => $line['name'],
                'calculation_type' => $line['calculation_type'],
                'amount' => $line['amount'],
                'rate_percent' => $line['rate_percent'],
                'employer_amount' => $line['employer_amount'],
                'employer_rate_percent' => $line['employer_rate_percent'],
                'percent_basis' => $line['percent_basis'],
                'from_default' => ! $ownTypeIds->has($line['deduction_type_id']),
            ]);

        return [
            'id' => $compensation->id,
            'user_id' => $compensation->user_id,
            'designation' => $compensation->designation,
            'daily_rate' => (float) $compensation->daily_rate,
            'hourly_rate' => $compensation->hourly_rate !== null ? (float) $compensation->hourly_rate : null,
            'effective_hourly_rate' => $compensation->effectiveHourlyRate(),
            'hours_per_day' => (float) $compensation->hours_per_day,
            'overtime_rate_per_minute' => $compensation->overtime_rate_per_minute !== null ? (float) $compensation->overtime_rate_per_minute : null,
            'effective_overtime_rate' => $compensation->effectiveOvertimeRate($defaultOvertimeRate),
            'deductions' => $effective->values(),
            'deductions_total' => round((float) $effective->sum('amount'), 2),
            'employer_share_total' => round((float) $effective->sum('employer_amount'), 2),
            'updated_at' => $compensation->updated_at?->toIso8601String(),
        ];
    }

    /**
     * The institution's default overtime rate — used as the fallback shown
     * for staff without a per-staff override.
     */
    private function defaultOvertimeRate(string $institutionId): float
    {
        return (float) (Institution::find($institutionId)?->overtime_rate_per_minute ?? 0);
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
