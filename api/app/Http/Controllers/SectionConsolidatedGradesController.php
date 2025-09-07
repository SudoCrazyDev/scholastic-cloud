<?php

namespace App\Http\Controllers;

use App\Models\ClassSection;
use App\Models\StudentRunningGrade;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

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

        // Get the section with its students and subjects (eager load childSubjects)
        $section = ClassSection::with(['students', 'subjects.childSubjects'])->findOrFail($sectionId);

        // Get all students in this section
        $students = $section->students;

        // Get all subjects for this section, ordered hierarchically
        $subjects = $section->subjects->sortBy(function($subject) {
            if ($subject->subject_type === 'parent') {
                // Parent subjects: use their order * 1000 to leave room for children
                return $subject->order * 1000;
            } else {
                // Child subjects: use parent's order * 1000 + child's order
                $parentOrder = $subject->parentSubject ? $subject->parentSubject->order : 999;
                $childOrder = $subject->order;
                return ($parentOrder * 1000) + $childOrder;
            }
        });

        // Get grades for all students in this section for the specified quarter
        $grades = StudentRunningGrade::whereIn('student_id', $students->pluck('id'))
            ->whereIn('subject_id', $subjects->pluck('id'))
            ->where('quarter', $quarter)
            ->get();

        // Helper: get base title (strip after dash or parenthesis)
        $getBaseTitle = function($title) {
            // Remove everything after the first dash or parenthesis
            $title = preg_replace('/\s*[-(].*$/', '', $title);
            return trim($title);
        };

        // Build the consolidated grades structure
        $consolidatedGrades = [];

        foreach ($students as $student) {
            $studentGrades = [];
            $handledParentIds = [];
            $handledBaseTitles = [];

            // 1. Handle parent subjects (average their children)
            foreach ($subjects as $subject) {
                if ($subject->subject_type === 'parent') {
                    $childSubjects = $subject->childSubjects;
                    if ($childSubjects->count() > 0) {
                        // Average grades of all child subjects for this student
                        $childGrades = [];
                        foreach ($childSubjects as $child) {
                            $grade = $grades->where('student_id', $student->id)
                                ->where('subject_id', $child->id)
                                ->first();
                            if ($grade) {
                                $childGrades[] = $grade->final_grade ?? $grade->grade;
                            }
                        }
                        $avg = count($childGrades) > 0 ? round(array_sum($childGrades) / count($childGrades)) : null;
                        $studentGrades[] = [
                            'subject_id' => $subject->id,
                            'subject_title' => $subject->title,
                            'subject_variant' => $subject->variant,
                            'grade' => $avg !== null ? (int)$avg : null,
                            'final_grade' => $avg !== null ? (int)$avg : null,
                            'calculated_grade' => $avg !== null ? (int)$avg : null,
                        ];
                        $handledParentIds[] = $subject->id;
                        // Do NOT add child subject IDs to handledParentIds
                    } else {
                        // No children, treat as normal subject
                        $grade = $grades->where('student_id', $student->id)
                            ->where('subject_id', $subject->id)
                            ->first();
                        $val = $grade ? ($grade->final_grade ?? $grade->grade) : null;
                        $studentGrades[] = [
                            'subject_id' => $subject->id,
                            'subject_title' => $subject->title,
                            'subject_variant' => $subject->variant,
                            'grade' => $val !== null ? (int)$val : null,
                            'final_grade' => $grade ? $grade->final_grade : null,
                            'calculated_grade' => $grade ? $grade->grade : null,
                        ];
                        $handledParentIds[] = $subject->id;
                    }
                }
            }

            // 1b. Add all child subjects as individual entries (if not already present)
            foreach ($subjects as $subject) {
                if ($subject->subject_type === 'child') {
                    // Check if already present in $studentGrades (by subject_id)
                    $alreadyIncluded = false;
                    foreach ($studentGrades as $sg) {
                        if ($sg['subject_id'] === $subject->id) {
                            $alreadyIncluded = true;
                            break;
                        }
                    }
                    if (!$alreadyIncluded) {
                        $grade = $grades->where('student_id', $student->id)
                            ->where('subject_id', $subject->id)
                            ->first();
                        $val = $grade ? ($grade->final_grade ?? $grade->grade) : null;
                        $studentGrades[] = [
                            'subject_id' => $subject->id,
                            'subject_title' => $subject->title,
                            'subject_variant' => $subject->variant,
                            'grade' => $val !== null ? (int)$val : null,
                            'final_grade' => $grade ? $grade->final_grade : null,
                            'calculated_grade' => $grade ? $grade->grade : null,
                        ];
                    }
                }
            }

            // 2. Handle subjects with variants (group by base title, average grades)
            $variantGroups = [];
            foreach ($subjects as $subject) {
                // Only consider subjects not already handled (not parent or child)
                if ($subject->subject_type !== 'parent' && $subject->subject_type !== 'child' && !in_array($subject->id, $handledParentIds)) {
                    $baseTitle = $getBaseTitle($subject->title);
                    $variantGroups[$baseTitle][] = $subject;
                }
            }
            foreach ($variantGroups as $baseTitle => $groupedSubjects) {
                $gradesArr = [];
                foreach ($groupedSubjects as $subject) {
                    $grade = $grades->where('student_id', $student->id)
                        ->where('subject_id', $subject->id)
                        ->first();
                    if ($grade) {
                        $gradesArr[] = $grade->final_grade ?? $grade->grade;
                    }
                }
                $avg = count($gradesArr) > 0 ? round(array_sum($gradesArr) / count($gradesArr)) : null;
                $studentGrades[] = [
                    'subject_id' => $groupedSubjects[0]->id, // Use first subject's ID
                    'subject_title' => $baseTitle,
                    'subject_variant' => null,
                    'grade' => $avg !== null ? (int)$avg : null,
                    'final_grade' => $avg !== null ? (int)$avg : null,
                    'calculated_grade' => $avg !== null ? (int)$avg : null,
                ];
            }

            $consolidatedGrades[] = [
                'student_id' => $student->id,
                'student_name' => trim($student->first_name . ' ' . $student->middle_name . ' ' . $student->last_name . ' ' . $student->ext_name),
                'lrn' => $student->lrn,
                'gender' => $student->gender,
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