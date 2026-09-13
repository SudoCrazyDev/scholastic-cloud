<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\ResolvesMatatagSection;
use App\Models\MatatagLearningArea;
use App\Models\MatatagSectionCurriculum;
use App\Services\Matatag\ProgressReport;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * What a parent is handed: the progress report card and the PACE forms behind
 * it.
 *
 * Read-only, composed from what the other five endpoints record, and the last
 * step before anything is printed. `App\Services\Matatag\ProgressReport` does
 * the composing so the PDF renderer and the .xlsx export can reach the same
 * payload without going through HTTP; this controller is the access gate and
 * nothing else.
 *
 * `view` rather than `manage`: printing a report card is reading. A principal
 * with `view-all` prints the school's, an adviser prints their own section's,
 * and neither needs the ability to change a mark to do it.
 */
class MatatagProgressReportController extends Controller
{
    use ResolvesMatatagSection;

    public function __construct(private readonly ProgressReport $report) {}

    /**
     * A section's report cards.
     *
     * Naming a `learning_area_id` also attaches that one PACE form for every
     * learner — the "print the class's Reading & Literacy forms" job. Without
     * one, the cards come back on their own; see `ProgressReport::paceScope()`
     * for why that is not an oversight.
     */
    public function index(Request $request): JsonResponse
    {
        if ($deny = $this->resolveSection($request, (string) $request->input('class_section_id'), $section)) {
            return $deny;
        }

        $academicYear = $this->resolveAcademicYear($request, $section);

        if ($deny = $this->resolvePin($section, $academicYear, $pin)) {
            return $deny;
        }

        if ($deny = $this->resolveOptionalArea($request, $pin, $area)) {
            return $deny;
        }

        return response()->json([
            'success' => true,
            'data' => $this->report->compose(
                $section,
                $pin,
                $academicYear,
                $this->sectionRoster($section, $academicYear),
                $area,
            ),
        ]);
    }

    /**
     * One learner's card and all five of their PACE forms.
     *
     * The roster is filtered rather than the student fetched: a student id in a
     * URL proves nothing about who may read it, and the only thing that does is
     * membership of a section this caller has already been cleared for. This is
     * the clause `SF9Controller::denyUnlessOwnStudent()` was written to add
     * after any holder of `consolidated-grades.view` turned out to be able to
     * print any student's card from any school — here it falls out of reusing
     * the section's own roster instead of trusting the id.
     */
    public function show(Request $request, string $studentId): JsonResponse
    {
        if ($deny = $this->resolveSection($request, (string) $request->input('class_section_id'), $section)) {
            return $deny;
        }

        $academicYear = $this->resolveAcademicYear($request, $section);

        if ($deny = $this->resolvePin($section, $academicYear, $pin)) {
            return $deny;
        }

        if ($deny = $this->resolveOptionalArea($request, $pin, $area)) {
            return $deny;
        }

        $roster = $this->sectionRoster($section, $academicYear)
            ->filter(fn ($student) => $student->id === $studentId)
            ->values();

        if ($roster->isEmpty()) {
            return response()->json([
                'success' => false,
                'message' => "That learner is not on this section's roster for {$academicYear}.",
                'code' => 'student_not_on_roster',
            ], 404);
        }

        return response()->json([
            'success' => true,
            'data' => $this->report->compose($section, $pin, $academicYear, $roster, $area),
        ]);
    }

    // -----------------------------------------------------------------

    /**
     * The learning area a request names, if it names one, resolved **within
     * the section's pinned version**.
     *
     * Scoped rather than fetched-then-checked, same as the grid: an area id
     * from another catalog is simply not found, so there is no moment at which
     * the wrong curriculum is in hand.
     *
     * @param  MatatagLearningArea|null  $area  out-param; null means every area
     */
    private function resolveOptionalArea(
        Request $request,
        MatatagSectionCurriculum $pin,
        ?MatatagLearningArea &$area,
    ): ?JsonResponse {
        $requested = $request->input('learning_area_id');
        $area = null;

        if (! is_string($requested) || $requested === '') {
            return null;
        }

        $area = MatatagLearningArea::where('curriculum_version_id', $pin->curriculum_version_id)
            ->whereKey($requested)
            ->first();

        if (! $area) {
            return response()->json([
                'success' => false,
                'message' => 'That learning area is not part of the catalog this section reports '
                    .'against.',
                'code' => 'area_not_in_curriculum',
            ], 404);
        }

        return null;
    }
}
