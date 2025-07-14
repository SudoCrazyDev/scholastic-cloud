<?php

namespace App\Http\Controllers;

use App\Models\StudentEcrItemScore;
use App\Models\Student;
use App\Models\SubjectEcrItem;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

class StudentEcrItemScoreController extends Controller
{
    /**
     * Display a listing of the student ECR item scores with pagination and search.
     */
    public function index(Request $request): JsonResponse
    {
        $perPage = $request->get('per_page', 15);
        $query = StudentEcrItemScore::with(['student', 'subjectEcrItem']);

        // Get the authenticated user's default institution
        $user = $request->user();
        $defaultInstitutionId = $user->getDefaultInstitutionId();
        
        // If no default institution, try to get the first available institution
        if (!$defaultInstitutionId) {
            $firstUserInstitution = $user->userInstitutions()->first();
            if ($firstUserInstitution) {
                $defaultInstitutionId = $firstUserInstitution->institution_id;
            }
        }
        
        if (!$defaultInstitutionId) {
            return response()->json([
                'success' => false, 
                'error' => 'User does not have any institution assigned'
            ], 400);
        }

        // Filter scores by students in the user's institution
        $query->whereHas('student.studentInstitutions', function ($q) use ($defaultInstitutionId) {
            $q->where('institution_id', $defaultInstitutionId);
        });

        // Filter by student_id if provided
        if ($request->filled('student_id')) {
            $query->where('student_id', $request->student_id);
        }

        // Filter by subject_ecr_item_id if provided
        if ($request->filled('subject_ecr_item_id')) {
            $query->where('subject_ecr_item_id', $request->subject_ecr_item_id);
        }

        // Filter by score range if provided
        if ($request->filled('min_score')) {
            $query->where('score', '>=', $request->min_score);
        }
        if ($request->filled('max_score')) {
            $query->where('score', '<=', $request->max_score);
        }

        $scores = $query->orderBy('created_at', 'desc')->paginate($perPage);

        return response()->json([
            'success' => true,
            'data' => $scores->items(),
            'pagination' => [
                'current_page' => $scores->currentPage(),
                'last_page' => $scores->lastPage(),
                'per_page' => $scores->perPage(),
                'total' => $scores->total(),
                'from' => $scores->firstItem(),
                'to' => $scores->lastItem(),
            ]
        ]);
    }

    /**
     * Show the form for creating a new resource.
     */
    public function create()
    {
        //
    }

    /**
     * Store a newly created student ECR item score in storage.
     */
    public function store(Request $request): JsonResponse
    {
        // Get the authenticated user
        $user = $request->user();
        
        // Get the user's default institution
        $defaultInstitutionId = $user->getDefaultInstitutionId();
        
        // If no default institution, try to get the first available institution
        if (!$defaultInstitutionId) {
            $firstUserInstitution = $user->userInstitutions()->first();
            if ($firstUserInstitution) {
                $defaultInstitutionId = $firstUserInstitution->institution_id;
            }
        }
        
        if (!$defaultInstitutionId) {
            return response()->json([
                'success' => false, 
                'error' => 'User does not have any institution assigned'
            ], 400);
        }

        $validated = $request->validate([
            'student_id' => 'required|uuid|exists:students,id',
            'subject_ecr_item_id' => 'required|uuid|exists:subject_ecr_items,id',
            'score' => 'required|numeric|min:0|max:100',
        ]);

        // Verify that the student belongs to the user's institution
        $student = Student::whereHas('studentInstitutions', function ($q) use ($defaultInstitutionId) {
            $q->where('institution_id', $defaultInstitutionId);
        })->find($validated['student_id']);

        if (!$student) {
            return response()->json([
                'success' => false, 
                'error' => 'Student not found in your institution'
            ], 404);
        }

        DB::beginTransaction();
        try {
            // Check if a score already exists for this student and item
            $existingScore = StudentEcrItemScore::where('student_id', $validated['student_id'])
                ->where('subject_ecr_item_id', $validated['subject_ecr_item_id'])
                ->first();

            if ($existingScore) {
                return response()->json([
                    'success' => false, 
                    'error' => 'A score already exists for this student and item'
                ], 422);
            }

            $score = StudentEcrItemScore::create($validated);

            DB::commit();
            return response()->json([
                'success' => true, 
                'data' => $score->load(['student', 'subjectEcrItem'])
            ], 201);
        } catch (ValidationException $e) {
            DB::rollBack();
            return response()->json(['success' => false, 'errors' => $e->errors()], 422);
        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Error creating student ECR item score: ' . $e->getMessage());
            return response()->json(['success' => false, 'error' => 'Failed to create score'], 500);
        }
    }

    /**
     * Display the specified student ECR item score.
     */
    public function show(Request $request, $id): JsonResponse
    {
        // Get the authenticated user's institution
        $user = $request->user();
        $defaultInstitutionId = $user->getDefaultInstitutionId();

        // If no default institution, try to get the first available institution
        if (!$defaultInstitutionId) {
            $firstUserInstitution = $user->userInstitutions()->first();
            if ($firstUserInstitution) {
                $defaultInstitutionId = $firstUserInstitution->institution_id;
            }
        }
        
        if (!$defaultInstitutionId) {
            return response()->json([
                'success' => false, 
                'error' => 'User does not have any institution assigned'
            ], 400);
        }

        $score = StudentEcrItemScore::with(['student', 'subjectEcrItem'])
            ->whereHas('student.studentInstitutions', function ($q) use ($defaultInstitutionId) {
                $q->where('institution_id', $defaultInstitutionId);
            })
            ->find($id);
            
        if (!$score) {
            return response()->json(['success' => false, 'message' => 'Score not found'], 404);
        }
        return response()->json(['success' => true, 'data' => $score]);
    }

    /**
     * Show the form for editing the specified resource.
     */
    public function edit(string $id)
    {
        //
    }

    /**
     * Update the specified student ECR item score in storage.
     */
    public function update(Request $request, $id): JsonResponse
    {
        // Get the authenticated user's institution
        $user = $request->user();
        $defaultInstitutionId = $user->getDefaultInstitutionId();
        
        // If no default institution, try to get the first available institution
        if (!$defaultInstitutionId) {
            $firstUserInstitution = $user->userInstitutions()->first();
            if ($firstUserInstitution) {
                $defaultInstitutionId = $firstUserInstitution->institution_id;
            }
        }
        
        if (!$defaultInstitutionId) {
            return response()->json([
                'success' => false, 
                'error' => 'User does not have any institution assigned'
            ], 400);
        }

        $score = StudentEcrItemScore::whereHas('student.studentInstitutions', function ($q) use ($defaultInstitutionId) {
            $q->where('institution_id', $defaultInstitutionId);
        })->find($id);

        if (!$score) {
            return response()->json(['success' => false, 'message' => 'Score not found'], 404);
        }

        $validated = $request->validate([
            'score' => 'required|numeric|min:0|max:100',
        ]);

        DB::beginTransaction();
        try {
            $score->update($validated);

            DB::commit();
            return response()->json([
                'success' => true, 
                'data' => $score->load(['student', 'subjectEcrItem'])
            ]);
        } catch (ValidationException $e) {
            DB::rollBack();
            return response()->json(['success' => false, 'errors' => $e->errors()], 422);
        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Error updating student ECR item score: ' . $e->getMessage());
            return response()->json(['success' => false, 'error' => 'Failed to update score'], 500);
        }
    }

    /**
     * Remove the specified student ECR item score from storage.
     */
    public function destroy(Request $request, $id): JsonResponse
    {
        // Get the authenticated user's institution
        $user = $request->user();
        $defaultInstitutionId = $user->getDefaultInstitutionId();
        
        // If no default institution, try to get the first available institution
        if (!$defaultInstitutionId) {
            $firstUserInstitution = $user->userInstitutions()->first();
            if ($firstUserInstitution) {
                $defaultInstitutionId = $firstUserInstitution->institution_id;
            }
        }
        
        if (!$defaultInstitutionId) {
            return response()->json([
                'success' => false, 
                'error' => 'User does not have any institution assigned'
            ], 400);
        }

        $score = StudentEcrItemScore::whereHas('student.studentInstitutions', function ($q) use ($defaultInstitutionId) {
            $q->where('institution_id', $defaultInstitutionId);
        })->find($id);

        if (!$score) {
            return response()->json(['success' => false, 'message' => 'Score not found'], 404);
        }

        DB::beginTransaction();
        try {
            $score->delete();

            DB::commit();
            return response()->json(['success' => true, 'message' => 'Score deleted successfully']);
        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Error deleting student ECR item score: ' . $e->getMessage());
            return response()->json(['success' => false, 'error' => 'Failed to delete score'], 500);
        }
    }
}
