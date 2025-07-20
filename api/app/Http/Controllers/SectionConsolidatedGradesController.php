<?php

namespace App\Http\Controllers;

use App\Models\ClassSection;
use App\Models\StudentRunningGrade;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

class SectionConsolidatedGradesController extends Controller
{
    /**
     * Get consolidated grades for a section by quarter
     */
    public function index(Request $request): JsonResponse
    {
        $request->validate([
            'section_id' => 'required|string|exists:class_sections,id',
            'quarter' => 'required|integer|between:1,4',
        ]);

        $sectionId = $request->section_id;
        $quarter = $request->quarter;

        // Get the section with its students and subjects
        $section = ClassSection::with(['students', 'subjects'])->findOrFail($sectionId);

        // Get all students in this section
        $students = $section->students;

        // Get all subjects for this section
        $subjects = $section->subjects;

        // Get grades for all students in this section for the specified quarter
        $grades = StudentRunningGrade::whereIn('student_id', $students->pluck('id'))
            ->whereIn('subject_id', $subjects->pluck('id'))
            ->where('quarter', $quarter)
            ->get();

        // Build the consolidated grades structure
        $consolidatedGrades = [];

        foreach ($students as $student) {
            $studentGrades = [];
            
            foreach ($subjects as $subject) {
                // Find the grade for this student and subject
                $grade = $grades->where('student_id', $student->id)
                    ->where('subject_id', $subject->id)
                    ->first();

                $studentGrades[] = [
                    'subject_id' => $subject->id,
                    'subject_title' => $subject->title,
                    'subject_variant' => $subject->variant,
                    'grade' => $grade ? ($grade->final_grade ?? $grade->grade) : null,
                    'final_grade' => $grade ? $grade->final_grade : null,
                    'calculated_grade' => $grade ? $grade->grade : null,
                ];
            }

            $consolidatedGrades[] = [
                'student_id' => $student->id,
                'student_name' => trim($student->first_name . ' ' . $student->middle_name . ' ' . $student->last_name . ' ' . $student->ext_name),
                'lrn' => $student->lrn,
                'subjects' => $studentGrades,
            ];
        }

        return response()->json([
            'success' => true,
            'data' => [
                'section' => [
                    'id' => $section->id,
                    'title' => $section->title,
                    'grade_level' => $section->grade_level,
                    'academic_year' => $section->academic_year,
                ],
                'quarter' => $quarter,
                'students' => $consolidatedGrades,
            ],
        ]);
    }
} 