<?php

namespace App\Http\Controllers;

use App\Auth\StudentPortalUser;
use App\Models\DefaultDiscount;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Validation\Rule;

class DefaultDiscountController extends Controller
{
    /**
     * Display a listing of default discounts.
     */
    public function index(Request $request): JsonResponse
    {
        if ($this->isStudentUser($request)) {
            return response()->json([
                'success' => false,
                'message' => 'Students are not allowed to access discount management endpoints'
            ], 403);
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (!$institutionId) {
            return response()->json([
                'success' => false,
                'message' => 'User does not have any institution assigned'
            ], 400);
        }

        $query = DefaultDiscount::where('institution_id', $institutionId);

        if ($request->filled('search')) {
            $search = $request->get('search');
            $query->where('name', 'like', '%' . $search . '%');
        }

        if ($request->filled('is_active')) {
            $isActive = filter_var($request->get('is_active'), FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
            if ($isActive !== null) {
                $query->where('is_active', $isActive);
            }
        }

        $discounts = $query->orderBy('name')->get();

        return response()->json([
            'success' => true,
            'data' => $discounts
        ]);
    }

    /**
     * Store a newly created default discount.
     */
    public function store(Request $request): JsonResponse
    {
        if ($this->isStudentUser($request)) {
            return response()->json([
                'success' => false,
                'message' => 'Students are not allowed to manage default discounts'
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
                Rule::unique('default_discounts')->where(function ($query) use ($institutionId) {
                    return $query->where('institution_id', $institutionId);
                })
            ],
            'discount_type' => ['required', Rule::in(['fixed', 'percentage'])],
            'value' => 'required|numeric|min:0',
            'description' => 'nullable|string',
            'is_active' => 'nullable|boolean',
        ]);

        if ($validated['discount_type'] === 'percentage' && $validated['value'] > 100) {
            return response()->json([
                'success' => false,
                'message' => 'Percentage discount cannot exceed 100.'
            ], 422);
        }

        $discount = DefaultDiscount::create([
            'institution_id' => $institutionId,
            'name' => $validated['name'],
            'discount_type' => $validated['discount_type'],
            'value' => $validated['value'],
            'description' => $validated['description'] ?? null,
            'is_active' => $validated['is_active'] ?? true,
            'created_by' => $request->user()?->id,
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Default discount created successfully',
            'data' => $discount
        ], 201);
    }

    /**
     * Display the specified default discount.
     */
    public function show(Request $request, string $id): JsonResponse
    {
        if ($this->isStudentUser($request)) {
            return response()->json([
                'success' => false,
                'message' => 'Students are not allowed to access discount management endpoints'
            ], 403);
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (!$institutionId) {
            return response()->json([
                'success' => false,
                'message' => 'User does not have any institution assigned'
            ], 400);
        }

        $discount = DefaultDiscount::where('institution_id', $institutionId)->find($id);
        if (!$discount) {
            return response()->json([
                'success' => false,
                'message' => 'Default discount not found'
            ], 404);
        }

        return response()->json([
            'success' => true,
            'data' => $discount
        ]);
    }

    /**
     * Update the specified default discount.
     */
    public function update(Request $request, string $id): JsonResponse
    {
        if ($this->isStudentUser($request)) {
            return response()->json([
                'success' => false,
                'message' => 'Students are not allowed to manage default discounts'
            ], 403);
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (!$institutionId) {
            return response()->json([
                'success' => false,
                'message' => 'User does not have any institution assigned'
            ], 400);
        }

        $discount = DefaultDiscount::where('institution_id', $institutionId)->find($id);
        if (!$discount) {
            return response()->json([
                'success' => false,
                'message' => 'Default discount not found'
            ], 404);
        }

        $validated = $request->validate([
            'name' => [
                'sometimes',
                'required',
                'string',
                'max:255',
                Rule::unique('default_discounts')->where(function ($query) use ($institutionId) {
                    return $query->where('institution_id', $institutionId);
                })->ignore($discount->id)
            ],
            'discount_type' => ['sometimes', 'required', Rule::in(['fixed', 'percentage'])],
            'value' => 'sometimes|required|numeric|min:0',
            'description' => 'nullable|string',
            'is_active' => 'nullable|boolean',
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

        $discount->update($validated);

        return response()->json([
            'success' => true,
            'message' => 'Default discount updated successfully',
            'data' => $discount->fresh()
        ]);
    }

    /**
     * Remove the specified default discount.
     */
    public function destroy(Request $request, string $id): JsonResponse
    {
        if ($this->isStudentUser($request)) {
            return response()->json([
                'success' => false,
                'message' => 'Students are not allowed to manage default discounts'
            ], 403);
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (!$institutionId) {
            return response()->json([
                'success' => false,
                'message' => 'User does not have any institution assigned'
            ], 400);
        }

        $discount = DefaultDiscount::where('institution_id', $institutionId)->find($id);
        if (!$discount) {
            return response()->json([
                'success' => false,
                'message' => 'Default discount not found'
            ], 404);
        }

        $discount->delete();

        return response()->json([
            'success' => true,
            'message' => 'Default discount deleted successfully'
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
