<?php

namespace App\Http\Controllers;

use App\Models\ClassSection;
use App\Models\StudentSection;
use App\Models\StudentRunningGrade;
use App\Models\Subject;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

class ClassSectionController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->user();
        $institutionId = $user->getDefaultInstitutionId();
        
        // If no default institution, get all institutions the user has access to
        if (!$institutionId) {
            $userInstitutions = $user->userInstitutions()->pluck('institution_id');
            if ($userInstitutions->isEmpty()) {
                return response()->json([
                    'data' => [],
                    'pagination' => [
                        'current_page' => 1,
                        'last_page' => 1,
                        'per_page' => 15,
                        'total' => 0,
                    ]
                ]);
            }
            $query = ClassSection::whereIn('institution_id', $userInstitutions);
        } else {
            $query = ClassSection::where('institution_id', $institutionId);
        }
        
        $query = $query->with(['adviserUser', 'department', 'track', 'strand']);

        // Search by title or grade_level
        if ($request->has('search') && $request->search) {
            $search = '%' . $request->search . '%';
            $query->where(function ($q) use ($search) {
                $q->where('title', 'like', $search)
                  ->orWhere('grade_level', 'like', $search);
            });
        }

        // Filter by grade_level
        if ($request->has('grade_level') && $request->grade_level) {
            $query->where('grade_level', $request->grade_level);
        }

        if ($request->filled('department_id')) {
            $query->where('department_id', $request->department_id);
        }

        $sections = $query->paginate($request->get('per_page', 15));

        return response()->json([
            'data' => $sections->items(),
            'pagination' => [
                'current_page' => $sections->currentPage(),
                'last_page' => $sections->lastPage(),
                'per_page' => $sections->perPage(),
                'total' => $sections->total(),
            ]
        ]);
    }

    public function store(Request $request)
    {
        $user = $request->user();
        $institutionId = $user->getDefaultInstitutionId();
        $validated = $request->validate([
            'grade_level' => 'required|string',
            'title' => 'required|string',
            'adviser' => 'nullable|exists:users,id',
            'academic_year' => 'nullable|string',
            'department_id' => 'nullable|uuid|exists:departments,id',
            'track_id' => 'nullable|uuid|exists:tracks,id',
            'strand_id' => 'nullable|uuid|exists:strands,id',
        ]);
        $validated['institution_id'] = $institutionId;

        // Auto-default academic_year from institution's current_academic_year if not provided
        if (empty($validated['academic_year']) && $institutionId) {
            $institution = \App\Models\Institution::find($institutionId);
            if ($institution?->current_academic_year) {
                $validated['academic_year'] = $institution->current_academic_year;
            }
        }

        $section = ClassSection::create($validated);
        $section->load(['adviserUser', 'department', 'track', 'strand']);
        return response()->json(['data' => $section], 201);
    }

    public function show($id, Request $request)
    {
        $user = $request->user();
        $institutionId = $user->getDefaultInstitutionId();
        $section = ClassSection::where('institution_id', $institutionId)
            ->with(['adviserUser', 'department', 'track', 'strand'])
            ->findOrFail($id);
        return response()->json(['data' => $section]);
    }

    public function update(Request $request, $id)
    {
        $user = $request->user();
        $institutionId = $user->getDefaultInstitutionId();
        $section = ClassSection::where('institution_id', $institutionId)->findOrFail($id);
        $validated = $request->validate([
            'grade_level' => 'sometimes|required|string',
            'title' => 'sometimes|required|string',
            'adviser' => 'nullable|exists:users,id',
            'academic_year' => 'nullable|string',
            'department_id' => 'nullable|uuid|exists:departments,id',
            'track_id' => 'nullable|uuid|exists:tracks,id',
            'strand_id' => 'nullable|uuid|exists:strands,id',
        ]);
        $validated['institution_id'] = $institutionId;
        $section->update($validated);
        $section->load(['adviserUser', 'department', 'track', 'strand']);
        return response()->json(['data' => $section]);
    }

    public function destroy($id, Request $request)
    {
        $user = $request->user();
        $institutionId = $user->getDefaultInstitutionId();
        $section = ClassSection::where('institution_id', $institutionId)->findOrFail($id);
        $section->delete();
        return response()->json(['message' => 'Deleted successfully']);
    }

    /**
     * Get class sections by institution ID
     */
    public function getByInstitution(Request $request, $institutionId = null)
    {
        $user = $request->user();
        
        // If no institution ID provided, use default institution
        if (!$institutionId) {
            $institutionId = $user->getDefaultInstitutionId();
        }
        
        // If still no institution ID, get all institutions the user has access to
        if (!$institutionId) {
            $userInstitutions = $user->userInstitutions()->pluck('institution_id');
            if ($userInstitutions->isEmpty()) {
                return response()->json([
                    'data' => [],
                    'pagination' => [
                        'current_page' => 1,
                        'last_page' => 1,
                        'per_page' => 15,
                        'total' => 0,
                    ]
                ]);
            }
            $query = ClassSection::whereIn('institution_id', $userInstitutions);
        } else {
            $query = ClassSection::where('institution_id', $institutionId);
        }
        
        $query = $query->with(['adviserUser', 'department', 'track', 'strand']);

        // Search by title or grade_level
        if ($request->has('search') && $request->search) {
            $search = '%' . $request->search . '%';
            $query->where(function ($q) use ($search) {
                $q->where('title', 'like', $search)
                  ->orWhere('grade_level', 'like', $search);
            });
        }

        // Filter by grade_level
        if ($request->has('grade_level') && $request->grade_level) {
            $query->where('grade_level', $request->grade_level);
        }

        if ($request->filled('department_id')) {
            $query->where('department_id', $request->department_id);
        }

        $sections = $query->paginate($request->get('per_page', 15));

        return response()->json([
            'data' => $sections->items(),
            'pagination' => [
                'current_page' => $sections->currentPage(),
                'last_page' => $sections->lastPage(),
                'per_page' => $sections->perPage(),
                'total' => $sections->total(),
            ]
        ]);
    }

    /**
     * Return distinct academic years for the institution's class sections.
     */
    public function getAcademicYears(Request $request)
    {
        $user = $request->user();
        $institutionId = $user->getDefaultInstitutionId();

        $years = ClassSection::where('institution_id', $institutionId)
            ->whereNotNull('academic_year')
            ->distinct()
            ->orderBy('academic_year', 'desc')
            ->pluck('academic_year');

        return response()->json(['data' => $years]);
    }

    /**
     * Dissolve a class section and transfer students to different sections
     */
    public function dissolve(Request $request, $id)
    {
        $user = $request->user();
        $institutionId = $user->getDefaultInstitutionId();
        
        // Find the section
        $section = ClassSection::where('institution_id', $institutionId)->findOrFail($id);
        
        // Validate request
        $validator = Validator::make($request->all(), [
            'student_assignments' => 'required|array',
            'student_assignments.*.student_id' => 'required|uuid|exists:students,id',
            'student_assignments.*.target_section_id' => 'required|uuid|exists:class_sections,id',
            'subject_mappings' => 'nullable|array', // Optional - subjects don't need to be mapped
            'subject_mappings.*.source_subject_id' => 'required_with:subject_mappings|uuid|exists:subjects,id',
            'subject_mappings.*.target_subject_id' => 'required_with:subject_mappings|uuid|exists:subjects,id',
            'subject_mappings.*.target_section_id' => 'required_with:subject_mappings|uuid|exists:class_sections,id',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors()
            ], 422);
        }

        $studentAssignments = $request->student_assignments;
        $subjectMappings = $request->subject_mappings ?? []; // Default to empty array if not provided

        // Create a map for quick lookup: source_subject_id -> { target_subject_id, target_section_id }
        $subjectMappingMap = [];
        foreach ($subjectMappings as $mapping) {
            $subjectMappingMap[$mapping['source_subject_id']] = [
                'target_subject_id' => $mapping['target_subject_id'],
                'target_section_id' => $mapping['target_section_id'],
            ];
        }

        // Create a map for student assignments: student_id -> target_section_id
        $studentAssignmentMap = [];
        foreach ($studentAssignments as $assignment) {
            $studentAssignmentMap[$assignment['student_id']] = $assignment['target_section_id'];
        }

        DB::beginTransaction();
        try {
            // Requirement 1: Update section status to 'dissolve' and set deleted_at
            $section->update([
                'status' => 'dissolve',
                'deleted_at' => now(),
            ]);

            // Get all subjects in the dissolving section
            $sectionSubjects = Subject::where('class_section_id', $section->id)->pluck('id')->toArray();

            // Requirement 2 & 3: Process each student
            foreach ($studentAssignments as $assignment) {
                $studentId = $assignment['student_id'];
                $targetSectionId = $assignment['target_section_id'];
                
                // Get the old student_section record
                $oldStudentSection = StudentSection::where('student_id', $studentId)
                    ->where('section_id', $section->id)
                    ->where('is_active', true)
                    ->first();

                if (!$oldStudentSection) {
                    continue; // Skip if no active record found
                }

                $oldAcademicYear = $oldStudentSection->academic_year;

                // Requirement 2: Deactivate old student_section
                $oldStudentSection->update([
                    'is_active' => false,
                ]);

                // Requirement 2: Create new student_section with target section (preserve academic_year from old record)
                // Check if already exists
                $existingNewSection = StudentSection::where('student_id', $studentId)
                    ->where('section_id', $targetSectionId)
                    ->where('academic_year', $oldAcademicYear)
                    ->first();

                if (!$existingNewSection) {
                    StudentSection::create([
                        'student_id' => $studentId,
                        'section_id' => $targetSectionId,
                        'academic_year' => $oldAcademicYear,
                        'is_active' => true,
                        'is_promoted' => false,
                    ]);
                } else {
                    // If exists, just activate it
                    $existingNewSection->update([
                        'is_active' => true,
                    ]);
                }

                // Get target section to get its academic_year
                $targetSection = ClassSection::find($targetSectionId);
                $targetAcademicYear = $targetSection->academic_year ?? $oldAcademicYear;

                // Requirement 3: Get all grades for this student in the dissolving section
                $studentGrades = StudentRunningGrade::where('student_id', $studentId)
                    ->whereIn('subject_id', $sectionSubjects)
                    ->whereNull('deleted_at')
                    ->get();

                // Group grades by subject_id
                $gradesBySubject = $studentGrades->groupBy('subject_id');

                foreach ($gradesBySubject as $sourceSubjectId => $grades) {
                    // Check if this subject is mapped
                    if (isset($subjectMappingMap[$sourceSubjectId])) {
                        // Subject is mapped - transfer grades
                        $mapping = $subjectMappingMap[$sourceSubjectId];
                        $targetSubjectId = $mapping['target_subject_id'];

                        // Mark old grades as deleted with note 'Dissolve - Grade Transferred'
                        foreach ($grades as $grade) {
                            $grade->update([
                                'deleted_at' => now(),
                                'note' => 'Dissolve - Grade Transferred',
                            ]);

                            // Create new grade with mapped subject and target section's academic_year
                            StudentRunningGrade::create([
                                'student_id' => $studentId,
                                'subject_id' => $targetSubjectId,
                                'quarter' => $grade->quarter,
                                'grade' => $grade->grade,
                                'final_grade' => $grade->final_grade,
                                'academic_year' => $targetAcademicYear,
                            ]);
                        }
                    } else {
                        // Subject is not mapped - mark as deleted with note 'Dissolved - No Mapping'
                        foreach ($grades as $grade) {
                            $grade->update([
                                'deleted_at' => now(),
                                'note' => 'Dissolved - No Mapping',
                            ]);
                        }
                    }
                }
            }

            DB::commit();

            return response()->json([
                'success' => true,
                'message' => 'Section dissolved successfully',
                'data' => [
                    'section_id' => $section->id,
                    'status' => 'dissolve',
                    'deleted_at' => $section->deleted_at,
                ]
            ]);
        } catch (\Exception $e) {
            DB::rollBack();
            
            return response()->json([
                'success' => false,
                'message' => 'Failed to dissolve section',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Transfer a single student from this section to another section.
     * Mirrors the dissolve grade-mapping behaviour for one student, but leaves
     * the source section intact and leaves unmapped grades untouched.
     */
    public function transferStudent(Request $request, $id)
    {
        $user = $request->user();
        $institutionId = $user->getDefaultInstitutionId();

        // Find the source section (scoped to the user's institution)
        $section = ClassSection::where('institution_id', $institutionId)->findOrFail($id);

        $validator = Validator::make($request->all(), [
            'student_id' => 'required|uuid|exists:students,id',
            'target_section_id' => 'required|uuid|exists:class_sections,id',
            'subject_mappings' => 'nullable|array', // Optional - only subjects with grades need mapping
            'subject_mappings.*.source_subject_id' => 'required_with:subject_mappings|uuid|exists:subjects,id',
            'subject_mappings.*.target_subject_id' => 'required_with:subject_mappings|uuid|exists:subjects,id',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors()
            ], 422);
        }

        $studentId = $request->student_id;
        $targetSectionId = $request->target_section_id;

        if ($targetSectionId === $section->id) {
            return response()->json([
                'success' => false,
                'message' => 'Cannot transfer a student to the same section.',
            ], 422);
        }

        // Ensure the target section belongs to the same institution
        $targetSection = ClassSection::where('institution_id', $institutionId)->find($targetSectionId);
        if (!$targetSection) {
            return response()->json([
                'success' => false,
                'message' => 'Target section not found in this institution.',
            ], 404);
        }

        $subjectMappings = $request->subject_mappings ?? [];

        // Map for quick lookup: source_subject_id -> target_subject_id
        $subjectMappingMap = [];
        foreach ($subjectMappings as $mapping) {
            $subjectMappingMap[$mapping['source_subject_id']] = $mapping['target_subject_id'];
        }

        DB::beginTransaction();
        try {
            // Find the student's active enrollment in the source section
            $oldStudentSection = StudentSection::where('student_id', $studentId)
                ->where('section_id', $section->id)
                ->where('is_active', true)
                ->first();

            if (!$oldStudentSection) {
                DB::rollBack();
                return response()->json([
                    'success' => false,
                    'message' => 'Student is not actively enrolled in this section.',
                ], 422);
            }

            $oldAcademicYear = $oldStudentSection->academic_year;

            // Deactivate the old enrollment
            $oldStudentSection->update([
                'is_active' => false,
            ]);

            // Create (or reactivate) the enrollment in the target section
            $existingNewSection = StudentSection::where('student_id', $studentId)
                ->where('section_id', $targetSectionId)
                ->where('academic_year', $oldAcademicYear)
                ->first();

            if (!$existingNewSection) {
                StudentSection::create([
                    'student_id' => $studentId,
                    'section_id' => $targetSectionId,
                    'academic_year' => $oldAcademicYear,
                    'is_active' => true,
                    'is_promoted' => false,
                ]);
            } else {
                $existingNewSection->update([
                    'is_active' => true,
                ]);
            }

            $targetAcademicYear = $targetSection->academic_year ?? $oldAcademicYear;

            // Subjects belonging to the source section
            $sectionSubjects = Subject::where('class_section_id', $section->id)->pluck('id')->toArray();

            // Transfer grades for mapped subjects only (unmapped grades are left as-is)
            if (!empty($subjectMappingMap)) {
                $studentGrades = StudentRunningGrade::where('student_id', $studentId)
                    ->whereIn('subject_id', array_keys($subjectMappingMap))
                    ->whereIn('subject_id', $sectionSubjects)
                    ->whereNull('deleted_at')
                    ->get();

                foreach ($studentGrades as $grade) {
                    $targetSubjectId = $subjectMappingMap[$grade->subject_id];

                    $grade->update([
                        'deleted_at' => now(),
                        'note' => 'Transfer - Grade Transferred',
                    ]);

                    StudentRunningGrade::create([
                        'student_id' => $studentId,
                        'subject_id' => $targetSubjectId,
                        'quarter' => $grade->quarter,
                        'grade' => $grade->grade,
                        'final_grade' => $grade->final_grade,
                        'academic_year' => $targetAcademicYear,
                    ]);
                }
            }

            DB::commit();

            return response()->json([
                'success' => true,
                'message' => 'Student transferred successfully',
                'data' => [
                    'student_id' => $studentId,
                    'from_section_id' => $section->id,
                    'target_section_id' => $targetSectionId,
                ]
            ]);
        } catch (\Exception $e) {
            DB::rollBack();

            return response()->json([
                'success' => false,
                'message' => 'Failed to transfer student',
                'error' => $e->getMessage()
            ], 500);
        }
    }
} 