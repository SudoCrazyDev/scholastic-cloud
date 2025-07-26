<?php

namespace App\Http\Controllers;

use App\Models\Subject;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Validation\ValidationException;

class SubjectController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index(Request $request): JsonResponse
    {
        $authenticatedUser = $request->user();

        // Get the authenticated user's default institution
        $defaultInstitution = $authenticatedUser->userInstitutions()
            ->where('is_default', true)
            ->first();

        if (!$defaultInstitution) {
            return response()->json([
                'success' => false,
                'message' => 'No default institution found for authenticated user'
            ], 403);
        }

        // Check if class_section_id parameter is provided
        $classSectionId = $request->query('class_section_id');
        
        if (!$classSectionId) {
            return response()->json([
                'success' => true,
                'data' => []
            ]);
        }

        $subjects = Subject::with(['institution', 'classSection', 'adviserUser', 'parentSubject', 'childSubjects'])
            ->where('institution_id', $defaultInstitution->institution_id)
            ->where('class_section_id', $classSectionId)
            ->orderBy('order', 'asc')
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json([
            'success' => true,
            'data' => $subjects
        ]);
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request): JsonResponse
    {
        try {
            $authenticatedUser = $request->user();

            // Get the authenticated user's default institution
            $defaultInstitution = $authenticatedUser->userInstitutions()
                ->where('is_default', true)
                ->first();

            if (!$defaultInstitution) {
                return response()->json([
                    'success' => false,
                    'message' => 'No default institution found for authenticated user'
                ], 403);
            }

            $validated = $request->validate([
                'class_section_id' => 'required|exists:class_sections,id',
                'adviser' => 'nullable|exists:users,id',
                'subject_type' => 'required|in:parent,child',
                'parent_subject_id' => 'nullable|exists:subjects,id',
                'title' => 'required|string|max:255',
                'variant' => 'nullable|string|max:255',
                'start_time' => 'nullable|date_format:H:i',
                'end_time' => 'nullable|date_format:H:i',
                'is_limited_student' => 'boolean',
                'order' => 'nullable|integer|min:0',
            ]);

            // Add the institution_id from the user's default institution
            $validated['institution_id'] = $defaultInstitution->institution_id;

            // Set order if not provided
            if (!isset($validated['order'])) {
                $maxOrder = Subject::where('institution_id', $defaultInstitution->institution_id)
                    ->where('class_section_id', $validated['class_section_id'])
                    ->max('order');
                $validated['order'] = ($maxOrder ?? -1) + 1;
            }

            // Validate parent_subject_id is required when subject_type is child
            if ($validated['subject_type'] === 'child' && empty($validated['parent_subject_id'])) {
                throw ValidationException::withMessages([
                    'parent_subject_id' => 'Parent subject is required when subject type is child.'
                ]);
            }

            // Validate parent_subject_id should be null when subject_type is parent
            if ($validated['subject_type'] === 'parent' && !empty($validated['parent_subject_id'])) {
                throw ValidationException::withMessages([
                    'parent_subject_id' => 'Parent subject should not be set when subject type is parent.'
                ]);
            }

            $subject = Subject::create($validated);

            return response()->json([
                'success' => true,
                'message' => 'Subject created successfully',
                'data' => $subject->load(['institution', 'classSection', 'adviserUser', 'parentSubject'])
            ], 201);

        } catch (ValidationException $e) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $e->errors()
            ], 422);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to create subject',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Display the specified resource.
     */
    public function show(Request $request, string $id): JsonResponse
    {
        try {
            $authenticatedUser = $request->user();

            // Get the authenticated user's default institution
            $defaultInstitution = $authenticatedUser->userInstitutions()
                ->where('is_default', true)
                ->first();

            if (!$defaultInstitution) {
                return response()->json([
                    'success' => false,
                    'message' => 'No default institution found for authenticated user'
                ], 403);
            }

            $subject = Subject::with(['institution', 'classSection.students', 'adviserUser', 'parentSubject', 'childSubjects'])
                ->where('institution_id', $defaultInstitution->institution_id)
                ->findOrFail($id);

            return response()->json([
                'success' => true,
                'data' => $subject
            ]);

        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Subject not found'
            ], 404);
        }
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, string $id): JsonResponse
    {
        try {
            $authenticatedUser = $request->user();

            // Get the authenticated user's default institution
            $defaultInstitution = $authenticatedUser->userInstitutions()
                ->where('is_default', true)
                ->first();

            if (!$defaultInstitution) {
                return response()->json([
                    'success' => false,
                    'message' => 'No default institution found for authenticated user'
                ], 403);
            }

            $subject = Subject::findOrFail($id);

            // Ensure the subject belongs to the user's default institution
            if ($subject->institution_id !== $defaultInstitution->institution_id) {
                return response()->json([
                    'success' => false,
                    'message' => 'Subject not found or access denied'
                ], 404);
            }

            $validated = $request->validate([
                'class_section_id' => 'sometimes|required|exists:class_sections,id',
                'adviser' => 'nullable|exists:users,id',
                'subject_type' => 'sometimes|required|in:parent,child',
                'parent_subject_id' => 'nullable|exists:subjects,id',
                'title' => 'sometimes|required|string|max:255',
                'variant' => 'nullable|string|max:255',
                'start_time' => 'nullable|date_format:H:i',
                'end_time' => 'nullable|date_format:H:i',
                'is_limited_student' => 'boolean',
                'order' => 'nullable|integer|min:0',
            ]);

            // Ensure the institution_id is always set to the user's default institution
            $validated['institution_id'] = $defaultInstitution->institution_id;

            // Validate parent_subject_id is required when subject_type is child
            if (isset($validated['subject_type']) && $validated['subject_type'] === 'child' && empty($validated['parent_subject_id'])) {
                throw ValidationException::withMessages([
                    'parent_subject_id' => 'Parent subject is required when subject type is child.'
                ]);
            }

            // Validate parent_subject_id should be null when subject_type is parent
            if (isset($validated['subject_type']) && $validated['subject_type'] === 'parent' && !empty($validated['parent_subject_id'])) {
                throw ValidationException::withMessages([
                    'parent_subject_id' => 'Parent subject should not be set when subject type is parent.'
                ]);
            }

            $subject->update($validated);

            return response()->json([
                'success' => true,
                'message' => 'Subject updated successfully',
                'data' => $subject->load(['institution', 'classSection', 'adviserUser', 'parentSubject'])
            ]);

        } catch (ValidationException $e) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $e->errors()
            ], 422);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to update subject',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(Request $request, string $id): JsonResponse
    {
        try {
            $authenticatedUser = $request->user();

            // Get the authenticated user's default institution
            $defaultInstitution = $authenticatedUser->userInstitutions()
                ->where('is_default', true)
                ->first();

            if (!$defaultInstitution) {
                return response()->json([
                    'success' => false,
                    'message' => 'No default institution found for authenticated user'
                ], 403);
            }

            $subject = Subject::where('institution_id', $defaultInstitution->institution_id)
                ->findOrFail($id);

            $subject->delete();

            return response()->json([
                'success' => true,
                'message' => 'Subject deleted successfully'
            ]);

        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to delete subject',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Reorder subjects for a specific class section.
     */
    public function reorder(Request $request): JsonResponse
    {
        try {
            $authenticatedUser = $request->user();

            // Get the authenticated user's default institution
            $defaultInstitution = $authenticatedUser->userInstitutions()
                ->where('is_default', true)
                ->first();

            if (!$defaultInstitution) {
                return response()->json([
                    'success' => false,
                    'message' => 'No default institution found for authenticated user'
                ], 403);
            }

            $validated = $request->validate([
                'class_section_id' => 'required|exists:class_sections,id',
                'subject_orders' => 'required|array',
                'subject_orders.*.id' => 'required|exists:subjects,id',
                'subject_orders.*.order' => 'required|integer|min:0',
            ]);

            // Verify all subjects belong to the user's institution and class section
            $subjectIds = collect($validated['subject_orders'])->pluck('id');
            $subjects = Subject::where('institution_id', $defaultInstitution->institution_id)
                ->where('class_section_id', $validated['class_section_id'])
                ->whereIn('id', $subjectIds)
                ->get();

            if ($subjects->count() !== $subjectIds->count()) {
                return response()->json([
                    'success' => false,
                    'message' => 'Some subjects not found or access denied'
                ], 404);
            }

            // Update the order for each subject
            foreach ($validated['subject_orders'] as $subjectOrder) {
                Subject::where('id', $subjectOrder['id'])->update(['order' => $subjectOrder['order']]);
            }

            return response()->json([
                'success' => true,
                'message' => 'Subjects reordered successfully'
            ]);

        } catch (ValidationException $e) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $e->errors()
            ], 422);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to reorder subjects',
                'error' => $e->getMessage()
            ], 500);
        }
    }
}
