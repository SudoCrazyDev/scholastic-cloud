<?php

namespace App\Http\Controllers;

use App\Models\StudentSubject;
use App\Models\StudentSection;
use App\Models\StudentInstitution;
use App\Models\Subject;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class StudentSubjectController extends Controller
{
    /**
     * List students assigned to a subject.
     * Requires subject_id.
     */
    public function index(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'subject_id' => 'required|uuid|exists:subjects,id',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        $user = $request->user();
        $institutionId = $user->getDefaultInstitutionId();
        if (!$institutionId) {
            return response()->json([
                'success' => false,
                'message' => 'No default institution found for authenticated user',
            ], 403);
        }

        $subject = Subject::with('classSection')
            ->where('institution_id', $institutionId)
            ->find($request->subject_id);

        if (!$subject) {
            return response()->json([
                'success' => false,
                'message' => 'Subject not found or access denied',
            ], 404);
        }

        $assignments = StudentSubject::where('subject_id', $subject->id)
            ->with(['student:id,lrn,first_name,middle_name,last_name,ext_name,gender,religion,birthdate,profile_picture,is_active'])
            ->get();

        return response()->json([
            'success' => true,
            'data' => $assignments,
        ]);
    }

    /**
     * Assign a single student to a subject.
     */
    public function store(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'student_id' => 'required|uuid|exists:students,id',
            'subject_id' => 'required|uuid|exists:subjects,id',
            'is_active' => 'boolean',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        $user = $request->user();
        $institutionId = $user->getDefaultInstitutionId();
        if (!$institutionId) {
            return response()->json([
                'success' => false,
                'message' => 'No default institution found for authenticated user',
            ], 403);
        }

        $subject = Subject::with('classSection')
            ->where('institution_id', $institutionId)
            ->find($request->subject_id);

        if (!$subject) {
            return response()->json([
                'success' => false,
                'message' => 'Subject not found or access denied',
            ], 404);
        }

        if (!$subject->is_limited_student) {
            return response()->json([
                'success' => false,
                'message' => 'This subject does not allow limited student assignments',
            ], 422);
        }

        $classSectionId = $subject->class_section_id;
        $academicYear = optional($subject->classSection)->academic_year;

        // Ensure the student is part of the subject's class section for the same academic year
        $inSection = StudentSection::where([
            'student_id' => $request->student_id,
            'section_id' => $classSectionId,
            'academic_year' => $academicYear,
        ])->where('is_active', true)->exists();

        if (!$inSection) {
            return response()->json([
                'success' => false,
                'message' => 'Student is not part of the subject\'s class section for the specified academic year',
            ], 422);
        }

        // Prevent duplicate assignment
        $existing = StudentSubject::where([
            'student_id' => $request->student_id,
            'subject_id' => $subject->id,
        ])->first();

        if ($existing) {
            return response()->json([
                'success' => false,
                'message' => 'Student is already assigned to this subject',
            ], 409);
        }

        // Ensure student_institution exists
        $studentInstitution = StudentInstitution::where('student_id', $request->student_id)
            ->where('institution_id', $institutionId)
            ->first();
        
        if (!$studentInstitution) {
            // Create new student_institution record if it doesn't exist
            StudentInstitution::create([
                'student_id' => $request->student_id,
                'institution_id' => $institutionId,
                'is_active' => true,
                'academic_year' => $academicYear,
            ]);
        } else {
            // Update existing record to ensure it's active and has the current academic year
            $studentInstitution->update([
                'is_active' => true,
                'academic_year' => $academicYear,
            ]);
        }

        $assignment = StudentSubject::create([
            'student_id' => $request->student_id,
            'subject_id' => $subject->id,
            'academic_year' => $academicYear,
            'is_active' => $request->is_active ?? true,
        ]);

        $assignment->load(['student:id,lrn,first_name,middle_name,last_name,ext_name,gender,religion,birthdate,profile_picture,is_active', 'subject']);

        return response()->json([
            'success' => true,
            'message' => 'Student assigned to subject successfully',
            'data' => $assignment,
        ], 201);
    }

    /**
     * Show a specific student-subject assignment.
     */
    public function show(string $id): JsonResponse
    {
        $assignment = StudentSubject::with([
            'student:id,lrn,first_name,middle_name,last_name,ext_name,gender,religion,birthdate,profile_picture,is_active',
            'subject:id,title,class_section_id,institution_id',
        ])->find($id);

        if (!$assignment) {
            return response()->json([
                'success' => false,
                'message' => 'Student subject assignment not found',
            ], 404);
        }

        return response()->json([
            'success' => true,
            'data' => $assignment,
        ]);
    }

    /**
     * Update assignment status (e.g., is_active).
     */
    public function update(Request $request, string $id): JsonResponse
    {
        $assignment = StudentSubject::find($id);
        if (!$assignment) {
            return response()->json([
                'success' => false,
                'message' => 'Student subject assignment not found',
            ], 404);
        }

        $validator = Validator::make($request->all(), [
            'is_active' => 'sometimes|boolean',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        $assignment->update($request->only(['is_active']));

        $assignment->load(['student:id,lrn,first_name,middle_name,last_name,ext_name,gender,religion,birthdate,profile_picture,is_active', 'subject']);

        return response()->json([
            'success' => true,
            'message' => 'Student subject assignment updated successfully',
            'data' => $assignment,
        ]);
    }

    /**
     * Delete an assignment.
     */
    public function destroy(string $id): JsonResponse
    {
        $assignment = StudentSubject::find($id);
        if (!$assignment) {
            return response()->json([
                'success' => false,
                'message' => 'Student subject assignment not found',
            ], 404);
        }

        $assignment->delete();

        return response()->json([
            'success' => true,
            'message' => 'Student subject assignment deleted successfully',
        ]);
    }

    /**
     * Bulk-assign students to a subject.
     */
    public function bulkAssign(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'student_ids' => 'required|array|min:1',
            'student_ids.*' => 'required|uuid|exists:students,id',
            'subject_id' => 'required|uuid|exists:subjects,id',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        $user = $request->user();
        $institutionId = $user->getDefaultInstitutionId();
        if (!$institutionId) {
            return response()->json([
                'success' => false,
                'message' => 'No default institution found for authenticated user',
            ], 403);
        }

        $subject = Subject::with('classSection')
            ->where('institution_id', $institutionId)
            ->find($request->subject_id);

        if (!$subject) {
            return response()->json([
                'success' => false,
                'message' => 'Subject not found or access denied',
            ], 404);
        }

        if (!$subject->is_limited_student) {
            return response()->json([
                'success' => false,
                'message' => 'This subject does not allow limited student assignments',
            ], 422);
        }

        $academicYear = optional($subject->classSection)->academic_year;
        $classSectionId = $subject->class_section_id;
        $studentIds = $request->student_ids;

        // Check membership in the subject's class section for all students
        $notInSection = collect($studentIds)->filter(function ($studentId) use ($classSectionId, $academicYear) {
            return !StudentSection::where([
                'student_id' => $studentId,
                'section_id' => $classSectionId,
                'academic_year' => $academicYear,
            ])->where('is_active', true)->exists();
        })->values()->all();

        if (!empty($notInSection)) {
            return response()->json([
                'success' => false,
                'message' => 'Some students are not part of the subject\'s class section for the specified academic year',
                'not_in_section_student_ids' => $notInSection,
            ], 422);
        }

        // Check for existing assignments
        $existingAssignments = StudentSubject::where('subject_id', $subject->id)
            ->whereIn('student_id', $studentIds)
            ->get();

        if ($existingAssignments->isNotEmpty()) {
            $existingStudentIds = $existingAssignments->pluck('student_id')->toArray();
            return response()->json([
                'success' => false,
                'message' => 'Some students are already assigned to this subject',
                'existing_student_ids' => $existingStudentIds,
            ], 409);
        }

        // Create missing student_institution and assignments
        $created = [];
        foreach ($studentIds as $studentId) {
            $studentInstitution = StudentInstitution::where('student_id', $studentId)
                ->where('institution_id', $institutionId)
                ->first();
            
            if (!$studentInstitution) {
                // Create new student_institution record if it doesn't exist
                StudentInstitution::create([
                    'student_id' => $studentId,
                    'institution_id' => $institutionId,
                    'is_active' => true,
                    'academic_year' => $academicYear,
                ]);
            } else {
                // Update existing record to ensure it's active and has the current academic year
                $studentInstitution->update([
                    'is_active' => true,
                    'academic_year' => $academicYear,
                ]);
            }

            $created[] = StudentSubject::create([
                'student_id' => $studentId,
                'subject_id' => $subject->id,
                'academic_year' => $academicYear,
                'is_active' => true,
            ]);
        }

        return response()->json([
            'success' => true,
            'message' => 'Students assigned to subject successfully',
            'data' => $created,
        ], 201);
    }
}