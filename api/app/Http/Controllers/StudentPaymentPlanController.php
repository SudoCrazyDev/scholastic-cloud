<?php

namespace App\Http\Controllers;

use App\Auth\StudentPortalUser;
use App\Models\PaymentPlan;
use App\Models\Student;
use App\Models\StudentPaymentPlan;
use App\Models\StudentPaymentPlanChange;
use App\Services\PaymentPlanService;
use App\Services\PaymentScheduleBasis;
use App\Support\AcademicYear;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class StudentPaymentPlanController extends Controller
{
    public function __construct(
        private PaymentPlanService $planService,
        private PaymentScheduleBasis $scheduleBasis
    ) {}

    /**
     * Every plan the school offers, each priced against this student's own account.
     *
     * A family choosing between plan names had no idea what any of them would cost. This
     * answers "what would three terms look like for me" using their real charges, discounts
     * and payments — only the plan is swapped — so the comparison is what they would actually
     * be billed rather than a worked example. It is what both the first selection and a later
     * change are made from.
     *
     * Strictly read-only. It does not select a plan, and it deliberately does not run
     * LateFeeService: booking a surcharge is a side effect of reading a ledger, and a plan
     * merely being compared must not leave charges on the account. A projection therefore
     * shows principal only, which `includes_surcharges: false` states plainly.
     */
    public function options(Request $request, string $studentId): JsonResponse
    {
        if ($this->isStudentActor($request) && ! $this->isSelfStudent($request, $studentId)) {
            return response()->json([
                'success' => false,
                'message' => 'Students can only compare plans for their own account',
            ], 403);
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return response()->json([
                'success' => false,
                'message' => 'User does not have any institution assigned',
            ], 400);
        }

        $academicYear = $request->get('academic_year');
        if (! $academicYear) {
            return response()->json([
                'success' => false,
                'message' => 'academic_year is required',
            ], 422);
        }

        $student = Student::whereHas('studentInstitutions', function ($query) use ($institutionId) {
            $query->where('institution_id', $institutionId);
        })->find($studentId);

        if (! $student) {
            return response()->json([
                'success' => false,
                'message' => 'Student not found',
            ], 404);
        }

        $basis = $this->scheduleBasis->for($institutionId, $studentId, $academicYear);

        $selected = StudentPaymentPlan::where('institution_id', $institutionId)
            ->where('student_id', $studentId)
            ->where('academic_year', $academicYear)
            ->first();

        $plans = PaymentPlan::with('installments')
            ->where('institution_id', $institutionId)
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get();

        // The student's own plan is priced too, even if it has since been disabled — otherwise
        // the one schedule they are actually on would be missing from the comparison.
        if ($selected?->payment_plan_id && ! $plans->contains('id', $selected->payment_plan_id)) {
            $current = PaymentPlan::with('installments')->find($selected->payment_plan_id);
            if ($current) {
                $plans = $plans->push($current);
            }
        }

        $options = $plans->map(function (PaymentPlan $definition) use (
            $basis,
            $academicYear,
            $selected
        ) {
            // A throwaway selection, never saved: buildInstallments() reads the plan off it,
            // and this is what lets one student's figures be priced against every plan.
            $hypothetical = new StudentPaymentPlan(['academic_year' => $academicYear]);
            $hypothetical->setRelation('paymentPlan', $definition);

            $installments = $this->planService->withRunningTotals(
                $this->planService->buildInstallments(
                    $hypothetical,
                    $academicYear,
                    $basis['principal_charges'],
                    $basis['discounts_total'],
                    $basis['principal_payments'],
                    $basis['principal_payment_rows'],
                    $basis['dated_adjustments']
                )
            );

            $current = collect($installments)->firstWhere('is_current', true);
            $stillToCollect = round(
                (float) collect($installments)->sum('outstanding_amount'),
                2
            );

            return [
                'payment_plan_id' => $definition->id,
                'name' => $definition->name,
                'description' => $definition->description,
                'schedule_mode' => $definition->schedule_mode ?? PaymentPlan::SCHEDULE_FIXED,
                'advance_payment_mode' => $definition->advance_payment_mode,
                'surcharge_mode' => $definition->surcharge_mode,
                'installment_count' => $definition->installments->count(),
                'is_selected' => $selected?->payment_plan_id === $definition->id,
                'is_active' => (bool) $definition->is_active,
                // What this plan would ask for next, and what is left to collect under it.
                'current_period' => $current ? [
                    'sequence' => $current['sequence'],
                    'label' => $current['label'],
                    'due_date' => $current['due_date'],
                    'amount' => $current['amount'],
                    'outstanding_amount' => $current['outstanding_amount'],
                ] : null,
                'still_to_collect' => $stillToCollect,
                'installments' => $installments,
            ];
        })->values();

        return response()->json([
            'success' => true,
            'data' => [
                'academic_year' => $academicYear,
                'grade_level' => $basis['grade_level'],
                // Stated so the comparison can say what it is priced on rather than leaving a
                // parent to wonder whether their payments were counted.
                'principal_charges' => $basis['principal_charges'],
                'discounts_total' => $basis['discounts_total'],
                'payments_total' => $basis['principal_payments'],
                'selected_payment_plan_id' => $selected?->payment_plan_id,
                // Late fees are not projected: see the note on this method.
                'includes_surcharges' => false,
                'options' => $options,
            ],
        ]);
    }

    public function show(Request $request, string $studentId): JsonResponse
    {
        if ($this->isStudentActor($request) && ! $this->isSelfStudent($request, $studentId)) {
            return response()->json([
                'success' => false,
                'message' => 'Students can only access their own payment plan',
            ], 403);
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return response()->json([
                'success' => false,
                'message' => 'User does not have any institution assigned',
            ], 400);
        }

        $academicYear = $request->get('academic_year');
        if (! $academicYear) {
            return response()->json([
                'success' => false,
                'message' => 'academic_year is required',
            ], 422);
        }

        $plan = StudentPaymentPlan::with('paymentPlan.installments')
            ->where('institution_id', $institutionId)
            ->where('student_id', $studentId)
            ->where('academic_year', $academicYear)
            ->first();

        return response()->json([
            'success' => true,
            'data' => $this->planService->serializePlan($plan),
        ]);
    }

    public function store(Request $request, string $studentId): JsonResponse
    {
        $validated = $request->validate([
            'academic_year' => ['required', 'string'],
            'payment_plan_id' => ['required', 'string'],
            'note' => ['nullable', 'string', 'max:255'],
        ]);

        $isStudent = $this->isStudentActor($request);

        if ($isStudent && ! $this->isSelfStudent($request, $studentId)) {
            return response()->json([
                'success' => false,
                'message' => 'Students can only set their own payment plan',
            ], 403);
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return response()->json([
                'success' => false,
                'message' => 'User does not have any institution assigned',
            ], 400);
        }

        $student = Student::whereHas('studentInstitutions', function ($query) use ($institutionId) {
            $query->where('institution_id', $institutionId);
        })->find($studentId);

        if (! $student) {
            return response()->json([
                'success' => false,
                'message' => 'Student not found',
            ], 404);
        }

        // The chosen plan must belong to this institution and be active.
        $definition = PaymentPlan::where('institution_id', $institutionId)
            ->where('is_active', true)
            ->find($validated['payment_plan_id']);

        if (! $definition) {
            return response()->json([
                'success' => false,
                'message' => 'The selected payment plan is not available.',
            ], 422);
        }

        // A family may choose and re-choose their own plan, but only for the year the school
        // is currently running. A closed year's schedule is settled bookkeeping — re-amortizing
        // it would move due dates and re-assess surcharges on a ledger already reconciled — so
        // a correction there stays with staff, who can still set any year.
        if ($isStudent) {
            $currentYear = AcademicYear::forInstitution($institutionId);
            if ($validated['academic_year'] !== $currentYear) {
                return response()->json([
                    'success' => false,
                    'message' => "You can only change your payment plan for the current school year ({$currentYear}). Contact your school registrar about an earlier year.",
                ], 422);
            }
        }

        $existing = StudentPaymentPlan::where('institution_id', $institutionId)
            ->where('student_id', $studentId)
            ->where('academic_year', $validated['academic_year'])
            ->first();

        $selectedById = $this->resolveActorUserId($request);
        $actorLabel = $this->resolveActorLabel($request);
        $previousPlanId = $existing?->payment_plan_id;

        // plan_type kept for backward compatibility with legacy readers.
        $legacyType = in_array(strtolower($definition->name), ['monthly', 'quarterly'], true)
            ? strtolower($definition->name)
            : null;

        $plan = DB::transaction(function () use (
            $existing,
            $institutionId,
            $studentId,
            $validated,
            $definition,
            $legacyType,
            $selectedById,
            $actorLabel,
            $isStudent,
            $previousPlanId

        ) {
            if ($existing) {
                $existing->update([
                    'payment_plan_id' => $definition->id,
                    'plan_type' => $legacyType,
                    'selected_at' => now(),
                    'selected_by' => $selectedById,
                    'selected_by_student' => $isStudent,
                ]);
                $plan = $existing->fresh();
            } else {
                $plan = StudentPaymentPlan::create([
                    'institution_id' => $institutionId,
                    'student_id' => $studentId,
                    'academic_year' => $validated['academic_year'],
                    'payment_plan_id' => $definition->id,
                    'plan_type' => $legacyType,
                    'selected_at' => now(),
                    'selected_by' => $selectedById,
                    'selected_by_student' => $isStudent,
                ]);
            }

            // Record history only on a real selection or change of plan.
            if ($previousPlanId !== $definition->id) {
                StudentPaymentPlanChange::create([
                    'institution_id' => $institutionId,
                    'student_id' => $studentId,
                    'academic_year' => $validated['academic_year'],
                    'payment_plan_id' => $definition->id,
                    'previous_payment_plan_id' => $previousPlanId,
                    'changed_at' => now(),
                    'changed_by' => $selectedById,
                    'changed_by_student' => $isStudent,
                    'changed_by_label' => $actorLabel,
                    'note' => $validated['note'] ?? null,
                ]);
            }

            return $plan;
        });

        $plan->load('paymentPlan.installments');

        return response()->json([
            'success' => true,
            'data' => $this->planService->serializePlan($plan),
        ]);
    }

    private function resolveInstitutionId(Request $request): ?string
    {
        $user = $request->user();
        if (! $user) {
            return null;
        }

        if ($user instanceof StudentPortalUser) {
            return $user->student
                ->studentInstitutions()
                ->where('is_active', true)
                ->value('institution_id')
                ?? $user->student->studentInstitutions()->value('institution_id');
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

    private function isStudentActor(Request $request): bool
    {
        $user = $request->user();
        if (! $user) {
            return false;
        }

        if ($user instanceof StudentPortalUser) {
            return true;
        }

        $role = method_exists($user, 'getRole') ? $user->getRole() : null;

        return (string) ($role->slug ?? '') === 'student';
    }

    private function isSelfStudent(Request $request, string $studentId): bool
    {
        return $this->resolveSelfStudentId($request) === $studentId;
    }

    private function resolveSelfStudentId(Request $request): ?string
    {
        $user = $request->user();
        if (! $user) {
            return null;
        }

        if ($user instanceof StudentPortalUser) {
            return $user->student->id;
        }

        return Student::where('user_id', $user->id)->value('id');
    }

    /**
     * The actor in words, stored with the change so finance can see who moved this student.
     *
     * A portal login is not a row in `users`, so `changed_by` is null for a self-service
     * change and the history had nothing to name but the boolean. The portal account is
     * the closest thing to an identity a family has — one login is shared by student and
     * parent — so it is the login that gets recorded.
     */
    private function resolveActorLabel(Request $request): ?string
    {
        $user = $request->user();
        if (! $user) {
            return null;
        }

        if ($user instanceof StudentPortalUser) {
            $name = trim(($user->student->first_name ?? '').' '.($user->student->last_name ?? ''));
            $email = $user->studentAuth->email ?? null;

            if ($name !== '' && $email) {
                return "{$name} ({$email})";
            }

            return $name !== '' ? $name : $email;
        }

        $name = trim(($user->first_name ?? '').' '.($user->last_name ?? ''));

        return $name !== '' ? $name : ($user->email ?? null);
    }

    private function resolveActorUserId(Request $request): ?string
    {
        $user = $request->user();
        if (! $user) {
            return null;
        }

        if ($user instanceof StudentPortalUser) {
            // StudentPortalUser is not a row in users; selected_by stays null with selected_by_student=true.
            return null;
        }

        return $user->id;
    }
}
