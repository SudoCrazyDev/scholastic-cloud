<?php

namespace App\Http\Controllers;

use App\Models\StudentEcrItemScore;
use App\Models\Student;
use App\Models\SubjectEcrItem;
use App\Services\ParentSubjectGradeService;
use App\Services\RunningGradeRecalcService;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

class StudentEcrItemScoreController extends Controller
{
    protected ParentSubjectGradeService $parentSubjectGradeService;
    protected RunningGradeRecalcService $runningGradeRecalcService;

    public function __construct(ParentSubjectGradeService $parentSubjectGradeService, RunningGradeRecalcService $runningGradeRecalcService)
    {
        $this->parentSubjectGradeService = $parentSubjectGradeService;
        $this->runningGradeRecalcService = $runningGradeRecalcService;
    }

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
                // Update existing score instead of returning error
                $existingScore->update(['score' => $validated['score']]);
                $score = $existingScore->fresh();
            } else {
                // Create new score
                $score = StudentEcrItemScore::create($validated);
            }

            // --- K-12 Running Grade Calculation ---
            $this->runningGradeRecalcService->recalculate($validated['student_id'], $validated['subject_ecr_item_id']);
            // --- End K-12 Running Grade Calculation ---

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

            // --- K-12 Running Grade Calculation ---
            $this->runningGradeRecalcService->recalculate($score->student_id, $score->subject_ecr_item_id);
            // --- End K-12 Running Grade Calculation ---

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

    /**
     * Get scores by student and subject
     */
    public function getByStudentAndSubject(Request $request): JsonResponse
    {
        $request->validate([
            'student_id' => 'required|string|exists:students,id',
            'subject_id' => 'required|string|exists:subjects,id',
        ]);

        // Get the authenticated user's default institution
        $user = $request->user();
        $defaultInstitutionId = $user->getDefaultInstitutionId();
        
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

        // Get all subject ECR items for the subject
        $subjectEcrItems = \App\Models\SubjectEcrItem::whereHas('subjectEcr', function ($q) use ($request) {
            $q->where('subject_id', $request->subject_id);
        })->get();

        $subjectEcrItemIds = $subjectEcrItems->pluck('id');

        // Get all scores for this student and these items
        $scores = StudentEcrItemScore::where('student_id', $request->student_id)
            ->whereIn('subject_ecr_item_id', $subjectEcrItemIds)
            ->with([
                'student:id,lrn,first_name,middle_name,last_name,ext_name,gender',
                'subjectEcrItem:id,title,score,subject_ecr_id'
            ])
            ->get();

        return response()->json([
            'success' => true,
            'data' => $scores
        ]);
    }

    /**
     * Get scores for a specific subject and class section
     */
    public function getScoresBySubjectAndSection(Request $request): JsonResponse
    {
        try {
            $validated = $request->validate([
                'subject_id' => 'required|uuid',
                'class_section_id' => 'required|uuid',
            ]);

            // Get the authenticated user's default institution
            $user = $request->user();
            $defaultInstitutionId = $user->getDefaultInstitutionId();
            
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

            // Check if subject exists and belongs to user's institution
            $subject = \App\Models\Subject::where('id', $validated['subject_id'])
                ->where('institution_id', $defaultInstitutionId)
                ->first();

            if (!$subject) {
                return response()->json([
                    'success' => false,
                    'error' => 'Subject not found or access denied'
                ], 404);
            }

            // Check if class section exists and belongs to user's institution
            $classSection = \App\Models\ClassSection::where('id', $validated['class_section_id'])
                ->where('institution_id', $defaultInstitutionId)
                ->first();

            if (!$classSection) {
                return response()->json([
                    'success' => false,
                    'error' => 'Class section not found or access denied'
                ], 404);
            }

            // Get all subject ECR items for the subject
            $subjectEcrItems = \App\Models\SubjectEcrItem::whereHas('subjectEcr', function ($q) use ($validated) {
                $q->where('subject_id', $validated['subject_id']);
            })->get();

            $subjectEcrItemIds = $subjectEcrItems->pluck('id');

            // Get all students in the class section
            $students = \App\Models\Student::whereHas('studentSections', function ($q) use ($validated) {
                $q->where('section_id', $validated['class_section_id']);
            })->whereHas('studentInstitutions', function ($q) use ($defaultInstitutionId) {
                $q->where('institution_id', $defaultInstitutionId);
            })->get();

            $studentIds = $students->pluck('id');

            // Get all scores for these students and items
            $scores = StudentEcrItemScore::whereIn('student_id', $studentIds)
                ->whereIn('subject_ecr_item_id', $subjectEcrItemIds)
                ->with([
                    'student:id,lrn,first_name,middle_name,last_name,ext_name,gender',
                    'subjectEcrItem:id,title,score,subject_ecr_id'
                ])
                ->get();

            return response()->json([
                'success' => true,
                'data' => $scores
            ]);

        } catch (\Illuminate\Validation\ValidationException $e) {
            return response()->json([
                'success' => false,
                'error' => 'Invalid parameters provided',
                'details' => $e->errors()
            ], 422);
        } catch (\Exception $e) {
            Log::error('Error fetching scores by subject and section: ' . $e->getMessage());
            return response()->json(['success' => false, 'error' => 'Failed to fetch scores'], 500);
        }
    }
}
