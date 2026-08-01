<?php

namespace App\Http\Controllers;

use App\Auth\StudentPortalUser;
use App\Models\StudentFee;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Validation\Rule;

class StudentFeeController extends Controller
{
    /**
     * Display a listing of the reusable student fees.
     */
    public function index(Request $request): JsonResponse
    {
        if ($this->isStudentUser($request)) {
            return response()->json([
                'success' => false,
                'message' => 'Students are not allowed to access fee management endpoints'
            ], 403);
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (!$institutionId) {
            return response()->json([
                'success' => false,
                'message' => 'User does not have any institution assigned'
            ], 400);
        }

        $query = StudentFee::where('institution_id', $institutionId);

        if ($request->filled('search')) {
            $search = $request->get('search');
            $query->where(function ($builder) use ($search) {
                $builder->where('name', 'like', '%' . $search . '%')
                    ->orWhere('description', 'like', '%' . $search . '%');
            });
        }

        if ($request->filled('is_active')) {
            $isActive = filter_var($request->get('is_active'), FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
            if ($isActive !== null) {
                $query->where('is_active', $isActive);
            }
        }

        $fees = $query->orderBy('name')->get();

        return response()->json([
            'success' => true,
            'data' => $fees
        ]);
    }

    /**
     * Store a newly created student fee.
     */
    public function store(Request $request): JsonResponse
    {
        if ($this->isStudentUser($request)) {
            return response()->json([
                'success' => false,
                'message' => 'Students are not allowed to manage student fees'
            ], 403);
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (!$institutionId) {
            return response()->json([
                'success' => false,
                'message' => 'User does not have any institution assigned'
            ], 400);
        }

        $validated = $request->validate([
            'name' => [
                'required',
                'string',
                'max:255',
                Rule::unique('student_fees')->where(function ($query) use ($institutionId) {
                    return $query->where('institution_id', $institutionId);
                })
            ],
            'amount' => 'required|numeric|min:0',
            'billing_type' => ['nullable', Rule::in(StudentFee::BILLING_TYPES)],
            'description' => 'nullable|string',
            'is_active' => 'nullable|boolean',
        ]);

        $fee = StudentFee::create([
            'institution_id' => $institutionId,
            'name' => $validated['name'],
            'amount' => $validated['amount'],
            // Most ad-hoc fees are collected on the spot, so cash is the basis unless
            // the fee is explicitly meant to be spread over the payment plan.
            'billing_type' => $validated['billing_type'] ?? StudentFee::BILLING_CASH,
            'description' => $validated['description'] ?? null,
            'is_active' => $validated['is_active'] ?? true,
            'created_by' => $request->user()?->id,
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Student fee created successfully',
            'data' => $fee
        ], 201);
    }

    /**
     * Display the specified student fee.
     */
    public function show(Request $request, string $id): JsonResponse
    {
        if ($this->isStudentUser($request)) {
            return response()->json([
                'success' => false,
                'message' => 'Students are not allowed to access fee management endpoints'
            ], 403);
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (!$institutionId) {
            return response()->json([
                'success' => false,
                'message' => 'User does not have any institution assigned'
            ], 400);
        }

        $fee = StudentFee::where('institution_id', $institutionId)->find($id);
        if (!$fee) {
            return response()->json([
                'success' => false,
                'message' => 'Student fee not found'
            ], 404);
        }

        return response()->json([
            'success' => true,
            'data' => $fee
        ]);
    }

    /**
     * Update the specified student fee.
     */
    public function update(Request $request, string $id): JsonResponse
    {
        if ($this->isStudentUser($request)) {
            return response()->json([
                'success' => false,
                'message' => 'Students are not allowed to manage student fees'
            ], 403);
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (!$institutionId) {
            return response()->json([
                'success' => false,
                'message' => 'User does not have any institution assigned'
            ], 400);
        }

        $fee = StudentFee::where('institution_id', $institutionId)->find($id);
        if (!$fee) {
            return response()->json([
                'success' => false,
                'message' => 'Student fee not found'
            ], 404);
        }

        $validated = $request->validate([
            'name' => [
                'sometimes',
                'required',
                'string',
                'max:255',
                Rule::unique('student_fees')->where(function ($query) use ($institutionId) {
                    return $query->where('institution_id', $institutionId);
                })->ignore($fee->id)
            ],
            'amount' => 'sometimes|required|numeric|min:0',
            'billing_type' => ['sometimes', 'required', Rule::in(StudentFee::BILLING_TYPES)],
            'description' => 'nullable|string',
            'is_active' => 'nullable|boolean',
        ]);

        // Charges already posted keep the basis they were posted under, so re-pointing the
        // template only changes what the next charge from it will do.
        $fee->update($validated);

        return response()->json([
            'success' => true,
            'message' => 'Student fee updated successfully',
            'data' => $fee->fresh()
        ]);
    }

    /**
     * Remove the specified student fee.
     */
    public function destroy(Request $request, string $id): JsonResponse
    {
        if ($this->isStudentUser($request)) {
            return response()->json([
                'success' => false,
                'message' => 'Students are not allowed to manage student fees'
            ], 403);
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (!$institutionId) {
            return response()->json([
                'success' => false,
                'message' => 'User does not have any institution assigned'
            ], 400);
        }

        $fee = StudentFee::where('institution_id', $institutionId)->find($id);
        if (!$fee) {
            return response()->json([
                'success' => false,
                'message' => 'Student fee not found'
            ], 404);
        }

        // Charges already posted to a ledger keep their own copy of the name and
        // amount, so deleting the template only stops future use of it.
        $fee->delete();

        return response()->json([
            'success' => true,
            'message' => 'Student fee deleted successfully'
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

    private function isStudentUser(Request $request): bool
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
}
