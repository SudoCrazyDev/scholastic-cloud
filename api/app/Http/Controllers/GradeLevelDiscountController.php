<?php

namespace App\Http\Controllers;

use App\Auth\StudentPortalUser;
use App\Models\GradeLevelDiscount;
use App\Models\SchoolFee;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class GradeLevelDiscountController extends Controller
{
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
