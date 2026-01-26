<?php

namespace App\Http\Controllers;

use App\Models\Student;
use App\Models\SchoolFee;
use App\Models\StudentDiscount;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Validation\Rule;

class StudentDiscountController extends Controller
{
    /**
     * Display a listing of student discounts.
     */
    public function index(Request $request): JsonResponse
    {
        $institutionId = $this->resolveInstitutionId($request);
        if (!$institutionId) {
            return response()->json([
                'success' => false,
                'message' => 'User does not have any institution assigned'
            ], 400);
        }

        $validated = $request->validate([
            'student_id' => 'required|uuid|exists:students,id',
            'academic_year' => 'nullable|string|max:255',
        ]);

        $student = Student::whereHas('studentInstitutions', function ($query) use ($institutionId) {
            $query->where('institution_id', $institutionId);
        })->find($validated['student_id']);

        if (!$student) {
            return response()->json([
                'success' => false,
                'message' => 'Student not found in this institution'
            ], 404);
        }

        $query = StudentDiscount::with('schoolFee')
            ->where('institution_id', $institutionId)
            ->where('student_id', $validated['student_id']);

        if ($request->filled('academic_year')) {
            $query->where('academic_year', $request->get('academic_year'));
        }

        $discounts = $query->orderBy('created_at', 'desc')->get();

        return response()->json([
            'success' => true,
            'data' => $discounts
        ]);
    }

    /**
     * Store a newly created student discount.
     */
    public function store(Request $request): JsonResponse
    {
        $institutionId = $this->resolveInstitutionId($request);
        if (!$institutionId) {
            return response()->json([
                'success' => false,
                'message' => 'User does not have any institution assigned'
            ], 400);
        }

        $validated = $request->validate([
            'student_id' => 'required|uuid|exists:students,id',
            'academic_year' => 'required|string|max:255',
            'discount_type' => ['required', Rule::in(['fixed', 'percentage'])],
            'value' => 'required|numeric|min:0',
            'school_fee_id' => 'nullable|uuid|exists:school_fees,id',
            'description' => 'nullable|string',
        ]);

        if ($validated['discount_type'] === 'percentage' && $validated['value'] > 100) {
            return response()->json([
                'success' => false,
                'message' => 'Percentage discount cannot exceed 100.'
            ], 422);
        }

        $student = Student::whereHas('studentInstitutions', function ($query) use ($institutionId) {
            $query->where('institution_id', $institutionId);
        })->find($validated['student_id']);

        if (!$student) {
            return response()->json([
                'success' => false,
                'message' => 'Student not found in this institution'
            ], 404);
        }

        if (!empty($validated['school_fee_id'])) {
            $schoolFee = SchoolFee::where('institution_id', $institutionId)
                ->where('id', $validated['school_fee_id'])
                ->first();

            if (!$schoolFee) {
                return response()->json([
                    'success' => false,
                    'message' => 'School fee not found for this institution'
                ], 404);
            }
        }

        $discount = StudentDiscount::create([
            'institution_id' => $institutionId,
            'student_id' => $validated['student_id'],
            'school_fee_id' => $validated['school_fee_id'] ?? null,
            'academic_year' => $validated['academic_year'],
            'discount_type' => $validated['discount_type'],
            'value' => $validated['value'],
            'description' => $validated['description'] ?? null,
            'created_by' => $request->user()?->id,
        ]);

        $discount->load('schoolFee');

        return response()->json([
            'success' => true,
            'message' => 'Discount saved successfully',
            'data' => $discount
        ], 201);
    }

    /**
     * Update the specified student discount.
     */
    public function update(Request $request, string $id): JsonResponse
    {
        $institutionId = $this->resolveInstitutionId($request);
        if (!$institutionId) {
            return response()->json([
                'success' => false,
                'message' => 'User does not have any institution assigned'
            ], 400);
        }

        $discount = StudentDiscount::where('institution_id', $institutionId)->find($id);
        if (!$discount) {
            return response()->json([
                'success' => false,
                'message' => 'Discount not found'
            ], 404);
        }

        $validated = $request->validate([
            'discount_type' => ['sometimes', 'required', Rule::in(['fixed', 'percentage'])],
            'value' => 'sometimes|required|numeric|min:0',
            'school_fee_id' => 'nullable|uuid|exists:school_fees,id',
            'description' => 'nullable|string',
        ]);

        $effectiveType = $validated['discount_type'] ?? $discount->discount_type;
        if ($effectiveType === 'percentage') {
            $value = $validated['value'] ?? $discount->value;
            if ($value > 100) {
                return response()->json([
                    'success' => false,
                    'message' => 'Percentage discount cannot exceed 100.'
                ], 422);
            }
        }

        if (array_key_exists('school_fee_id', $validated) && $validated['school_fee_id']) {
            $schoolFee = SchoolFee::where('institution_id', $institutionId)
                ->where('id', $validated['school_fee_id'])
                ->first();

            if (!$schoolFee) {
                return response()->json([
                    'success' => false,
                    'message' => 'School fee not found for this institution'
                ], 404);
            }
        }

        $discount->update($validated);
        $discount->load('schoolFee');

        return response()->json([
            'success' => true,
            'message' => 'Discount updated successfully',
            'data' => $discount
        ]);
    }

    /**
     * Remove the specified student discount.
     */
    public function destroy(Request $request, string $id): JsonResponse
    {
        $institutionId = $this->resolveInstitutionId($request);
        if (!$institutionId) {
            return response()->json([
                'success' => false,
                'message' => 'User does not have any institution assigned'
            ], 400);
        }

        $discount = StudentDiscount::where('institution_id', $institutionId)->find($id);
        if (!$discount) {
            return response()->json([
                'success' => false,
                'message' => 'Discount not found'
            ], 404);
        }

        $discount->delete();

        return response()->json([
            'success' => true,
            'message' => 'Discount deleted successfully'
        ]);
    }

    private function resolveInstitutionId(Request $request): ?string
    {
        $user = $request->user();
        if (!$user) {
            return null;
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
}
