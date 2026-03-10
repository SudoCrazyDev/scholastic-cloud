<?php

namespace App\Http\Controllers;

use App\Models\GradeLevel;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Validation\ValidationException;

class GradeLevelController extends Controller
{
    private function isSuperAdmin(Request $request): bool
    {
        $user = $request->user();
        $role = $user?->role;

        return $role && $role->slug === 'super-administrator';
    }

    /**
     * List all grade levels (any authenticated user). Used for dropdowns.
     */
    public function index(Request $request): JsonResponse
    {
        $gradeLevels = GradeLevel::orderBy('sort_order')->orderBy('title')->get();

        return response()->json([
            'success' => true,
            'data' => $gradeLevels,
        ]);
    }

    /**
     * Create a grade level (Super Administrator only).
     */
    public function store(Request $request): JsonResponse
    {
        if (!$this->isSuperAdmin($request)) {
            return response()->json([
                'success' => false,
                'message' => 'Only super administrators can manage grade levels.',
            ], 403);
        }

        try {
            $validated = $request->validate([
                'title' => 'required|string|max:255',
                'sort_order' => 'sometimes|integer|min:0',
            ]);

            $gradeLevel = GradeLevel::create([
                'title' => $validated['title'],
                'sort_order' => $validated['sort_order'] ?? 0,
            ]);

            return response()->json([
                'success' => true,
                'message' => 'Grade level created successfully',
                'data' => $gradeLevel,
            ], 201);
        } catch (ValidationException $e) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $e->errors(),
            ], 422);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to create grade level',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Update a grade level (Super Administrator only).
     */
    public function update(Request $request, string $id): JsonResponse
    {
        if (!$this->isSuperAdmin($request)) {
            return response()->json([
                'success' => false,
                'message' => 'Only super administrators can manage grade levels.',
            ], 403);
        }

        $gradeLevel = GradeLevel::find($id);
        if (!$gradeLevel) {
            return response()->json([
                'success' => false,
                'message' => 'Grade level not found',
            ], 404);
        }

        try {
            $validated = $request->validate([
                'title' => 'sometimes|string|max:255',
                'sort_order' => 'sometimes|integer|min:0',
            ]);

            $gradeLevel->update($validated);

            return response()->json([
                'success' => true,
                'message' => 'Grade level updated successfully',
                'data' => $gradeLevel->fresh(),
            ]);
        } catch (ValidationException $e) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $e->errors(),
            ], 422);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to update grade level',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Delete a grade level (Super Administrator only).
     */
    public function destroy(Request $request, string $id): JsonResponse
    {
        if (!$this->isSuperAdmin($request)) {
            return response()->json([
                'success' => false,
                'message' => 'Only super administrators can manage grade levels.',
            ], 403);
        }

        $gradeLevel = GradeLevel::find($id);
        if (!$gradeLevel) {
            return response()->json([
                'success' => false,
                'message' => 'Grade level not found',
            ], 404);
        }

        try {
            $gradeLevel->delete();

            return response()->json([
                'success' => true,
                'message' => 'Grade level deleted successfully',
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to delete grade level',
                'error' => $e->getMessage(),
            ], 500);
        }
    }
}
