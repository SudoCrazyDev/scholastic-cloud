<?php

namespace App\Http\Controllers;

use App\Models\Department;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Str;

class DepartmentController extends Controller
{
    /**
     * List departments (by institution).
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $institutionId = $request->get('institution_id') ?? $user->getDefaultInstitutionId();

        if (!$institutionId) {
            return response()->json([
                'success' => false,
                'message' => 'Institution is required',
            ], 422);
        }

        $departments = Department::where('institution_id', $institutionId)
            ->orderBy('title')
            ->get();

        return response()->json([
            'success' => true,
            'data' => $departments,
        ]);
    }

    /**
     * Store a new department.
     */
    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        $institutionId = $request->get('institution_id') ?? $user->getDefaultInstitutionId();

        if (!$institutionId) {
            return response()->json([
                'success' => false,
                'message' => 'Institution is required',
            ], 422);
        }

        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'slug' => 'nullable|string|max:255',
        ]);

        $validated['institution_id'] = $institutionId;
        if (empty($validated['slug'])) {
            $validated['slug'] = Str::slug($validated['title']);
        }

        // Ensure slug is unique per institution
        $baseSlug = $validated['slug'];
        $count = 0;
        while (Department::where('institution_id', $institutionId)->where('slug', $validated['slug'])->exists()) {
            $count++;
            $validated['slug'] = $baseSlug . '-' . $count;
        }

        $department = Department::create($validated);

        return response()->json([
            'success' => true,
            'message' => 'Department created successfully',
            'data' => $department,
        ], 201);
    }

    /**
     * Show a department.
     */
    public function show(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        $institutionId = $user->getDefaultInstitutionId();

        $department = Department::where('institution_id', $institutionId)->find($id);

        if (!$department) {
            return response()->json([
                'success' => false,
                'message' => 'Department not found',
            ], 404);
        }

        return response()->json([
            'success' => true,
            'data' => $department,
        ]);
    }

    /**
     * Update a department.
     */
    public function update(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        $institutionId = $user->getDefaultInstitutionId();

        $department = Department::where('institution_id', $institutionId)->find($id);

        if (!$department) {
            return response()->json([
                'success' => false,
                'message' => 'Department not found',
            ], 404);
        }

        $validated = $request->validate([
            'title' => 'sometimes|required|string|max:255',
            'slug' => 'nullable|string|max:255',
        ]);

        if (isset($validated['title']) && empty($validated['slug'])) {
            $validated['slug'] = Str::slug($validated['title']);
        }

        if (isset($validated['slug'])) {
            $exists = Department::where('institution_id', $institutionId)
                ->where('slug', $validated['slug'])
                ->where('id', '!=', $id)
                ->exists();
            if ($exists) {
                return response()->json([
                    'success' => false,
                    'message' => 'Slug already exists for this institution',
                    'errors' => ['slug' => ['Slug already exists for this institution.']],
                ], 422);
            }
        }

        $department->update($validated);

        return response()->json([
            'success' => true,
            'message' => 'Department updated successfully',
            'data' => $department->fresh(),
        ]);
    }

    /**
     * Remove a department.
     */
    public function destroy(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        $institutionId = $user->getDefaultInstitutionId();

        $department = Department::where('institution_id', $institutionId)->find($id);

        if (!$department) {
            return response()->json([
                'success' => false,
                'message' => 'Department not found',
            ], 404);
        }

        $department->delete();

        return response()->json([
            'success' => true,
            'message' => 'Department deleted successfully',
        ]);
    }
}
