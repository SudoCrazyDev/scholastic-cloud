<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\AuthorizesModuleAccess;
use App\Models\ClassSection;
use App\Models\ReportCardPublication;
use App\Models\StudentSection;
use App\Support\AcademicYear;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Publishing a learner's report card to the student portal, and taking it back.
 *
 * The staff side of `MyReportCardController`. A card is the school's working
 * copy until a teacher publishes it here; the student sees nothing before then.
 *
 * ## Who may publish
 *
 * The section's adviser, or anyone the school has given Manage on the module
 * that prints the card — Consolidated Grades for every type, plus MATATAG
 * Progress or the DepEd Performance Report for their own cards. Publishing
 * hands the card to the family, which is a decision about the card rather than
 * about a mark, so it needs no grade-writing permission of its own.
 *
 * Routes carry no `module:` middleware: the check depends on the section (its
 * school and its adviser), which only the controller knows.
 */
class ReportCardPublicationController extends Controller
{
    use AuthorizesModuleAccess;

    /** The module whose Manage, besides Consolidated Grades, may publish each type. */
    private const TYPE_MODULES = [
        ReportCardPublication::TYPE_REPORT_CARD => null,
        ReportCardPublication::TYPE_PERFORMANCE_REPORT => 'deped-performance-report',
        ReportCardPublication::TYPE_MATATAG => 'matatag-grading',
    ];

    /**
     * Which learners in a section have this card published, for the toggle on
     * each row.
     */
    public function index(Request $request): JsonResponse
    {
        $request->validate([
            'class_section_id' => 'required|string',
            'card_type' => ['required', Rule::in(ReportCardPublication::TYPES)],
        ]);

        $cardType = (string) $request->input('card_type');

        if ($deny = $this->resolveSection($request, (string) $request->input('class_section_id'), $cardType, 'view', $section)) {
            return $deny;
        }

        $academicYear = AcademicYear::forSection($section);

        $rows = ReportCardPublication::query()
            ->with('publishedBy:id,first_name,last_name')
            ->where('class_section_id', $section->id)
            ->where('academic_year', $academicYear)
            ->where('card_type', $cardType)
            ->get();

        $published = [];
        foreach ($rows as $row) {
            $publisher = $row->publishedBy;
            $published[$row->student_id] = [
                'published_at' => $row->created_at?->toIso8601String(),
                'published_by' => $publisher ? trim($publisher->first_name.' '.$publisher->last_name) : null,
            ];
        }

        return response()->json([
            'success' => true,
            'data' => [
                'academic_year' => $academicYear,
                'card_type' => $cardType,
                'published' => (object) $published,
                'can_publish' => $this->canPublish($request, $section, $cardType),
            ],
        ]);
    }

    /**
     * Publish or unpublish one or more learners' cards.
     *
     * Bulk so "publish the whole class" is one request, and so one code path
     * holds the roster check.
     */
    public function update(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'class_section_id' => 'required|string',
            'card_type' => ['required', Rule::in(ReportCardPublication::TYPES)],
            'student_ids' => 'required|array|min:1|max:200',
            'student_ids.*' => 'required|uuid',
            'published' => 'required|boolean',
        ]);

        $cardType = $validated['card_type'];

        if ($deny = $this->resolveSection($request, $validated['class_section_id'], $cardType, 'publish', $section)) {
            return $deny;
        }

        $academicYear = AcademicYear::forSection($section);

        // A learner id in a request body is not proof the learner is in this
        // section. Without this a teacher could publish any card in the school.
        $studentIds = StudentSection::query()
            ->where('section_id', $section->id)
            ->where('academic_year', $academicYear)
            ->where('is_active', true)
            ->whereIn('student_id', array_unique($validated['student_ids']))
            ->pluck('student_id')
            ->all();

        $changed = 0;

        DB::transaction(function () use ($validated, $studentIds, $section, $academicYear, $cardType, $request, &$changed) {
            $scope = fn () => ReportCardPublication::query()
                ->where('class_section_id', $section->id)
                ->where('academic_year', $academicYear)
                ->where('card_type', $cardType);

            if (! $validated['published']) {
                $changed = $scope()->whereIn('student_id', $studentIds)->delete();

                return;
            }

            $already = $scope()->whereIn('student_id', $studentIds)->pluck('student_id')->all();

            foreach (array_diff($studentIds, $already) as $studentId) {
                ReportCardPublication::create([
                    'institution_id' => $section->institution_id,
                    'student_id' => $studentId,
                    'class_section_id' => $section->id,
                    'academic_year' => $academicYear,
                    'card_type' => $cardType,
                    'published_by' => $request->user()->id,
                ]);
                $changed++;
            }
        });

        return response()->json([
            'success' => true,
            'message' => $validated['published'] ? 'Report cards published.' : 'Report cards unpublished.',
            'data' => ['changed' => $changed, 'skipped' => count($validated['student_ids']) - count($studentIds)],
        ]);
    }

    /**
     * The section a request names, scoped to the caller's schools, or a
     * response to send.
     *
     * @param  'view'|'publish'  $ability
     * @param  ClassSection|null  $section  out-param: the resolved section
     */
    private function resolveSection(
        Request $request,
        string $sectionId,
        string $cardType,
        string $ability,
        ?ClassSection &$section,
    ): ?JsonResponse {
        if ($deny = $this->denyUnlessStaff($request)) {
            return $deny;
        }

        $user = $this->staffUser($request);

        $query = ClassSection::query()->whereKey($sectionId);

        // Scoped in the query, so another school's section is never in memory.
        if (! $user->hasFullAccess()) {
            $query->whereIn('institution_id', $this->callerInstitutionIds($request));
        }

        $section = $query->first();

        if (! $section) {
            return response()->json(['success' => false, 'message' => 'Section not found'], 404);
        }

        $allowed = $ability === 'publish'
            ? $this->canPublish($request, $section, $cardType)
            : $this->canSee($request, $section, $cardType);

        return $allowed
            ? null
            : $this->forbidden(
                'Only the section\'s adviser, or someone the school lets manage its report cards, '
                .'can publish them to students.'
            );
    }

    private function canPublish(Request $request, ClassSection $section, string $cardType): bool
    {
        return $this->holds($request, $section, $cardType, 'manage');
    }

    private function canSee(Request $request, ClassSection $section, string $cardType): bool
    {
        return $this->holds($request, $section, $cardType, 'view');
    }

    private function holds(Request $request, ClassSection $section, string $cardType, string $ability): bool
    {
        $user = $this->staffUser($request);
        $institutionId = $section->institution_id;

        if ($user->hasFullAccess() || $section->adviser === $user->id) {
            return true;
        }

        if ($user->hasModuleAccess('consolidated-grades', $ability, $institutionId)) {
            return true;
        }

        $module = self::TYPE_MODULES[$cardType] ?? null;

        return $module !== null && $user->hasModuleAccess($module, $ability, $institutionId);
    }
}
