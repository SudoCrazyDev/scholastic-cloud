<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\ResolvesMatatagSection;
use App\Services\Matatag\TermAttendance;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The attendance block of the progress report.
 *
 * Read-only, and there is no sibling that writes. The figures come from
 * `student_attendances` and `school_days`, which the school already maintains;
 * a MATATAG attendance entry screen would be a second place to type the same
 * numbers and therefore a second set of numbers.
 */
class MatatagAttendanceController extends Controller
{
    use ResolvesMatatagSection;

    public function __construct(private readonly TermAttendance $attendance) {}

    public function index(Request $request): JsonResponse
    {
        if ($deny = $this->resolveSection($request, (string) $request->input('class_section_id'), $section)) {
            return $deny;
        }

        $academicYear = $this->resolveAcademicYear($request, $section);

        if ($deny = $this->resolvePin($section, $academicYear, $pin)) {
            return $deny;
        }

        $studentId = $request->input('student_id');

        if (is_string($studentId) && $studentId !== '') {
            // Narrowed to one learner, but still only through this section's
            // roster — a student id alone proves nothing about who may read it.
            $roster = $this->sectionRoster($section, $academicYear);

            if (! $roster->contains('id', $studentId)) {
                return response()->json([
                    'success' => false,
                    'message' => "That learner is not on this section's roster for {$academicYear}.",
                    'code' => 'student_not_on_roster',
                ], 404);
            }

            return response()->json([
                'success' => true,
                'data' => $this->attendance->forStudent($section, $academicYear, $studentId),
            ]);
        }

        return response()->json([
            'success' => true,
            'data' => $this->attendance->forSection(
                $section,
                $academicYear,
                $this->sectionRoster($section, $academicYear),
            ),
        ]);
    }
}
