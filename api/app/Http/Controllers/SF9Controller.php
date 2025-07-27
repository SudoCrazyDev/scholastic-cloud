<?php

namespace App\Http\Controllers;

use App\Models\Student;
use App\Models\StudentRunningGrade;
use App\Models\CoreValueMarking;
use App\Models\RealtimeAttendance;
use App\Models\StudentSection;
use App\Models\ClassSection;
use App\Models\Institution;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

class SF9Controller extends Controller
{
    /**
     * Generate SF9 data for a specific student
     */
    public function generate(Request $request): JsonResponse
    {
        $request->validate([
            'student_id' => 'required|string|exists:students,id',
            'academic_year' => 'required|string',
            'institution_id' => 'required|string|exists:institutions,id',
        ]);

        $studentId = $request->student_id;
        $academicYear = $request->academic_year;
        $institutionId = $request->institution_id;

        try {
            // Get student information
            $student = Student::findOrFail($studentId);
            
            // Get institution information
            $institution = Institution::findOrFail($institutionId);

            // Get student's class sections for the academic year
            $studentSections = StudentSection::where('student_id', $studentId)
                ->where('academic_year', $academicYear)
                ->where('is_active', true)
                ->with(['classSection.institution'])
                ->get();

            // Get academic performance (grades) for all quarters
            $academicPerformance = StudentRunningGrade::where('student_id', $studentId)
                ->where('academic_year', $academicYear)
                ->with(['subject'])
                ->get()
                ->groupBy('quarter');

            // Get core values for all quarters
            $coreValues = CoreValueMarking::where('student_id', $studentId)
                ->where('academic_year', $academicYear)
                ->get()
                ->groupBy('quarter');

            // Get attendance records
            $attendanceRecords = RealtimeAttendance::where('person_name', 'LIKE', '%' . $student->first_name . '%' . $student->last_name . '%')
                ->orWhere('person_name', 'LIKE', '%' . $student->last_name . '%' . $student->first_name . '%')
                ->whereYear('auth_date', substr($academicYear, 0, 4))
                ->get()
                ->groupBy('auth_date');

            // Calculate attendance summary
            $attendanceSummary = $this->calculateAttendanceSummary($attendanceRecords);

            // Get enrollment history
            $enrollmentHistory = StudentSection::where('student_id', $studentId)
                ->with(['classSection.institution'])
                ->orderBy('academic_year', 'desc')
                ->get()
                ->groupBy('academic_year');

            $sf9Data = [
                'student' => [
                    'id' => $student->id,
                    'lrn' => $student->lrn,
                    'first_name' => $student->first_name,
                    'middle_name' => $student->middle_name,
                    'last_name' => $student->last_name,
                    'ext_name' => $student->ext_name,
                    'gender' => $student->gender,
                    'birthdate' => $student->birthdate,
                    'religion' => $student->religion,
                ],
                'institution' => [
                    'id' => $institution->id,
                    'title' => $institution->title,
                    'abbr' => $institution->abbr,
                    'address' => $institution->address,
                    'division' => $institution->division,
                    'region' => $institution->region,
                    'gov_id' => $institution->gov_id,
                ],
                'current_academic_year' => $academicYear,
                'current_sections' => $studentSections->map(function ($studentSection) {
                    return [
                        'section_id' => $studentSection->section_id,
                        'grade_level' => $studentSection->classSection->grade_level,
                        'section_title' => $studentSection->classSection->title,
                        'academic_year' => $studentSection->academic_year,
                        'is_promoted' => $studentSection->is_promoted,
                    ];
                }),
                'academic_performance' => $academicPerformance->map(function ($quarterGrades) {
                    return $quarterGrades->map(function ($grade) {
                        return [
                            'subject_id' => $grade->subject_id,
                            'subject_title' => $grade->subject->title,
                            'quarter' => $grade->quarter,
                            'grade' => $grade->grade,
                            'final_grade' => $grade->final_grade,
                        ];
                    });
                }),
                'core_values' => $coreValues->map(function ($quarterValues) {
                    return $quarterValues->map(function ($value) {
                        return [
                            'core_value' => $value->core_value,
                            'behavior_statement' => $value->behavior_statement,
                            'marking' => $value->marking,
                            'quarter' => $value->quarter,
                        ];
                    });
                }),
                'attendance_summary' => $attendanceSummary,
                'enrollment_history' => $enrollmentHistory->map(function ($yearSections) {
                    return $yearSections->map(function ($studentSection) {
                        return [
                            'academic_year' => $studentSection->academic_year,
                            'grade_level' => $studentSection->classSection->grade_level,
                            'section_title' => $studentSection->classSection->title,
                            'institution_name' => $studentSection->classSection->institution->title,
                            'is_promoted' => $studentSection->is_promoted,
                        ];
                    });
                }),
            ];

            return response()->json([
                'success' => true,
                'data' => $sf9Data,
                'message' => 'SF9 data generated successfully',
            ]);

        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to generate SF9 data: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Calculate attendance summary from attendance records
     */
    private function calculateAttendanceSummary($attendanceRecords): array
    {
        $totalDays = $attendanceRecords->count();
        $presentDays = 0;
        $absentDays = 0;
        $lateDays = 0;

        foreach ($attendanceRecords as $date => $records) {
            $hasCheckIn = $records->where('direction', 'in')->count() > 0;
            $hasCheckOut = $records->where('direction', 'out')->count() > 0;

            if ($hasCheckIn && $hasCheckOut) {
                $presentDays++;
            } elseif ($hasCheckIn && !$hasCheckOut) {
                $lateDays++;
            } else {
                $absentDays++;
            }
        }

        return [
            'total_days' => $totalDays,
            'present_days' => $presentDays,
            'absent_days' => $absentDays,
            'late_days' => $lateDays,
            'attendance_rate' => $totalDays > 0 ? round(($presentDays / $totalDays) * 100, 2) : 0,
        ];
    }

    /**
     * Get available academic years for a student
     */
    public function getAcademicYears(Request $request): JsonResponse
    {
        $request->validate([
            'student_id' => 'required|string|exists:students,id',
        ]);

        $studentId = $request->student_id;

        try {
            $academicYears = StudentSection::where('student_id', $studentId)
                ->distinct()
                ->pluck('academic_year')
                ->sort()
                ->values();

            return response()->json([
                'success' => true,
                'data' => $academicYears,
                'message' => 'Academic years retrieved successfully',
            ]);

        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to retrieve academic years: ' . $e->getMessage(),
            ], 500);
        }
    }
} 