<?php

namespace App\Http\Controllers;

use App\Auth\StudentPortalUser;
use App\Models\GradeLevelDiscount;
use App\Models\GradeLevelDiscountStudentVoid;
use App\Models\SchoolFee;
use App\Models\Student;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class GradeLevelDiscountController extends Controller
{
    private const VOID_ROLES = ['finance', 'institution-administrator', 'principal', 'super-administrator'];

    public function index(Request $request): JsonResponse
    {
        if ($this->isStudentUser($request)) {
            return response()->json(['success' => false, 'message' => 'Forbidden'], 403);
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return response()->json(['success' => false, 'message' => 'No institution assigned'], 400);
        }

        $query = GradeLevelDiscount::with('schoolFee')
            ->where('institution_id', $institutionId);

        if ($request->filled('academic_year')) {
            $query->where('academic_year', $request->get('academic_year'));
        }
        if ($request->filled('grade_level')) {
            $query->where('grade_level', $request->get('grade_level'));
        }

        return response()->json([
            'success' => true,
            'data' => $query->orderBy('grade_level')->orderBy('created_at')->get(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        if ($this->isStudentUser($request)) {
            return response()->json(['success' => false, 'message' => 'Forbidden'], 403);
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return response()->json(['success' => false, 'message' => 'No institution assigned'], 400);
        }

        $validated = $request->validate([
            'grade_level' => 'required|string|max:50',
            'academic_year' => 'required|string|max:255',
            'discount_type' => ['required', Rule::in(['fixed', 'percentage'])],
            'value' => 'required|numeric|min:0',
            'school_fee_id' => 'nullable|uuid|exists:school_fees,id',
            'description' => 'nullable|string|max:500',
        ]);

        if ($validated['discount_type'] === 'percentage' && $validated['value'] > 100) {
            return response()->json(['success' => false, 'message' => 'Percentage cannot exceed 100.'], 422);
        }

        if (! empty($validated['school_fee_id'])) {
            $fee = SchoolFee::where('institution_id', $institutionId)->find($validated['school_fee_id']);
            if (! $fee) {
                return response()->json(['success' => false, 'message' => 'School fee not found'], 404);
            }
        }

        $discount = GradeLevelDiscount::create([
            'institution_id' => $institutionId,
            'school_fee_id' => $validated['school_fee_id'] ?? null,
            'grade_level' => $validated['grade_level'],
            'academic_year' => $validated['academic_year'],
            'discount_type' => $validated['discount_type'],
            'value' => $validated['value'],
            'description' => $validated['description'] ?? null,
            'created_by' => $request->user()?->id,
        ]);

        $discount->load('schoolFee');

        return response()->json(['success' => true, 'data' => $discount], 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        if ($this->isStudentUser($request)) {
            return response()->json(['success' => false, 'message' => 'Forbidden'], 403);
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return response()->json(['success' => false, 'message' => 'No institution assigned'], 400);
        }

        $discount = GradeLevelDiscount::where('institution_id', $institutionId)->find($id);
        if (! $discount) {
            return response()->json(['success' => false, 'message' => 'Not found'], 404);
        }

        $validated = $request->validate([
            'discount_type' => ['sometimes', 'required', Rule::in(['fixed', 'percentage'])],
            'value' => 'sometimes|required|numeric|min:0',
            'school_fee_id' => 'nullable|uuid|exists:school_fees,id',
            'description' => 'nullable|string|max:500',
        ]);

        $effectiveType = $validated['discount_type'] ?? $discount->discount_type;
        $effectiveValue = $validated['value'] ?? $discount->value;
        if ($effectiveType === 'percentage' && $effectiveValue > 100) {
            return response()->json(['success' => false, 'message' => 'Percentage cannot exceed 100.'], 422);
        }

        $discount->update($validated);
        $discount->load('schoolFee');

        return response()->json(['success' => true, 'data' => $discount]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        if ($this->isStudentUser($request)) {
            return response()->json(['success' => false, 'message' => 'Forbidden'], 403);
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return response()->json(['success' => false, 'message' => 'No institution assigned'], 400);
        }

        $discount = GradeLevelDiscount::where('institution_id', $institutionId)->find($id);
        if (! $discount) {
            return response()->json(['success' => false, 'message' => 'Not found'], 404);
        }

        $discount->delete();

        return response()->json(['success' => true, 'message' => 'Deleted']);
    }

    /**
     * Void a grade-level discount for a single student. The shared discount
     * record is left untouched (it still applies to the rest of the grade);
     * we only record a per-student exclusion so it drops off this student's
     * ledger totals, running balance, and NOA.
     */
    public function voidForStudent(Request $request, string $id): JsonResponse
    {
        if (! $this->canVoid($request)) {
            return response()->json([
                'success' => false,
                'message' => 'You are not allowed to void discounts',
            ], 403);
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return response()->json([
                'success' => false,
                'message' => 'User does not have any institution assigned',
            ], 400);
        }

        $discount = GradeLevelDiscount::where('institution_id', $institutionId)->find($id);
        if (! $discount) {
            return response()->json([
                'success' => false,
                'message' => 'Grade level discount not found',
            ], 404);
        }

        $validated = $request->validate([
            'student_id' => 'required|uuid',
            'void_note' => 'required|string|max:2000',
        ]);

        $student = Student::whereHas('studentInstitutions', function ($query) use ($institutionId) {
            $query->where('institution_id', $institutionId);
        })->find($validated['student_id']);
        if (! $student) {
            return response()->json([
                'success' => false,
                'message' => 'Student not found',
            ], 404);
        }

        $existing = GradeLevelDiscountStudentVoid::where('student_id', $validated['student_id'])
            ->where('grade_level_discount_id', $discount->id)
            ->first();
        if ($existing) {
            return response()->json([
                'success' => false,
                'message' => 'This discount is already voided for this student.',
            ], 422);
        }

        $void = GradeLevelDiscountStudentVoid::create([
            'institution_id' => $institutionId,
            'student_id' => $validated['student_id'],
            'grade_level_discount_id' => $discount->id,
            'academic_year' => $discount->academic_year,
            'voided_at' => now(),
            'voided_by' => $request->user()?->id,
            'void_note' => $validated['void_note'],
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Grade level discount voided for student',
            'data' => $void,
        ]);
    }

    private function canVoid(Request $request): bool
    {
        $user = $request->user();
        if (! $user || $user instanceof StudentPortalUser) {
            return false;
        }

        $role = method_exists($user, 'getRole') ? $user->getRole() : null;

        return in_array((string) ($role->slug ?? ''), self::VOID_ROLES, true);
    }

    private function resolveInstitutionId(Request $request): ?string
    {
        $user = $request->user();
        if (! $user) {
            return null;
        }

        $institutionId = $user->getDefaultInstitutionId();
        if (! $institutionId) {
            $first = $user->userInstitutions()->first();
            if ($first) {
                $institutionId = $first->institution_id;
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
