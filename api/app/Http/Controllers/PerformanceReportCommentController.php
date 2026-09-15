<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\AuthorizesModuleAccess;
use App\Models\ClassSection;
use App\Models\StudentAdviserComment;
use App\Models\StudentSection;
use App\Support\AcademicYear;
use App\Support\GradingPeriods;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * The adviser's comment to a parent, one per term, for DepEd's Annex G.
 *
 * The form (DO 15, s. 2026) prints a TEACHER'S COMMENTS/REMARKS box per term.
 * Before this, those boxes printed blank and an adviser wrote fifty of them by
 * hand after every card run.
 *
 * ## This is the module's first API surface, and it is the one that needed gating
 *
 * Everything else the performance report does is a read through hooks that
 * already carry their own module checks, which is why the module doc called the
 * absence of a route here its one weak spot. This route closes it: the group in
 * `routes/api.php` carries `feature:deped-performance-report`, so a school that
 * has not been switched on cannot reach it at all — `EnsureFeatureEnabled`
 * deliberately does not honour the super-administrator wildcard — and
 * `module:deped-performance-report,manage` is then the school's own decision
 * about which of its staff may write on a parent's card.
 *
 * ## Writing a comment is not writing a grade
 *
 * The module gained `manage` for this and only this. Nothing here can change a
 * mark, and a `manage` grant must not be read as permission to correct one:
 * the marks stay owned by Consolidated Grades. See the module doc.
 */
class PerformanceReportCommentController extends Controller
{
    use AuthorizesModuleAccess;

    private const MODULE = 'deped-performance-report';

    /**
     * A soft cap, enforced here and mirrored by a live counter in the client.
     *
     * DepEd draws a fixed box and unbounded prose has no correct rendering in
     * it — shrink it until it is unreadable, clip it, or spill onto a page
     * nobody expects. Capping at the point of entry is the only one of the
     * three the adviser can see happening.
     *
     * 300 is a decision, not a placeholder: the box is a little over half the
     * width of an A4 landscape sheet and about three lines tall at a legible
     * size, which is roughly this much. The client reads the figure from this
     * endpoint rather than carrying its own copy, so raising it is a one-line
     * change here.
     */
    public const MAX_LENGTH = 300;

    /**
     * Every comment recorded for a section in a year.
     *
     * The whole section rather than one learner on purpose: the tab shows the
     * adviser who is still missing a comment, which is the question they
     * actually have before a card run.
     */
    public function index(Request $request): JsonResponse
    {
        if ($deny = $this->resolveSection($request, (string) $request->input('class_section_id'), $section)) {
            return $deny;
        }

        $academicYear = $this->resolveAcademicYear($request, $section);

        $rows = StudentAdviserComment::query()
            ->with('recordedBy:id,first_name,last_name')
            ->where('class_section_id', $section->id)
            ->where('academic_year', $academicYear)
            ->get();

        $comments = [];

        foreach ($rows as $row) {
            $writer = $row->recordedBy;

            $comments[$row->student_id.':'.$row->quarter] = [
                'comment' => $row->comment,
                'updated_at' => $row->updated_at?->toIso8601String(),
                'recorded_by' => $writer
                    ? trim($writer->first_name.' '.$writer->last_name)
                    : null,
            ];
        }

        return response()->json([
            'success' => true,
            'data' => [
                'academic_year' => $academicYear,
                'max_length' => self::MAX_LENGTH,
                'comments' => (object) $comments,
                'can_manage' => $request->user()->hasModuleAccess(
                    self::MODULE, 'manage', $section->institution_id
                ),
            ],
        ]);
    }

    /**
     * Write comments for one or more learners.
     *
     * Bulk rather than one at a time because the adviser works down a roster,
     * and one code path means one set of guards. **An empty comment deletes the
     * row** rather than storing an empty string, so "has this learner been
     * written up yet" stays a question the database can answer — and so an
     * adviser who clears a box gets a blank printed box back, which is what
     * clearing it means.
     */
    public function bulkUpsert(Request $request): JsonResponse
    {
        if ($deny = $this->resolveSection($request, (string) $request->input('class_section_id'), $section, 'manage')) {
            return $deny;
        }

        $academicYear = $this->resolveAcademicYear($request, $section);

        $request->validate([
            'comments' => 'present|array|max:200',
            'comments.*.student_id' => 'required|uuid',
            'comments.*.quarter' => 'required|string',
            'comments.*.comment' => 'nullable|string|max:'.self::MAX_LENGTH,
        ]);

        $entries = $request->input('comments', []);

        if ($entries === []) {
            return response()->json([
                'success' => true,
                'message' => 'Nothing to save.',
                'data' => ['written' => 0, 'cleared' => 0],
            ]);
        }

        // Which periods this year actually has. A four-quarter year has no
        // fourth column on this form, but the storage is shared and a school
        // may be mid-migration, so the year decides rather than the form.
        $periodType = GradingPeriods::forInstitution($section->institution_id, $academicYear);
        $validPeriods = GradingPeriods::values($periodType);

        // A learner id in a request body is not proof the learner is in this
        // section. Without this an adviser could write on any card in the
        // school by editing one field — the scoping in this repo is
        // per-controller and there is no global scope catching it.
        $roster = StudentSection::query()
            ->where('section_id', $section->id)
            ->where('academic_year', $academicYear)
            ->where('is_active', true)
            ->pluck('student_id')
            ->all();

        $rosterIds = array_flip($roster);

        $written = 0;
        $cleared = 0;

        DB::transaction(function () use ($entries, $section, $academicYear, $validPeriods, $rosterIds, $request, &$written, &$cleared) {
            foreach ($entries as $entry) {
                $studentId = (string) $entry['student_id'];
                $quarter = (string) $entry['quarter'];
                $comment = trim((string) ($entry['comment'] ?? ''));

                if (! isset($rosterIds[$studentId]) || ! in_array($quarter, $validPeriods, true)) {
                    continue;
                }

                if ($comment === '') {
                    $cleared += StudentAdviserComment::query()
                        ->where('student_id', $studentId)
                        ->where('academic_year', $academicYear)
                        ->where('quarter', $quarter)
                        ->delete();

                    continue;
                }

                StudentAdviserComment::updateOrCreate(
                    [
                        'student_id' => $studentId,
                        'academic_year' => $academicYear,
                        'quarter' => $quarter,
                    ],
                    [
                        // Re-stamped on every write: a learner who moved
                        // sections mid-year keeps one comment per term, and it
                        // belongs to whoever last wrote it.
                        'class_section_id' => $section->id,
                        'comment' => $comment,
                        'recorded_by' => $request->user()->id,
                    ]
                );

                $written++;
            }
        });

        return response()->json([
            'success' => true,
            'message' => 'Comments saved.',
            'data' => ['written' => $written, 'cleared' => $cleared],
        ]);
    }

    /**
     * The section a request names, scoped to the caller, or a response to send.
     *
     * Deliberately a copy of the shape `ResolvesMatatagSection` uses rather than
     * a shared trait: the two modules gate on different module slugs and this
     * one has no catalog pin to resolve, and a trait parameterised over both
     * would be harder to audit than two short methods. The three questions it
     * answers are the same ones, and they are the ones
     * `tests/Feature/SecurityAuthorizationTest.php` exists for.
     *
     * @param  ClassSection|null  $section  out-param: the resolved section
     * @return JsonResponse|null response to return, or null to continue
     */
    private function resolveSection(
        Request $request,
        string $sectionId,
        ?ClassSection &$section,
        string $ability = 'view',
    ): ?JsonResponse {
        if ($deny = $this->denyUnlessStaff($request)) {
            return $deny;
        }

        $user = $this->staffUser($request);

        $query = ClassSection::query()->whereKey($sectionId);

        // Scoped in the query rather than after it, so another school's row is
        // never in memory to be judged.
        if (! $user->hasFullAccess()) {
            $query->whereIn('institution_id', $this->callerInstitutionIds($request));
        }

        $section = $query->first();

        if (! $section) {
            return response()->json([
                'success' => false,
                'message' => 'Section not found',
            ], 404);
        }

        if (! $user->hasModuleAccess(self::MODULE, $ability, $section->institution_id)) {
            return $this->forbidden('You do not have access to this module');
        }

        // `manage` says what a person may do to a section they can reach;
        // `view-all` says which sections those are. A school grants an adviser
        // the first without the second.
        $canReach = $user->hasFullAccess()
            || $user->hasModuleAccess(self::MODULE, 'view-all', $section->institution_id)
            || $section->adviser === $user->id;

        if (! $canReach) {
            return $this->forbidden(
                'You can only work on the sections you advise. Ask for the "Print for every section '
                .'in the school" permission to reach the others.'
            );
        }

        return null;
    }

    /**
     * The academic year a request acts on.
     *
     * Never derived inline — CLAUDE.md forbids it, and a comment saved against
     * the wrong year vanishes from the card it was written for.
     */
    private function resolveAcademicYear(Request $request, ClassSection $section): string
    {
        $requested = $request->input('academic_year');

        return is_string($requested) && $requested !== ''
            ? $requested
            : AcademicYear::forSection($section);
    }
}
