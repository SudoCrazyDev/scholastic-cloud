<?php

namespace App\Http\Controllers;

use App\Models\StudentSection;
use App\Models\Student;
use App\Models\ClassSection;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use App\Models\StudentInstitution;

class StudentSectionController extends Controller
{
    /**
     * Display a listing of the resource.
     * Fetch only students by section_id
     */
    public function index(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'section_id' => 'required|uuid|exists:class_sections,id',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors()
            ], 422);
        }

        $sectionId = $request->section_id;
        
        // Get students with their studentSection id using join
        $students = Student::join('student_sections', 'students.id', '=', 'student_sections.student_id')
            ->where('student_sections.section_id', $sectionId)
            ->select(
                'students.id', 
                'students.lrn', 
                'students.first_name', 
                'students.middle_name', 
                'students.last_name', 
                'students.ext_name', 
                'students.gender', 
                'students.religion', 
                'students.birthdate', 
                'students.profile_picture', 
                'students.is_active',
                'student_sections.id as student_section_id'
            )
            ->get();
        return response()->json([
            'success' => true,
            'data' => $students
        ]);
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'student_id' => 'required|uuid|exists:students,id',
            'section_id' => 'required|uuid|exists:class_sections,id',
            'academic_year' => 'required|string|max:255',
            'is_active' => 'boolean',
            'is_promoted' => 'boolean',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors()
            ], 422);
        }

        // Check if student is already assigned to this section in the same academic year
        $existingAssignment = StudentSection::where([
            'student_id' => $request->student_id,
            'section_id' => $request->section_id,
            'academic_year' => $request->academic_year,
        ])->first();

        if ($existingAssignment) {
            return response()->json([
                'success' => false,
                'message' => 'Student is already assigned to this section for the specified academic year',
            ], 409);
        }

        $studentSection = StudentSection::create([
            'student_id' => $request->student_id,
            'section_id' => $request->section_id,
            'academic_year' => $request->academic_year,
            'is_active' => $request->is_active ?? true,
            'is_promoted' => $request->is_promoted ?? false,
        ]);

        $studentSection->load(['student:id,lrn,first_name,middle_name,last_name,ext_name,gender,religion,birthdate,profile_picture,is_active', 'classSection:id,grade_level,title,academic_year']);

        return response()->json([
            'success' => true,
            'message' => 'Student assigned to section successfully',
            'data' => $studentSection
        ], 201);
    }

    /**
     * Display the specified resource.
     */
    public function show(string $id): JsonResponse
    {
        $studentSection = StudentSection::with([
            'student:id,lrn,first_name,middle_name,last_name,ext_name,gender,religion,birthdate,profile_picture,is_active',
            'classSection:id,grade_level,title,academic_year,institution_id'
        ])->find($id);

        if (!$studentSection) {
            return response()->json([
                'success' => false,
                'message' => 'Student section assignment not found'
            ], 404);
        }

        return response()->json([
            'success' => true,
            'data' => $studentSection
        ]);
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, string $id): JsonResponse
    {
        $studentSection = StudentSection::find($id);

        if (!$studentSection) {
            return response()->json([
                'success' => false,
                'message' => 'Student section assignment not found'
            ], 404);
        }

        $validator = Validator::make($request->all(), [
            'academic_year' => 'sometimes|required|string|max:255',
            'is_active' => 'sometimes|boolean',
            'is_promoted' => 'sometimes|boolean',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors()
            ], 422);
        }

        // If academic_year is being updated, check for duplicate assignment
        if ($request->has('academic_year') && $request->academic_year !== $studentSection->academic_year) {
            $existingAssignment = StudentSection::where([
                'student_id' => $studentSection->student_id,
                'section_id' => $studentSection->section_id,
                'academic_year' => $request->academic_year,
            ])->where('id', '!=', $id)->first();

            if ($existingAssignment) {
                return response()->json([
                    'success' => false,
                    'message' => 'Student is already assigned to this section for the specified academic year',
                ], 409);
            }
        }

        $studentSection->update($request->only(['academic_year', 'is_active', 'is_promoted']));

        $studentSection->load(['student:id,lrn,first_name,middle_name,last_name,ext_name,gender,religion,birthdate,profile_picture,is_active', 'classSection:id,grade_level,title,academic_year']);

        return response()->json([
            'success' => true,
            'message' => 'Student section assignment updated successfully',
            'data' => $studentSection
        ]);
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(string $id): JsonResponse
    {
        $studentSection = StudentSection::find($id);

        if (!$studentSection) {
            return response()->json([
                'success' => false,
                'message' => 'Student section assignment not found'
            ], 404);
        }

        $studentSection->delete();

        return response()->json([
            'success' => true,
            'message' => 'Student section assignment deleted successfully'
        ]);
    }

    /**
     * Bulk assign students to a class section.
     */
    public function bulkAssign(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'student_ids' => 'required|array|min:1',
            'student_ids.*' => 'required|uuid|exists:students,id',
            'section_id' => 'required|uuid|exists:class_sections,id',
            'academic_year' => 'required|string|max:255',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors()
            ], 422);
        }

        $studentIds = $request->student_ids;
        $sectionId = $request->section_id;
        $academicYear = $request->academic_year;

        // Get the current user's default institution_id
        $user = $request->user();
        $institutionId = $user->getDefaultInstitutionId();
        if (!$institutionId) {
            return response()->json([
                'success' => false,
                'message' => 'No default institution found for authenticated user'
            ], 403);
        }

        // Check for existing assignments
        $existingAssignments = StudentSection::where('section_id', $sectionId)
            ->where('academic_year', $academicYear)
            ->whereIn('student_id', $studentIds)
            ->get();

        if ($existingAssignments->isNotEmpty()) {
            $existingStudentIds = $existingAssignments->pluck('student_id')->toArray();
            return response()->json([
                'success' => false,
                'message' => 'Some students are already assigned to this section for the specified academic year',
                'existing_student_ids' => $existingStudentIds
            ], 409);
        }

        // Create new assignments and ensure student_institution exists
        $assignments = [];
        foreach ($studentIds as $studentId) {
            // Check if student_institution exists for this student and institution (regardless of academic year)
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

            $assignment = StudentSection::create([
                'student_id' => $studentId,
                'section_id' => $sectionId,
                'academic_year' => $academicYear,
                'is_active' => true,
                'is_promoted' => false,
            ]);

            $assignment->load(['student:id,lrn,first_name,middle_name,last_name,ext_name,gender,religion,birthdate,profile_picture,is_active', 'classSection:id,grade_level,title,academic_year']);
            $assignments[] = $assignment;
        }

        return response()->json([
            'success' => true,
            'message' => count($assignments) . ' student(s) assigned to section successfully',
            'data' => $assignments
        ], 201);
    }
}
