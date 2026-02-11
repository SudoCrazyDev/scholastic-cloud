<?php

namespace App\Http\Controllers;

use App\Models\ClassSection;
use App\Models\StudentSection;
use App\Models\StudentRunningGrade;
use App\Models\Subject;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

class ProficiencyController extends Controller
{
    /** Passing grade threshold (DepEd standard) */
    private const PASSING_GRADE = 75;

    /**
     * Get proficiency stats: average passing percentage per subject per grade level.
     * Query params: academic_year (required), institution_id (optional), grade_level (optional).
     */
    public function index(Request $request): JsonResponse
    {
        $request->validate([
            'academic_year' => 'required|string',
            'institution_id' => 'sometimes|string|exists:institutions,id',
            'grade_level' => 'sometimes|string',
        ]);

        $user = $request->user();
        $academicYear = $request->academic_year;
        $gradeLevelFilter = $request->grade_level;

        $institutionId = $request->filled('institution_id')
            ? $request->institution_id
            : $user->getDefaultInstitutionId();

        if (!$institutionId) {
            $userInstitutions = $user->userInstitutions()->pluck('institution_id');
            if ($userInstitutions->isEmpty()) {
                return response()->json([
                    'success' => true,
                    'data' => [],
                ]);
            }
            $institutionId = $userInstitutions->first();
        }

        $sectionsQuery = ClassSection::where('institution_id', $institutionId)
            ->where('academic_year', $academicYear);

        if ($gradeLevelFilter) {
            $sectionsQuery->where('grade_level', $gradeLevelFilter);
        }

        $sections = $sectionsQuery->with(['subjects', 'studentSections'])->get();

        if ($sections->isEmpty()) {
            return response()->json([
                'success' => true,
                'data' => [],
            ]);
        }

        $sectionIds = $sections->pluck('id')->toArray();

        // Map: (grade_level, subject_title) -> list of [student_id, subject_id] (one per student in that grade with that subject)
        $groupKeyToPairs = [];

        foreach ($sections as $section) {
            $gradeLevel = $section->grade_level;
            foreach ($section->studentSections as $studentSection) {
                $studentId = $studentSection->student_id;
                foreach ($section->subjects as $subject) {
                    $title = $subject->title;
                    if ($subject->variant) {
                        $title = trim($title . ' - ' . $subject->variant);
                    }
                    $key = $gradeLevel . '|' . $title;
                    if (!isset($groupKeyToPairs[$key])) {
                        $groupKeyToPairs[$key] = [
                            'grade_level' => $gradeLevel,
                            'subject_title' => $title,
                            'pairs' => [],
                        ];
                    }
                    $groupKeyToPairs[$key]['pairs'][$studentId] = $subject->id;
                }
            }
        }

        $allStudentIds = [];
        $allSubjectIds = [];
        foreach ($groupKeyToPairs as $row) {
            foreach ($row['pairs'] as $sid => $subId) {
                $allStudentIds[$sid] = true;
                $allSubjectIds[$subId] = true;
            }
        }
        $allStudentIds = array_map('strval', array_keys($allStudentIds));
        $allSubjectIds = array_values(array_unique(array_map('strval', array_values($allSubjectIds))));

        if (empty($allStudentIds) || empty($allSubjectIds)) {
            return response()->json([
                'success' => true,
                'data' => $this->buildResultRows($groupKeyToPairs, [], []),
            ]);
        }

        $grades = StudentRunningGrade::whereIn('student_id', $allStudentIds)
            ->whereIn('subject_id', $allSubjectIds)
            ->where('academic_year', $academicYear)
            ->get();

        $yearlyByStudentSubject = [];
        $quarterGradesByStudentSubject = [];
        foreach ($grades->groupBy('student_id') as $studentId => $studentGrades) {
            foreach ($studentGrades->groupBy('subject_id') as $subjectId => $rows) {
                $quarterGrades = [];
                foreach ($rows as $row) {
                    $q = (int) $row->quarter;
                    $val = $row->final_grade ?? $row->grade;
                    $quarterGrades[$q] = $val !== null ? (float) $val : null;
                }
                $valid = array_filter($quarterGrades, fn($v) => $v !== null && $v > 0);
                $yearly = count($valid) > 0 ? array_sum($valid) / count($valid) : null;
                $key = strval($studentId) . '|' . strval($subjectId);
                $yearlyByStudentSubject[$key] = $yearly;
                $quarterGradesByStudentSubject[$key] = $quarterGrades;
            }
        }

        $result = $this->buildResultRows($groupKeyToPairs, $yearlyByStudentSubject, $quarterGradesByStudentSubject);

        return response()->json([
            'success' => true,
            'data' => $result,
        ]);
    }

    private function buildResultRows(array $groupKeyToPairs, array $yearlyByStudentSubject, array $quarterGradesByStudentSubject): array
    {
        $result = [];
        foreach ($groupKeyToPairs as $row) {
            $totals = [];
            $passed = 0;
            $quarterStats = [1 => ['total' => 0, 'passed' => 0], 2 => ['total' => 0, 'passed' => 0], 3 => ['total' => 0, 'passed' => 0], 4 => ['total' => 0, 'passed' => 0]];

            foreach ($row['pairs'] as $studentId => $subjectId) {
                $key = strval($studentId) . '|' . strval($subjectId);
                $yearly = $yearlyByStudentSubject[$key] ?? null;
                $quarters = $quarterGradesByStudentSubject[$key] ?? [];

                foreach ([1, 2, 3, 4] as $q) {
                    $g = $quarters[$q] ?? null;
                    if ($g !== null && $g > 0) {
                        $quarterStats[$q]['total']++;
                        if ($g >= self::PASSING_GRADE) {
                            $quarterStats[$q]['passed']++;
                        }
                    }
                }

                if ($yearly === null) {
                    continue;
                }
                $totals[] = $yearly;
                if ($yearly >= self::PASSING_GRADE) {
                    $passed++;
                }
            }
            $totalStudents = count($totals);
            $passingPercentage = $totalStudents > 0 ? round($passed / $totalStudents * 100, 1) : 0;
            $averageGrade = $totalStudents > 0 ? round(array_sum($totals) / $totalStudents, 2) : null;

            $qPct = function ($total, $passed) {
                return $total > 0 ? round($passed / $total * 100, 1) : 0;
            };

            $result[] = [
                'grade_level' => $row['grade_level'],
                'subject_title' => $row['subject_title'],
                'total_students' => $totalStudents,
                'passed_count' => $passed,
                'passing_percentage' => $passingPercentage,
                'average_grade' => $averageGrade,
                'q1_total' => $quarterStats[1]['total'],
                'q1_passed' => $quarterStats[1]['passed'],
                'q1_passing_percentage' => $qPct($quarterStats[1]['total'], $quarterStats[1]['passed']),
                'q2_total' => $quarterStats[2]['total'],
                'q2_passed' => $quarterStats[2]['passed'],
                'q2_passing_percentage' => $qPct($quarterStats[2]['total'], $quarterStats[2]['passed']),
                'q3_total' => $quarterStats[3]['total'],
                'q3_passed' => $quarterStats[3]['passed'],
                'q3_passing_percentage' => $qPct($quarterStats[3]['total'], $quarterStats[3]['passed']),
                'q4_total' => $quarterStats[4]['total'],
                'q4_passed' => $quarterStats[4]['passed'],
                'q4_passing_percentage' => $qPct($quarterStats[4]['total'], $quarterStats[4]['passed']),
            ];
        }

        usort($result, function ($a, $b) {
            $gl = strcmp($a['grade_level'], $b['grade_level']);
            if ($gl !== 0) {
                return $gl;
            }
            return strcmp($a['subject_title'], $b['subject_title']);
        });

        return $result;
    }

    /**
     * Get proficiency stats per section: passing % per subject per section,
     * with count passed and gender breakdown (female/male/other) of those who passed.
     * Query params: academic_year (required), institution_id (optional), grade_level (optional), section_id (optional).
     */
    public function bySection(Request $request): JsonResponse
    {
        $request->validate([
            'academic_year' => 'required|string',
            'institution_id' => 'sometimes|string|exists:institutions,id',
            'grade_level' => 'sometimes|string',
            'section_id' => 'sometimes|string|exists:class_sections,id',
        ]);

        $user = $request->user();
        $academicYear = $request->academic_year;
        $gradeLevelFilter = $request->grade_level;
        $sectionIdFilter = $request->section_id;

        $institutionId = $request->filled('institution_id')
            ? $request->institution_id
            : $user->getDefaultInstitutionId();

        if (!$institutionId) {
            $userInstitutions = $user->userInstitutions()->pluck('institution_id');
            if ($userInstitutions->isEmpty()) {
                return response()->json([
                    'success' => true,
                    'data' => [],
                ]);
            }
            $institutionId = $userInstitutions->first();
        }

        $sectionsQuery = ClassSection::where('institution_id', $institutionId)
            ->where('academic_year', $academicYear);

        if ($gradeLevelFilter) {
            $sectionsQuery->where('grade_level', $gradeLevelFilter);
        }
        if ($sectionIdFilter) {
            $sectionsQuery->where('id', $sectionIdFilter);
        }

        $sections = $sectionsQuery->with(['subjects', 'studentSections' => function ($q) {
            $q->with('student:id,gender');
        }])->get();

        if ($sections->isEmpty()) {
            return response()->json([
                'success' => true,
                'data' => [],
            ]);
        }

        // Map: (section_id, subject_title) -> { section_title, grade_level, pairs: [student_id => [subject_id, gender]] }
        $groupKeyToData = [];

        foreach ($sections as $section) {
            $sectionId = $section->id;
            $sectionTitle = $section->title;
            $gradeLevel = $section->grade_level;

            foreach ($section->studentSections as $studentSection) {
                $student = $studentSection->student;
                if (!$student) {
                    continue;
                }
                $studentId = $student->id;
                $gender = $student->gender ?? 'other';
                $gender = strtolower(trim($gender));
                if (!in_array($gender, ['female', 'male', 'other'], true)) {
                    $gender = 'other';
                }

                foreach ($section->subjects as $subject) {
                    $title = $subject->title;
                    if ($subject->variant) {
                        $title = trim($title . ' - ' . $subject->variant);
                    }
                    $key = $sectionId . '|' . $title;
                    if (!isset($groupKeyToData[$key])) {
                        $groupKeyToData[$key] = [
                            'section_id' => $sectionId,
                            'section_title' => $sectionTitle,
                            'grade_level' => $gradeLevel,
                            'subject_title' => $title,
                            'pairs' => [],
                        ];
                    }
                    $groupKeyToData[$key]['pairs'][$studentId] = ['subject_id' => $subject->id, 'gender' => $gender];
                }
            }
        }

        $allStudentIds = [];
        $allSubjectIds = [];
        foreach ($groupKeyToData as $row) {
            foreach ($row['pairs'] as $sid => $info) {
                $allStudentIds[$sid] = true;
                $allSubjectIds[$info['subject_id']] = true;
            }
        }
        $allStudentIds = array_map('strval', array_keys($allStudentIds));
        $allSubjectIds = array_values(array_unique(array_map('strval', array_values($allSubjectIds))));

        if (empty($allStudentIds) || empty($allSubjectIds)) {
            return response()->json([
                'success' => true,
                'data' => $this->buildBySectionResultRows($groupKeyToData, [], []),
            ]);
        }

        $grades = StudentRunningGrade::whereIn('student_id', $allStudentIds)
            ->whereIn('subject_id', $allSubjectIds)
            ->where('academic_year', $academicYear)
            ->get();

        $yearlyByStudentSubject = [];
        $quarterGradesByStudentSubject = [];
        foreach ($grades->groupBy('student_id') as $studentId => $studentGrades) {
            foreach ($studentGrades->groupBy('subject_id') as $subjectId => $rows) {
                $quarterGrades = [];
                foreach ($rows as $row) {
                    $q = (int) $row->quarter;
                    $val = $row->final_grade ?? $row->grade;
                    $quarterGrades[$q] = $val !== null ? (float) $val : null;
                }
                $valid = array_filter($quarterGrades, fn($v) => $v !== null && $v > 0);
                $yearly = count($valid) > 0 ? array_sum($valid) / count($valid) : null;
                $key = strval($studentId) . '|' . strval($subjectId);
                $yearlyByStudentSubject[$key] = $yearly;
                $quarterGradesByStudentSubject[$key] = $quarterGrades;
            }
        }

        $result = $this->buildBySectionResultRows($groupKeyToData, $yearlyByStudentSubject, $quarterGradesByStudentSubject);

        return response()->json([
            'success' => true,
            'data' => $result,
        ]);
    }

    private function buildBySectionResultRows(array $groupKeyToData, array $yearlyByStudentSubject, array $quarterGradesByStudentSubject): array
    {
        $result = [];
        $qPct = function ($total, $passed) {
            return $total > 0 ? round($passed / $total * 100, 1) : 0;
        };

        foreach ($groupKeyToData as $row) {
            $totals = [];
            $passed = 0;
            $passedFemale = 0;
            $passedMale = 0;
            $passedOther = 0;
            $quarterStats = [1 => ['total' => 0, 'passed' => 0], 2 => ['total' => 0, 'passed' => 0], 3 => ['total' => 0, 'passed' => 0], 4 => ['total' => 0, 'passed' => 0]];

            foreach ($row['pairs'] as $studentId => $info) {
                $subjectId = $info['subject_id'];
                $gender = $info['gender'];
                $key = strval($studentId) . '|' . strval($subjectId);
                $yearly = $yearlyByStudentSubject[$key] ?? null;
                $quarters = $quarterGradesByStudentSubject[$key] ?? [];

                foreach ([1, 2, 3, 4] as $q) {
                    $g = $quarters[$q] ?? null;
                    if ($g !== null && $g > 0) {
                        $quarterStats[$q]['total']++;
                        if ($g >= self::PASSING_GRADE) {
                            $quarterStats[$q]['passed']++;
                        }
                    }
                }

                if ($yearly === null) {
                    continue;
                }
                $totals[] = $yearly;
                if ($yearly >= self::PASSING_GRADE) {
                    $passed++;
                    if ($gender === 'female') {
                        $passedFemale++;
                    } elseif ($gender === 'male') {
                        $passedMale++;
                    } else {
                        $passedOther++;
                    }
                }
            }

            $totalStudents = count($totals);
            $passingPercentage = $totalStudents > 0 ? round($passed / $totalStudents * 100, 1) : 0;
            $averageGrade = $totalStudents > 0 ? round(array_sum($totals) / $totalStudents, 2) : null;

            $result[] = [
                'section_id' => $row['section_id'],
                'section_title' => $row['section_title'],
                'grade_level' => $row['grade_level'],
                'subject_title' => $row['subject_title'],
                'total_students' => $totalStudents,
                'passed_count' => $passed,
                'passing_percentage' => $passingPercentage,
                'average_grade' => $averageGrade,
                'passed_female' => $passedFemale,
                'passed_male' => $passedMale,
                'passed_other' => $passedOther,
                'q1_total' => $quarterStats[1]['total'],
                'q1_passed' => $quarterStats[1]['passed'],
                'q1_passing_percentage' => $qPct($quarterStats[1]['total'], $quarterStats[1]['passed']),
                'q2_total' => $quarterStats[2]['total'],
                'q2_passed' => $quarterStats[2]['passed'],
                'q2_passing_percentage' => $qPct($quarterStats[2]['total'], $quarterStats[2]['passed']),
                'q3_total' => $quarterStats[3]['total'],
                'q3_passed' => $quarterStats[3]['passed'],
                'q3_passing_percentage' => $qPct($quarterStats[3]['total'], $quarterStats[3]['passed']),
                'q4_total' => $quarterStats[4]['total'],
                'q4_passed' => $quarterStats[4]['passed'],
                'q4_passing_percentage' => $qPct($quarterStats[4]['total'], $quarterStats[4]['passed']),
            ];
        }

        usort($result, function ($a, $b) {
            $sec = strcmp($a['section_title'], $b['section_title']);
            if ($sec !== 0) {
                return $sec;
            }
            return strcmp($a['subject_title'], $b['subject_title']);
        });

        return $result;
    }
}
