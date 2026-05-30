<?php

namespace App\Http\Controllers;

use App\Auth\StudentPortalUser;
use App\Models\Student;
use App\Models\StudentPaymentPlan;
use App\Services\PaymentPlanService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class StudentPaymentPlanController extends Controller
{
    public function __construct(private PaymentPlanService $planService)
    {
    }

    public function show(Request $request, string $studentId): JsonResponse
    {
        if ($this->isStudentActor($request) && !$this->isSelfStudent($request, $studentId)) {
            return response()->json([
                'success' => false,
                'message' => 'Students can only access their own payment plan',
            ], 403);
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (!$institutionId) {
            return response()->json([
                'success' => false,
                'message' => 'User does not have any institution assigned',
            ], 400);
        }

        $academicYear = $request->get('academic_year');
        if (!$academicYear) {
            return response()->json([
                'success' => false,
                'message' => 'academic_year is required',
            ], 422);
        }

        $plan = StudentPaymentPlan::where('institution_id', $institutionId)
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
            'plan_type' => ['required', 'in:monthly,quarterly'],
        ]);

        $isStudent = $this->isStudentActor($request);

        if ($isStudent && !$this->isSelfStudent($request, $studentId)) {
            return response()->json([
                'success' => false,
                'message' => 'Students can only set their own payment plan',
            ], 403);
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (!$institutionId) {
            return response()->json([
                'success' => false,
                'message' => 'User does not have any institution assigned',
            ], 400);
        }

        $student = Student::whereHas('studentInstitutions', function ($query) use ($institutionId) {
            $query->where('institution_id', $institutionId);
        })->find($studentId);

        if (!$student) {
            return response()->json([
                'success' => false,
                'message' => 'Student not found',
            ], 404);
        }

        $existing = StudentPaymentPlan::where('institution_id', $institutionId)
            ->where('student_id', $studentId)
            ->where('academic_year', $validated['academic_year'])
            ->first();

        // Students can only set the plan once per academic year. Admin/staff can override.
        if ($existing && $isStudent) {
            return response()->json([
                'success' => false,
                'message' => 'Payment plan is already set for this academic year. Contact your school registrar to change it.',
            ], 409);
        }

        $selectedById = $this->resolveActorUserId($request);

        if ($existing) {
            $existing->update([
                'plan_type' => $validated['plan_type'],
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
                'plan_type' => $validated['plan_type'],
                'selected_at' => now(),
                'selected_by' => $selectedById,
                'selected_by_student' => $isStudent,
            ]);
        }

        return response()->json([
            'success' => true,
            'data' => $this->planService->serializePlan($plan),
        ]);
    }

    private function resolveInstitutionId(Request $request): ?string
    {
        $user = $request->user();
        if (!$user) {
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
        if (!$institutionId) {
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
        if (!$user) {
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
        if (!$user) {
            return null;
        }

        if ($user instanceof StudentPortalUser) {
            return $user->student->id;
        }

        return Student::where('user_id', $user->id)->value('id');
    }

    private function resolveActorUserId(Request $request): ?string
    {
        $user = $request->user();
        if (!$user) {
            return null;
        }

        if ($user instanceof StudentPortalUser) {
            // StudentPortalUser is not a row in users; selected_by stays null with selected_by_student=true.
            return null;
        }

        return $user->id;
    }
}
