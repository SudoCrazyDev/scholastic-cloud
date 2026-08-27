<?php

namespace App\Http\Controllers;

use App\Auth\StudentPortalUser;
use App\Models\StudentPaymentPlanChange;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class StudentPaymentPlanChangeController extends Controller
{
    /**
     * List the payment-plan change history. Admin/staff only.
     * Filterable by student and academic year.
     */
    public function index(Request $request): JsonResponse
    {
        if ($this->isStudentUser($request)) {
            return response()->json([
                'success' => false,
                'message' => 'Students are not allowed to access payment plan history',
            ], 403);
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return response()->json([
                'success' => false,
                'message' => 'User does not have any institution assigned',
            ], 400);
        }

        $query = StudentPaymentPlanChange::with(['paymentPlan', 'previousPaymentPlan', 'changedBy', 'student'])
            ->where('institution_id', $institutionId);

        if ($request->filled('student_id')) {
            $query->where('student_id', $request->get('student_id'));
        }

        if ($request->filled('academic_year')) {
            $query->where('academic_year', $request->get('academic_year'));
        }

        $changes = $query->orderByDesc('changed_at')->limit(200)->get();

        return response()->json([
            'success' => true,
            'data' => $changes->map(function ($change) {
                // The label was recorded when the change was made, so it is what the actor was
                // called at the time and survives both a rename and the user being deleted.
                // The relation is only a fallback for rows written before it was stored.
                $changedByName = $change->changed_by_label;
                if (! $changedByName && $change->changedBy) {
                    $changedByName = trim(($change->changedBy->first_name ?? '').' '.($change->changedBy->last_name ?? ''));
                    $changedByName = $changedByName !== '' ? $changedByName : ($change->changedBy->email ?? null);
                }

                return [
                    'id' => $change->id,
                    'student_id' => $change->student_id,
                    'student_name' => $change->student
                        ? trim(($change->student->first_name ?? '').' '.($change->student->last_name ?? ''))
                        : null,
                    'academic_year' => $change->academic_year,
                    'payment_plan_id' => $change->payment_plan_id,
                    'plan_name' => $change->paymentPlan?->name,
                    'previous_payment_plan_id' => $change->previous_payment_plan_id,
                    'previous_plan_name' => $change->previousPaymentPlan?->name,
                    'changed_at' => $change->changed_at?->toIso8601String(),
                    'changed_by' => $change->changed_by,
                    // Falls back to 'Student' only for a self-service change recorded before the
                    // portal account was captured.
                    'changed_by_name' => $changedByName ?: ($change->changed_by_student ? 'Student' : null),
                    'changed_by_student' => (bool) $change->changed_by_student,
                    'note' => $change->note,
                ];
            })->values(),
        ]);
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

    private function isStudentUser(Request $request): bool
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
}
