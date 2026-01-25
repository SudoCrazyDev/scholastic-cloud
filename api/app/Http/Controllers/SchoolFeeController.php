<?php

namespace App\Http\Controllers;

use App\Models\SchoolFee;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Validation\Rule;

class SchoolFeeController extends Controller
{
    /**
     * Display a listing of school fees.
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

        $query = SchoolFee::where('institution_id', $institutionId);

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

        $fees = $query->orderBy('name')->get();

        return response()->json([
            'success' => true,
            'data' => $fees
        ]);
    }

    /**
     * Store a newly created school fee.
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
            'name' => [
                'required',
                'string',
                'max:255',
                Rule::unique('school_fees')->where(function ($query) use ($institutionId) {
                    return $query->where('institution_id', $institutionId);
                })
            ],
            'description' => 'nullable|string',
            'is_active' => 'nullable|boolean',
        ]);

        $fee = SchoolFee::create([
            'institution_id' => $institutionId,
            'name' => $validated['name'],
            'description' => $validated['description'] ?? null,
            'is_active' => $validated['is_active'] ?? true,
            'created_by' => $request->user()?->id,
        ]);

        return response()->json([
            'success' => true,
            'message' => 'School fee created successfully',
            'data' => $fee
        ], 201);
    }

    /**
     * Display the specified school fee.
     */
    public function show(Request $request, string $id): JsonResponse
    {
        $institutionId = $this->resolveInstitutionId($request);
        if (!$institutionId) {
            return response()->json([
                'success' => false,
                'message' => 'User does not have any institution assigned'
            ], 400);
        }

        $fee = SchoolFee::where('institution_id', $institutionId)->find($id);
        if (!$fee) {
            return response()->json([
                'success' => false,
                'message' => 'School fee not found'
            ], 404);
        }

        return response()->json([
            'success' => true,
            'data' => $fee
        ]);
    }

    /**
     * Update the specified school fee.
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

        $fee = SchoolFee::where('institution_id', $institutionId)->find($id);
        if (!$fee) {
            return response()->json([
                'success' => false,
                'message' => 'School fee not found'
            ], 404);
        }

        $validated = $request->validate([
            'name' => [
                'sometimes',
                'required',
                'string',
                'max:255',
                Rule::unique('school_fees')->where(function ($query) use ($institutionId) {
                    return $query->where('institution_id', $institutionId);
                })->ignore($fee->id)
            ],
            'description' => 'nullable|string',
            'is_active' => 'nullable|boolean',
        ]);

        $fee->update($validated);

        return response()->json([
            'success' => true,
            'message' => 'School fee updated successfully',
            'data' => $fee->fresh()
        ]);
    }

    /**
     * Remove the specified school fee.
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

        $fee = SchoolFee::where('institution_id', $institutionId)->find($id);
        if (!$fee) {
            return response()->json([
                'success' => false,
                'message' => 'School fee not found'
            ], 404);
        }

        $fee->delete();

        return response()->json([
            'success' => true,
            'message' => 'School fee deleted successfully'
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
