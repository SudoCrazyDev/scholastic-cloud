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
}

