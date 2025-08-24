<?php

namespace App\Http\Controllers;

use App\Models\StudentRunningGrade;
use App\Services\ParentSubjectGradeService;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class StudentRunningGradeController extends Controller
{
    protected $parentSubjectGradeService;

    public function __construct(ParentSubjectGradeService $parentSubjectGradeService)
    {
        $this->parentSubjectGradeService = $parentSubjectGradeService;
    }

    /**
     * Display a listing of the resource.
     */
    public function index(Request $request): JsonResponse
    {
        $request->validate([
            'subject_id' => 'sometimes|string|exists:subjects,id',
            'class_section_id' => 'sometimes|string|exists:class_sections,id',
            'student_id' => 'sometimes|string|exists:students,id',
        ]);

        $query = StudentRunningGrade::with(['student', 'subject']);

        // Filter by subject_id if provided
        if ($request->filled('subject_id')) {
            $query->where('subject_id', $request->subject_id);
        }

        // Filter by student_id if provided
        if ($request->filled('student_id')) {
            $query->where('student_id', $request->student_id);
        }

        // If class_section_id is provided, filter by students in that class section
        // if ($request->filled('class_section_id')) {
        //     $query->whereHas('student.studentSections', function ($q) use ($request) {
        //         $q->where('section_id', $request->class_section_id);
        //     });
        // }

        $runningGrades = $query->get();

        return response()->json([
            'success' => true,
            'data' => $runningGrades,
        ]);
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'student_id' => 'required|string|exists:students,id',
            'subject_id' => 'required|string|exists:subjects,id',
            'quarter' => 'required|integer|between:1,4',
            'grade' => 'required|numeric|between:0,100',
            'final_grade' => 'sometimes|numeric|between:0,100',
            'academic_year' => 'required|string',
        ]);

        $runningGrade = StudentRunningGrade::create($validated);

        // If this is a final grade, calculate parent subject grades
        if (isset($validated['final_grade'])) {
            $this->parentSubjectGradeService->calculateParentSubjectGrades(
                $validated['student_id'],
                $validated['subject_id'],
                $validated['quarter'],
                $validated['academic_year']
            );
        }

        return response()->json([
            'success' => true,
            'data' => $runningGrade->load(['student', 'subject']),
            'message' => 'Running grade created successfully',
        ], 201);
    }

    /**
     * Display the specified resource.
     */
    public function show(StudentRunningGrade $studentRunningGrade): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data' => $studentRunningGrade->load(['student', 'subject']),
        ]);
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, StudentRunningGrade $studentRunningGrade): JsonResponse
    {
        $validated = $request->validate([
            'student_id' => 'sometimes|required|string|exists:students,id',
            'subject_id' => 'sometimes|required|string|exists:subjects,id',
            'quarter' => 'sometimes|required|integer|between:1,4',
            'grade' => 'sometimes|required|numeric|between:0,100',
            'final_grade' => 'sometimes|numeric|between:0,100',
            'academic_year' => 'sometimes|required|string',
        ]);

        $studentRunningGrade->update($validated);

        // If final grade was updated, calculate parent subject grades
        if (isset($validated['final_grade'])) {
            $this->parentSubjectGradeService->calculateParentSubjectGrades(
                $studentRunningGrade->student_id,
                $studentRunningGrade->subject_id,
                $studentRunningGrade->quarter,
                $studentRunningGrade->academic_year
            );
        }

        return response()->json([
            'success' => true,
            'data' => $studentRunningGrade->load(['student', 'subject']),
            'message' => 'Running grade updated successfully',
        ]);
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(StudentRunningGrade $studentRunningGrade): JsonResponse
    {
        $studentRunningGrade->delete();

        return response()->json([
            'success' => true,
            'message' => 'Running grade deleted successfully',
        ]);
    }

    /**
     * Upsert final grade for a student (create if not exists, update if exists)
     */
    public function upsertFinalGrade(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'student_id' => 'required|string|exists:students,id',
            'subject_id' => 'required|string|exists:subjects,id',
            'quarter' => 'required|integer|between:1,4',
            'final_grade' => 'required|numeric|between:0,100',
            'academic_year' => 'required|string',
        ]);

        try {
            // Check if a running grade already exists for this student, subject, quarter, and academic year
            $existingGrade = StudentRunningGrade::where([
                'student_id' => $validated['student_id'],
                'subject_id' => $validated['subject_id'],
                'quarter' => $validated['quarter'],
                'academic_year' => $validated['academic_year'],
            ])->first();

            if ($existingGrade) {
                // Update existing grade
                $existingGrade->update([
                    'final_grade' => $validated['final_grade']
                ]);
                
                $runningGrade = $existingGrade->fresh()->load(['student', 'subject']);
                
                // Calculate parent subject grades after updating final grade
                $this->parentSubjectGradeService->calculateParentSubjectGrades(
                    $validated['student_id'],
                    $validated['subject_id'],
                    $validated['quarter'],
                    $validated['academic_year']
                );
                
                return response()->json([
                    'success' => true,
                    'data' => $runningGrade,
                    'message' => 'Final grade updated successfully',
                ]);
            } else {
                // Create new grade with default calculated grade
                $runningGrade = StudentRunningGrade::create([
                    'student_id' => $validated['student_id'],
                    'subject_id' => $validated['subject_id'],
                    'quarter' => $validated['quarter'],
                    'grade' => 0, // Default calculated grade
                    'final_grade' => $validated['final_grade'],
                    'academic_year' => $validated['academic_year'],
                ]);

                // Calculate parent subject grades after creating final grade
                $this->parentSubjectGradeService->calculateParentSubjectGrades(
                    $validated['student_id'],
                    $validated['subject_id'],
                    $validated['quarter'],
                    $validated['academic_year']
                );

                return response()->json([
                    'success' => true,
                    'data' => $runningGrade->load(['student', 'subject']),
                    'message' => 'Final grade created successfully',
                ], 201);
            }
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to save final grade',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Bulk upsert final grades for multiple students
     */
    public function bulkUpsertFinalGrades(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'grades' => 'required|array|min:1|max:100',
            'grades.*.student_id' => 'required|string|exists:students,id',
            'grades.*.subject_id' => 'required|string|exists:subjects,id',
            'grades.*.quarter' => 'required|integer|between:1,4',
            'grades.*.final_grade' => 'required|numeric|between:0,100',
            'grades.*.academic_year' => 'required|string',
            'grades.*.grade_id' => 'sometimes|string|exists:student_running_grades,id',
        ]);

        DB::beginTransaction();
        try {
            $results = [];
            $errors = [];
            $updateCount = 0;
            $createCount = 0;

            foreach ($validated['grades'] as $index => $gradeData) {
                try {
                    $studentId = $gradeData['student_id'];
                    $subjectId = $gradeData['subject_id'];
                    $quarter = $gradeData['quarter'];
                    $finalGrade = $gradeData['final_grade'];
                    $academicYear = $gradeData['academic_year'];
                    $gradeId = $gradeData['grade_id'] ?? null;

                    // Check if a running grade already exists
                    $existingGrade = null;
                    if ($gradeId) {
                        $existingGrade = StudentRunningGrade::find($gradeId);
                        
                        // Verify the grade belongs to the correct student/subject/quarter
                        if ($existingGrade && 
                            ($existingGrade->student_id !== $studentId || 
                             $existingGrade->subject_id !== $subjectId || 
                             $existingGrade->quarter !== $quarter || 
                             $existingGrade->academic_year !== $academicYear)) {
                            $existingGrade = null;
                        }
                    } else {
                        $existingGrade = StudentRunningGrade::where([
                            'student_id' => $studentId,
                            'subject_id' => $subjectId,
                            'quarter' => $quarter,
                            'academic_year' => $academicYear,
                        ])->first();
                    }

                    if ($existingGrade) {
                        // Update existing grade
                        $existingGrade->update(['final_grade' => $finalGrade]);
                        $runningGrade = $existingGrade->fresh()->load(['student', 'subject']);
                        $updateCount++;
                        
                        // Calculate parent subject grades
                        $this->parentSubjectGradeService->calculateParentSubjectGrades(
                            $studentId,
                            $subjectId,
                            $quarter,
                            $academicYear
                        );
                        
                        $results[] = [
                            'index' => $index,
                            'action' => 'updated',
                            'data' => $runningGrade,
                            'success' => true
                        ];
                    } else {
                        // Create new grade
                        $runningGrade = StudentRunningGrade::create([
                            'student_id' => $studentId,
                            'subject_id' => $subjectId,
                            'quarter' => $quarter,
                            'grade' => 0,
                            'final_grade' => $finalGrade,
                            'academic_year' => $academicYear,
                        ]);
                        
                        $runningGrade->load(['student', 'subject']);
                        $createCount++;
                        
                        // Calculate parent subject grades
                        $this->parentSubjectGradeService->calculateParentSubjectGrades(
                            $studentId,
                            $subjectId,
                            $quarter,
                            $academicYear
                        );
                        
                        $results[] = [
                            'index' => $index,
                            'action' => 'created',
                            'data' => $runningGrade,
                            'success' => true
                        ];
                    }
                    
                } catch (\Exception $e) {
                    $errors[] = [
                        'index' => $index,
                        'error' => $e->getMessage(),
                        'data' => $gradeData
                    ];
                    
                    $results[] = [
                        'index' => $index,
                        'action' => 'failed',
                        'error' => $e->getMessage(),
                        'success' => false
                    ];
                }
            }

            if (!empty($errors)) {
                DB::rollBack();
                
                return response()->json([
                    'success' => false,
                    'message' => 'Some grades failed to update',
                    'data' => [
                        'total_requested' => count($validated['grades']),
                        'successful' => count($validated['grades']) - count($errors),
                        'failed' => count($errors),
                        'results' => $results,
                        'errors' => $errors
                    ]
                ], 422);
            }

            DB::commit();
            
            return response()->json([
                'success' => true,
                'message' => 'Bulk grades updated successfully',
                'data' => [
                    'total_processed' => count($validated['grades']),
                    'created' => $createCount,
                    'updated' => $updateCount,
                    'results' => $results
                ]
            ]);

        } catch (\Exception $e) {
            DB::rollBack();
            
            return response()->json([
                'success' => false,
                'error' => 'Failed to process bulk grades: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * Manually recalculate all parent subject grades for a specific student, quarter, and academic year
     */
    public function recalculateParentSubjectGrades(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'student_id' => 'required|string|exists:students,id',
            'quarter' => 'required|integer|between:1,4',
            'academic_year' => 'required|string',
        ]);

        try {
            $this->parentSubjectGradeService->recalculateAllParentSubjectGrades(
                $validated['student_id'],
                $validated['quarter'],
                $validated['academic_year']
            );

            return response()->json([
                'success' => true,
                'message' => 'Parent subject grades recalculated successfully',
            ]);

        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'error' => 'Failed to recalculate parent subject grades'
            ], 500);
        }
    }
} 