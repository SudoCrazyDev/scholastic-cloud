<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class DesktopController extends Controller
{
    /**
     * Get current user's default institution for desktop app
     * Returns full institution data needed for offline use
     */
    public function getInstitution(Request $request): JsonResponse
    {
        try {
            $user = $request->user();
            
            if (!$user) {
                return response()->json([
                    'success' => false,
                    'message' => 'User not found'
                ], 404);
            }

            // Get the default user institution
            $defaultUserInstitution = $user->userInstitutions()
                ->where('is_default', true)
                ->with('institution.subscription')
                ->first();

            if (!$defaultUserInstitution || !$defaultUserInstitution->institution) {
                return response()->json([
                    'success' => false,
                    'message' => 'No default institution found for this user'
                ], 404);
            }

            return response()->json([
                'success' => true,
                'data' => $defaultUserInstitution->institution
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to retrieve institution',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Sync all necessary data for desktop app offline use
     * This endpoint can be expanded to return multiple data types
     * 
     * @return JsonResponse
     */
    public function sync(Request $request): JsonResponse
    {
        try {
            $user = $request->user();
            
            if (!$user) {
                return response()->json([
                    'success' => false,
                    'message' => 'User not found'
                ], 404);
            }

            // Load user with relationships
            $user->load(['userInstitutions.role', 'userInstitutions.institution.subscription', 'directRole']);

            // Get default institution
            $defaultUserInstitution = $user->userInstitutions()
                ->where('is_default', true)
                ->with('institution.subscription')
                ->first();

            $institution = $defaultUserInstitution?->institution;

            // Build response with all necessary data
            $data = [
                'user' => [
                    'id' => $user->id,
                    'first_name' => $user->first_name,
                    'middle_name' => $user->middle_name,
                    'last_name' => $user->last_name,
                    'ext_name' => $user->ext_name,
                    'email' => $user->email,
                    'gender' => $user->gender,
                    'birthdate' => $user->birthdate,
                    'is_new' => $user->is_new,
                    'created_at' => $user->created_at,
                    'updated_at' => $user->updated_at,
                ],
                'institution' => $institution ? [
                    'id' => $institution->id,
                    'title' => $institution->title,
                    'abbr' => $institution->abbr,
                    'division' => $institution->division,
                    'region' => $institution->region,
                    'gov_id' => $institution->gov_id,
                    'logo' => $institution->logo,
                    'subscription_id' => $institution->subscription_id,
                    'created_at' => $institution->created_at,
                    'updated_at' => $institution->updated_at,
                ] : null,
            ];

            return response()->json([
                'success' => true,
                'data' => $data
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to sync data',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Get current user's class sections (where adviser matches user id)
     * Returns class sections for desktop app offline use
     */
    public function getClassSections(Request $request): JsonResponse
    {
        try {
            $user = $request->user();

            if (!$user) {
                return response()->json([
                    'success' => false,
                    'message' => 'User not found'
                ], 404);
            }

            // Get class sections where adviser matches the user id
            $classSections = \App\Models\ClassSection::where('adviser', $user->id)
                ->whereNull('deleted_at')
                ->with(['institution'])
                ->get();

            return response()->json([
                'success' => true,
                'data' => $classSections
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to retrieve class sections',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Get current user's assigned loads (subjects where adviser matches user id)
     * Returns subjects with classSection and classSection.adviser relationships loaded
     * for cascading save to SQLite
     */
    public function getAssignedLoads(Request $request): JsonResponse
    {
        try {
            $user = $request->user();

            if (!$user) {
                return response()->json([
                    'success' => false,
                    'message' => 'User not found'
                ], 404);
            }

            // Get subjects where adviser matches the user id
            // Load classSection and classSection.adviser relationships
            $subjects = \App\Models\Subject::where('adviser', $user->id)
                ->with([
                    'classSection' => function ($query) {
                        $query->whereNull('deleted_at');
                    },
                    'classSection.adviser' => function ($query) {
                        // Load the adviser user data
                    },
                    'institution'
                ])
                ->get();

            return response()->json([
                'success' => true,
                'data' => $subjects
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to retrieve assigned loads',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Get students for a specific class section
     * Returns students with their student_section pivot data
     */
    public function getStudentsByClassSection(Request $request, $classSectionId): JsonResponse
    {
        try {
            $user = $request->user();

            if (!$user) {
                return response()->json([
                    'success' => false,
                    'message' => 'User not found'
                ], 404);
            }

            // Verify the class section exists and user has access
            $classSection = \App\Models\ClassSection::where('id', $classSectionId)
                ->whereNull('deleted_at')
                ->first();

            if (!$classSection) {
                return response()->json([
                    'success' => false,
                    'message' => 'Class section not found'
                ], 404);
            }

            // Get students for this class section with their student_section data
            $studentSections = \App\Models\StudentSection::where('section_id', $classSectionId)
                ->where('is_active', true)
                ->with('student')
                ->get();

            $students = $studentSections->map(function ($studentSection) {
                $student = $studentSection->student;
                if ($student) {
                    $student->student_section = [
                        'id' => $studentSection->id,
                        'academic_year' => $studentSection->academic_year,
                        'is_active' => $studentSection->is_active,
                        'is_promoted' => $studentSection->is_promoted,
                    ];
                }
                return $student;
            })->filter();

            return response()->json([
                'success' => true,
                'data' => $students
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to retrieve students',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Get ECR data for user's subjects
     * Returns subjects_ecr, subject_ecr_items, and student_ecr_item_scores
     */
    public function getEcrData(Request $request): JsonResponse
    {
        try {
            $user = $request->user();

            if (!$user) {
                return response()->json([
                    'success' => false,
                    'message' => 'User not found'
                ], 404);
            }

            // Get all subjects where user is adviser
            $subjects = \App\Models\Subject::where('adviser', $user->id)
                ->get();

            if ($subjects->isEmpty()) {
                return response()->json([
                    'success' => true,
                    'data' => []
                ]);
            }

            // Load ECR items and scores separately to avoid N+1
            $subjectIds = $subjects->pluck('id')->toArray();
            $subjectEcrsCollection = \App\Models\SubjectEcr::whereIn('subject_id', $subjectIds)
                ->get();

            $subjectEcrIds = $subjectEcrsCollection->pluck('id')->toArray();
            $subjectEcrItemsCollection = collect([]);
            if (!empty($subjectEcrIds)) {
                $subjectEcrItemsCollection = \App\Models\SubjectEcrItem::whereIn('subject_ecr_id', $subjectEcrIds)
                    ->get();
            }

            $subjectEcrItemIds = $subjectEcrItemsCollection->pluck('id')->toArray();
            $studentScoresCollection = collect([]);
            if (!empty($subjectEcrItemIds)) {
                $studentScoresCollection = \App\Models\StudentEcrItemScore::whereIn('subject_ecr_item_id', $subjectEcrItemIds)
                    ->get();
            }

            // Build response with nested structure
            $ecrData = [];
            foreach ($subjects as $subject) {
                $subjectEcrs = [];
                $subjectEcrList = $subjectEcrsCollection->where('subject_id', $subject->id);
                foreach ($subjectEcrList as $ecr) {
                    $ecrItems = [];
                    $items = $subjectEcrItemsCollection->where('subject_ecr_id', $ecr->id);
                    foreach ($items as $item) {
                        $itemScores = [];
                        $scores = $studentScoresCollection->where('subject_ecr_item_id', $item->id);
                        foreach ($scores as $score) {
                            $itemScores[] = [
                                'id' => $score->id,
                                'student_id' => $score->student_id,
                                'subject_ecr_item_id' => $score->subject_ecr_item_id,
                                'score' => $score->score,
                                'created_at' => $score->created_at,
                                'updated_at' => $score->updated_at,
                            ];
                        }
                        $ecrItems[] = [
                            'id' => $item->id,
                            'subject_ecr_id' => $item->subject_ecr_id,
                            'type' => $item->type,
                            'title' => $item->title,
                            'description' => $item->description,
                            'quarter' => $item->quarter,
                            'academic_year' => $item->academic_year,
                            'score' => $item->score,
                            'created_at' => $item->created_at,
                            'updated_at' => $item->updated_at,
                            'student_scores' => $itemScores,
                        ];
                    }
                    $subjectEcrs[] = [
                        'id' => $ecr->id,
                        'subject_id' => $ecr->subject_id,
                        'title' => $ecr->title,
                        'percentage' => $ecr->percentage,
                        'created_at' => $ecr->created_at,
                        'updated_at' => $ecr->updated_at,
                        'items' => $ecrItems,
                    ];
                }
                $ecrData[] = [
                    'subject_id' => $subject->id,
                    'subject_ecrs' => $subjectEcrs,
                ];
            }

            return response()->json([
                'success' => true,
                'data' => $ecrData
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to retrieve ECR data',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Get student running grades for user's subjects
     */
    public function getStudentRunningGrades(Request $request): JsonResponse
    {
        try {
            $user = $request->user();

            if (!$user) {
                return response()->json([
                    'success' => false,
                    'message' => 'User not found'
                ], 404);
            }

            // Get all subjects where user is adviser
            $subjectIds = \App\Models\Subject::where('adviser', $user->id)
                ->pluck('id')
                ->toArray();

            if (empty($subjectIds)) {
                return response()->json([
                    'success' => true,
                    'data' => []
                ]);
            }

            // Get running grades for these subjects
            $runningGrades = \App\Models\StudentRunningGrade::whereIn('subject_id', $subjectIds)
                ->whereNull('deleted_at')
                ->with(['student', 'subject'])
                ->get();

            return response()->json([
                'success' => true,
                'data' => $runningGrades
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to retrieve student running grades',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Download running grades for a specific subject (for desktop sync)
     */
    public function downloadRunningGrades(Request $request): JsonResponse
    {
        try {
            $user = $request->user();

            if (!$user) {
                return response()->json([
                    'success' => false,
                    'message' => 'User not found'
                ], 404);
            }

            $subjectId = $request->query('subject_id');
            $classSectionId = $request->query('class_section_id');

            if (!$subjectId) {
                return response()->json([
                    'success' => false,
                    'message' => 'subject_id is required'
                ], 400);
            }

            // Verify user has access to this subject
            $subject = \App\Models\Subject::where('id', $subjectId)
                ->where('adviser', $user->id)
                ->first();

            if (!$subject) {
                return response()->json([
                    'success' => false,
                    'message' => 'Subject not found or access denied'
                ], 403);
            }

            // Get running grades for this subject
            $query = \App\Models\StudentRunningGrade::where('subject_id', $subjectId)
                ->whereNull('deleted_at');

            // If class_section_id provided, filter by it
            if ($classSectionId) {
                $query->whereHas('student.studentSections', function ($q) use ($classSectionId) {
                    $q->where('section_id', $classSectionId);
                });
            }

            $runningGrades = $query->get();

            return response()->json([
                'success' => true,
                'data' => $runningGrades,
                'timestamp' => now()->toISOString()
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to download running grades',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Upload running grades from desktop app (batch sync)
     */
    public function uploadRunningGrades(Request $request): JsonResponse
    {
        try {
            $user = $request->user();

            if (!$user) {
                return response()->json([
                    'success' => false,
                    'message' => 'User not found'
                ], 404);
            }

            $grades = $request->input('grades', []);

            if (empty($grades)) {
                return response()->json([
                    'success' => false,
                    'message' => 'No grades provided'
                ], 400);
            }

            $synced = [];
            $failed = [];
            $conflicts = [];

            foreach ($grades as $gradeData) {
                try {
                    // Verify user has access to this subject
                    $subject = \App\Models\Subject::where('id', $gradeData['subject_id'])
                        ->where('adviser', $user->id)
                        ->first();

                    if (!$subject) {
                        $failed[] = [
                            'data' => $gradeData,
                            'error' => 'Subject not found or access denied'
                        ];
                        continue;
                    }

                    // Check if grade exists
                    $existingGrade = \App\Models\StudentRunningGrade::find($gradeData['id']);

                    if ($existingGrade) {
                        // Conflict detection: compare updated_at timestamps
                        $localUpdatedAt = new \DateTime($gradeData['updated_at']);
                        $serverUpdatedAt = new \DateTime($existingGrade->updated_at);

                        if ($serverUpdatedAt > $localUpdatedAt) {
                            // Server is newer - conflict
                            $conflicts[] = [
                                'data' => $gradeData,
                                'server_data' => $existingGrade,
                                'message' => 'Server version is newer'
                            ];
                            continue;
                        }

                        // Local is newer or equal - update
                        $existingGrade->final_grade = $gradeData['final_grade'] ?? $existingGrade->final_grade;
                        $existingGrade->note = $gradeData['note'] ?? $existingGrade->note;
                        $existingGrade->updated_at = now();
                        $existingGrade->save();

                        $synced[] = $gradeData['id'];
                    } else {
                        // Create new grade
                        $newGrade = new \App\Models\StudentRunningGrade();
                        $newGrade->id = $gradeData['id'];
                        $newGrade->student_id = $gradeData['student_id'];
                        $newGrade->subject_id = $gradeData['subject_id'];
                        $newGrade->quarter = $gradeData['quarter'];
                        $newGrade->grade = $gradeData['grade'] ?? null;
                        $newGrade->final_grade = $gradeData['final_grade'] ?? null;
                        $newGrade->academic_year = $gradeData['academic_year'] ?? '2025-2026';
                        $newGrade->note = $gradeData['note'] ?? null;
                        $newGrade->save();

                        $synced[] = $gradeData['id'];
                    }
                } catch (\Exception $e) {
                    $failed[] = [
                        'data' => $gradeData,
                        'error' => $e->getMessage()
                    ];
                }
            }

            return response()->json([
                'success' => true,
                'synced' => $synced,
                'failed' => $failed,
                'conflicts' => $conflicts,
                'summary' => [
                    'total' => count($grades),
                    'synced_count' => count($synced),
                    'failed_count' => count($failed),
                    'conflict_count' => count($conflicts)
                ]
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to upload running grades',
                'error' => $e->getMessage()
            ], 500);
        }
    }
}

