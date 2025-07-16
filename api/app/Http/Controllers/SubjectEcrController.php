<?php

namespace App\Http\Controllers;

use App\Models\SubjectEcr;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Validation\ValidationException;

class SubjectEcrController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index(Request $request): JsonResponse
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

            // Get subject_id parameter to filter by subject
            $subjectId = $request->query('subject_id');
            
            $query = SubjectEcr::with(['subject']);

            if ($subjectId) {
                $query->where('subject_id', $subjectId);
            }

            // Filter by subjects that belong to the user's default institution
            $query->whereHas('subject', function ($q) use ($defaultInstitution) {
                $q->where('institution_id', $defaultInstitution->institution_id);
            });

            $subjectEcrs = $query->orderBy('created_at', 'desc')->get();

            return response()->json([
                'success' => true,
                'data' => $subjectEcrs
            ]);

        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to retrieve subjects ECR',
                'error' => $e->getMessage()
            ], 500);
        }
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
                'subject_id' => 'required|exists:subjects,id',
                'title' => 'required|string|max:255',
                'percentage' => 'required|numeric|min:0|max:100',
            ]);

            // Verify that the subject belongs to the user's default institution
            $subject = \App\Models\Subject::where('id', $validated['subject_id'])
                ->where('institution_id', $defaultInstitution->institution_id)
                ->first();

            if (!$subject) {
                return response()->json([
                    'success' => false,
                    'message' => 'Subject not found or access denied'
                ], 404);
            }

            // Check if the total percentage for this subject_id exceeds 100
            $currentTotal = SubjectEcr::where('subject_id', $validated['subject_id'])->sum('percentage');
            if (($currentTotal + $validated['percentage']) > 100) {
                return response()->json([
                    'success' => false,
                    'message' => 'Total percentage for this subject exceeds 100%.'
                ], 422);
            }

            $subjectEcr = SubjectEcr::create($validated);

            return response()->json([
                'success' => true,
                'message' => 'Subject ECR created successfully',
                'data' => $subjectEcr->load(['subject'])
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
                'message' => 'Failed to create subject ECR',
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

            $subjectEcr = SubjectEcr::with(['subject'])
                ->whereHas('subject', function ($q) use ($defaultInstitution) {
                    $q->where('institution_id', $defaultInstitution->institution_id);
                })
                ->findOrFail($id);

            return response()->json([
                'success' => true,
                'data' => $subjectEcr
            ]);

        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Subject ECR not found'
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

            $subjectEcr = SubjectEcr::findOrFail($id);

            // Ensure the subject ECR belongs to the user's default institution
            $subject = $subjectEcr->subject;
            if ($subject->institution_id !== $defaultInstitution->institution_id) {
                return response()->json([
                    'success' => false,
                    'message' => 'Subject ECR not found or access denied'
                ], 404);
            }

            $validated = $request->validate([
                'subject_id' => 'sometimes|required|exists:subjects,id',
                'title' => 'sometimes|required|string|max:255',
                'percentage' => 'sometimes|required|numeric|min:0|max:100',
            ]);

            // If subject_id is being updated, verify the new subject belongs to the user's default institution
            if (isset($validated['subject_id'])) {
                $newSubject = \App\Models\Subject::where('id', $validated['subject_id'])
                    ->where('institution_id', $defaultInstitution->institution_id)
                    ->first();

                if (!$newSubject) {
                    return response()->json([
                        'success' => false,
                        'message' => 'Subject not found or access denied'
                    ], 404);
                }
            }

            $subjectEcr->update($validated);

            return response()->json([
                'success' => true,
                'message' => 'Subject ECR updated successfully',
                'data' => $subjectEcr->load(['subject'])
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
                'message' => 'Failed to update subject ECR',
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

            $subjectEcr = SubjectEcr::whereHas('subject', function ($q) use ($defaultInstitution) {
                $q->where('institution_id', $defaultInstitution->institution_id);
            })->findOrFail($id);

            $subjectEcr->delete();

            return response()->json([
                'success' => true,
                'message' => 'Subject ECR deleted successfully'
            ]);

        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to delete subject ECR',
                'error' => $e->getMessage()
            ], 500);
        }
    }
}