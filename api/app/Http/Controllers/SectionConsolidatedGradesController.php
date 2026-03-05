<?php

namespace App\Http\Controllers;

use App\Models\ClassSection;
use App\Models\StudentRunningGrade;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class SectionConsolidatedGradesController extends Controller
{
    /**
     * Get consolidated grades for a section by quarter
     */
    public function index(Request $request): JsonResponse
    {
        $request->validate([
            'section_id' => 'required|string|exists:class_sections,id',
            'quarter' => 'required|string|in:1,2,3,4,final',
        ]);

        $sectionId = $request->section_id;
        $quarter = $request->quarter;
        $isFinal = $quarter === 'final';

        // Get the section with its students and subjects (eager load childSubjects)
        $section = ClassSection::with(['students', 'subjects.childSubjects'])->findOrFail($sectionId);

        // Get all students in this section and sort by last name alphabetically
        $students = $section->students->sortBy('last_name');

        // Get all subjects for this section, ordered hierarchically
        $subjects = $section->subjects->sortBy(function($subject) {
            if ($subject->subject_type === 'parent') {
                return $subject->order * 1000;
            } else {
                $parentOrder = $subject->parentSubject ? $subject->parentSubject->order : 999;
                $childOrder = $subject->order;
                return ($parentOrder * 1000) + $childOrder;
            }
        });

        // Get grades: all 4 quarters for final, single quarter otherwise
        $gradesQuery = StudentRunningGrade::whereIn('student_id', $students->pluck('id'))
            ->whereIn('subject_id', $subjects->pluck('id'));

        if ($isFinal) {
            $gradesQuery->whereIn('quarter', [1, 2, 3, 4]);
        } else {
            $gradesQuery->where('quarter', (int)$quarter);
        }

        $grades = $gradesQuery->get();

        // Helper: get base title (strip after dash or parenthesis)
        $getBaseTitle = function($title) {
            // Remove everything after the first dash or parenthesis
            $title = preg_replace('/\s*[-(].*$/', '', $title);
            return trim($title);
        };

        // Helper: compute the average grade for a subject across all 4 quarters
        $averageAcrossQuarters = function($studentId, $subjectId) use ($grades) {
            $quarterGrades = $grades->where('student_id', $studentId)
                ->where('subject_id', $subjectId)
                ->whereIn('quarter', [1, 2, 3, 4]);
            $vals = [];
            foreach ($quarterGrades as $g) {
                $v = $g->final_grade ?? $g->grade;
                if ($v !== null) $vals[] = (float)$v;
            }
            return count($vals) > 0 ? round(array_sum($vals) / count($vals)) : null;
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
                        $childGrades = [];
                        foreach ($childSubjects as $child) {
                            if ($isFinal) {
                                $avg = $averageAcrossQuarters($student->id, $child->id);
                                if ($avg !== null) $childGrades[] = $avg;
                            } else {
                                $grade = $grades->where('student_id', $student->id)
                                    ->where('subject_id', $child->id)
                                    ->first();
                                if ($grade) {
                                    $childGrades[] = $grade->final_grade ?? $grade->grade;
                                }
                            }
                        }
                        $avg = count($childGrades) > 0 ? round(array_sum($childGrades) / count($childGrades)) : null;
                        $studentGrades[] = [
                            'subject_id' => $subject->id,
                            'subject_title' => $subject->title,
                            'subject_variant' => $subject->variant,
                            'subject_type' => $subject->subject_type,
                            'parent_subject_id' => $subject->parent_subject_id,
                            'grade' => $avg !== null ? (int)$avg : null,
                            'final_grade' => $avg !== null ? (int)$avg : null,
                            'calculated_grade' => $avg !== null ? (int)$avg : null,
                        ];
                        $handledParentIds[] = $subject->id;
                    } else {
                        if ($isFinal) {
                            $val = $averageAcrossQuarters($student->id, $subject->id);
                        } else {
                            $grade = $grades->where('student_id', $student->id)
                                ->where('subject_id', $subject->id)
                                ->first();
                            $val = $grade ? ($grade->final_grade ?? $grade->grade) : null;
                        }
                        $studentGrades[] = [
                            'subject_id' => $subject->id,
                            'subject_title' => $subject->title,
                            'subject_variant' => $subject->variant,
                            'subject_type' => $subject->subject_type,
                            'parent_subject_id' => $subject->parent_subject_id,
                            'grade' => $val !== null ? (float)$val : null,
                            'final_grade' => $val !== null ? (float)$val : null,
                            'calculated_grade' => $val !== null ? (float)$val : null,
                        ];
                        $handledParentIds[] = $subject->id;
                    }
                }
            }

            // 1b. Add all child subjects as individual entries (if not already present)
            foreach ($subjects as $subject) {
                if ($subject->subject_type === 'child') {
                    $alreadyIncluded = false;
                    foreach ($studentGrades as $sg) {
                        if ($sg['subject_id'] === $subject->id) {
                            $alreadyIncluded = true;
                            break;
                        }
                    }
                    if (!$alreadyIncluded) {
                        if ($isFinal) {
                            $val = $averageAcrossQuarters($student->id, $subject->id);
                        } else {
                            $grade = $grades->where('student_id', $student->id)
                                ->where('subject_id', $subject->id)
                                ->first();
                            $val = $grade ? ($grade->final_grade ?? $grade->grade) : null;
                        }
                        $studentGrades[] = [
                            'subject_id' => $subject->id,
                            'subject_title' => $subject->title,
                            'subject_variant' => $subject->variant,
                            'subject_type' => $subject->subject_type,
                            'parent_subject_id' => $subject->parent_subject_id,
                            'grade' => $val !== null ? (int)$val : null,
                            'final_grade' => $val !== null ? (int)$val : null,
                            'calculated_grade' => $val !== null ? (int)$val : null,
                        ];
                    }
                }
            }

            // 2. Handle subjects with variants (group by base title only if variant is not empty/null)
            $variantGroups = [];
            $regularSubjects = [];
            
            foreach ($subjects as $subject) {
                if ($subject->subject_type !== 'parent' && $subject->subject_type !== 'child' && !in_array($subject->id, $handledParentIds)) {
                    if (!empty($subject->variant) && $subject->variant !== null) {
                        $baseTitle = $getBaseTitle($subject->title);
                        $variantGroups[$baseTitle][] = $subject;
                    } else {
                        $regularSubjects[] = $subject;
                    }
                }
            }
            
            // Process grouped subjects with variants
            foreach ($variantGroups as $baseTitle => $groupedSubjects) {
                if ($isFinal) {
                    $finalAvgs = [];
                    foreach ($groupedSubjects as $subject) {
                        $avg = $averageAcrossQuarters($student->id, $subject->id);
                        if ($avg !== null) $finalAvgs[] = $avg;
                    }
                    $val = count($finalAvgs) > 0 ? round(array_sum($finalAvgs) / count($finalAvgs)) : null;
                    $studentGrades[] = [
                        'subject_id' => $groupedSubjects[0]->id,
                        'subject_title' => $baseTitle,
                        'subject_variant' => null,
                        'subject_type' => $groupedSubjects[0]->subject_type,
                        'parent_subject_id' => $groupedSubjects[0]->parent_subject_id,
                        'grade' => $val !== null ? (int)$val : null,
                        'final_grade' => $val !== null ? (int)$val : null,
                        'calculated_grade' => $val !== null ? (int)$val : null,
                    ];
                } else {
                    $gradesArr = [];
                    $finalGradesArr = [];
                    foreach ($groupedSubjects as $subject) {
                        $grade = $grades->where('student_id', $student->id)
                            ->where('subject_id', $subject->id)
                            ->first();
                        if ($grade) {
                            $gradesArr[] = $grade->grade;
                            $finalGradesArr[] = $grade->final_grade ?? $grade->grade;
                        }
                    }
                    $avg = count($gradesArr) > 0 ? round(array_sum($gradesArr) / count($gradesArr)) : null;
                    $finalAvg = count($finalGradesArr) > 0 ? round(array_sum($finalGradesArr) / count($finalGradesArr)) : null;
                    $studentGrades[] = [
                        'subject_id' => $groupedSubjects[0]->id,
                        'subject_title' => $baseTitle,
                        'subject_variant' => null,
                        'subject_type' => $groupedSubjects[0]->subject_type,
                        'parent_subject_id' => $groupedSubjects[0]->parent_subject_id,
                        'grade' => $avg !== null ? (int)$avg : null,
                        'final_grade' => $finalAvg !== null ? (int)$finalAvg : null,
                        'calculated_grade' => $avg !== null ? (int)$avg : null,
                    ];
                }
            }
            
            // Process regular subjects (without variants) individually
            foreach ($regularSubjects as $subject) {
                if ($isFinal) {
                    $val = $averageAcrossQuarters($student->id, $subject->id);
                } else {
                    $grade = $grades->where('student_id', $student->id)
                        ->where('subject_id', $subject->id)
                        ->first();
                    $val = $grade ? ($grade->final_grade ?? $grade->grade) : null;
                }
                $studentGrades[] = [
                    'subject_id' => $subject->id,
                    'subject_title' => $subject->title,
                    'subject_variant' => $subject->variant,
                    'subject_type' => $subject->subject_type,
                    'parent_subject_id' => $subject->parent_subject_id,
                    'grade' => $val !== null ? (int)$val : null,
                    'final_grade' => $val !== null ? (int)$val : null,
                    'calculated_grade' => $val !== null ? (int)$val : null,
                ];
            }

            // Format student name as: LAST_NAME, FIRST_NAME MIDDLE_INITIAL EXT_NAME
            $middleInitial = !empty($student->middle_name) ? substr($student->middle_name, 0, 1) . '.' : '';
            $extName = !empty($student->ext_name) ? ' ' . $student->ext_name : '';
            $formattedName = strtoupper(trim($student->last_name . ', ' . $student->first_name . ' ' . $middleInitial . $extName));

            $consolidatedGrades[] = [
                'student_id' => $student->id,
                'student_name' => $formattedName,
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