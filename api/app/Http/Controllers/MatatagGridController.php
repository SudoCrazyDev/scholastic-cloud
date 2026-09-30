<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\ResolvesMatatagSection;
use App\Models\ClassSection;
use App\Models\MatatagCompetencyRating;
use App\Models\MatatagCompetencySlot;
use App\Models\MatatagLearningArea;
use App\Models\MatatagSectionCurriculum;
use App\Services\Matatag\CurriculumTree;
use App\Support\MatatagTerms;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * The descriptor grid: learners down, competency slots across.
 *
 * This is the module. Everything else prints what a teacher types here.
 */
class MatatagGridController extends Controller
{
    use ResolvesMatatagSection;

    /** One save from a teacher filling a 91-column block for 50 learners. */
    private const MAX_RATINGS_PER_REQUEST = 6000;

    public function __construct(private readonly CurriculumTree $tree) {}

    /**
     * One (learning area, term) block: its columns, its learners, and every
     * descriptor already recorded in it.
     *
     * **Deliberately not paginated.** The worst case is Term 3 Reading &
     * Literacy at 91 columns × 50 learners = 4,550 descriptors, which is about
     * 250 KB — and a paginated grid cannot fill a column or paste one, which
     * is how a teacher actually works. Area × term already bounds it; that is
     * the pagination.
     */
    public function show(Request $request): JsonResponse
    {
        if ($deny = $this->resolveSection($request, (string) $request->input('class_section_id'), $section, 'view', true)) {
            return $deny;
        }

        if ($deny = $this->resolveTerm($request, $term)) {
            return $deny;
        }

        $academicYear = $this->resolveAcademicYear($request, $section);

        if ($deny = $this->resolvePin($section, $academicYear, $pin)) {
            return $deny;
        }

        $markable = $this->markableAreaIds($request, $section, $academicYear);

        if ($deny = $this->denyUnlessAnyArea($markable, $academicYear)) {
            return $deny;
        }

        if ($deny = $this->resolveArea($request, $pin, $markable, $area)) {
            return $deny;
        }

        $columns = $this->tree->columnsFor($area, $term);
        $roster = $this->sectionRoster($section, $academicYear);

        $ratings = [];

        if ($columns !== [] && $roster->isNotEmpty()) {
            $rows = MatatagCompetencyRating::query()
                ->where('class_section_id', $section->id)
                ->where('academic_year', $academicYear)
                ->whereIn('slot_id', array_column($columns, 'slot_id'))
                ->get(['student_id', 'slot_id', 'descriptor']);

            foreach ($rows as $row) {
                // Keyed rather than listed: the client patches one cell per
                // keystroke, and finding it in a 4,550-element array on every
                // press is the difference between a grid that keeps up with a
                // fast typist and one that does not.
                $ratings[$row->student_id.':'.$row->slot_id] = $row->descriptor;
            }
        }

        return response()->json([
            'success' => true,
            'data' => [
                'section' => [
                    'id' => $section->id,
                    'title' => $section->title,
                    'grade_level' => $section->grade_level,
                    'adviser_id' => $section->adviser,
                ],
                'academic_year' => $academicYear,
                'term' => $term,
                'curriculum_version' => $this->tree->version($pin->curriculumVersion),
                // Every area of the pinned catalog, so the client can offer
                // the area selector without fetching the whole competency
                // tree. Five rows; the tree is a quarter of a megabyte.
                //
                // A subject teacher is offered only the areas they teach.
                'learning_areas' => MatatagLearningArea::where('curriculum_version_id', $pin->curriculum_version_id)
                    ->when($markable !== null, fn ($q) => $q->whereIn('id', $markable))
                    ->orderBy('sort_order')
                    ->get()
                    ->map(fn (MatatagLearningArea $a) => $this->tree->area($a))
                    ->all(),
                'learning_area' => $this->tree->area($area),
                // Null for the adviser, who reaches every area; otherwise the
                // areas this subject teacher may mark.
                'markable_learning_area_ids' => $markable,
                'domains' => $this->tree->domainsFor($area, $term),
                'slot_counts_by_term' => $this->tree->slotCountsByTerm($area),
                'columns' => $columns,
                'learners' => $roster->map(fn ($student) => [
                    'student_id' => $student->id,
                    'name' => $this->learnerName($student),
                    'display_name' => $this->learnerListName($student),
                    'last_name' => $student->last_name,
                    'first_name' => $student->first_name,
                    'gender' => $student->gender,
                ])->values()->all(),
                'ratings' => (object) $ratings,
                // `manage` marks every area the caller reaches; teaching the
                // area's linked subject marks that area without it.
                'can_manage' => $request->user()->hasModuleAccess(
                    self::MODULE, 'manage', $section->institution_id
                ) || in_array($area->id, $this->taughtAreaIds($request, $section, $academicYear), true),
                'counts' => [
                    'columns' => count($columns),
                    'learners' => $roster->count(),
                    'recorded' => count($ratings),
                ],
            ],
        ]);
    }

    /**
     * Write a batch of descriptors.
     *
     * There is no single-cell `PUT`, on purpose. One code path means one set of
     * guards; a second endpoint is a second place for one of them to be
     * forgotten. A client changing one cell posts a one-element array.
     *
     * Every check below is a real attack or a real teacher mistake, and the
     * order matters — each one narrows what the next is allowed to assume:
     *
     * 1. the section resolves *and* is institution-scoped, in one query
     * 2. the caller advises it, holds `view-all`, or teaches a subject linked
     *    to one of its learning areas
     * 3. it is opted in and enabled, or there is nothing to write against
     * 4. every slot belongs to **this section's pinned version** — the guard
     *    against writing Grade 2's catalog into a Grade 1 section, or a
     *    revision's slots into a section still mid-year on the old one
     * 5. every slot's term is the posted term, which stops a stale term
     *    selector in an open tab writing Term 3's work into Term 1
     * 6. a subject teacher's slots are all in the areas they teach — the
     *    guard that keeps the Mathematics teacher out of Reading & Literacy
     * 7. every learner is on this section's active roster for this year — the
     *    cross-tenant guard on the write path, and the one that matters most
     * 8. the descriptor is one of DepEd's five letters, or null to clear
     */
    public function bulkUpsert(Request $request): JsonResponse
    {
        // `view`, not `manage`: a linked subject teacher may mark their own
        // area without `manage`. Which areas the caller may write is settled
        // below, once the year is known.
        if ($deny = $this->resolveSection($request, (string) $request->input('class_section_id'), $section, 'view', true)) {
            return $deny;
        }

        if ($deny = $this->resolveTerm($request, $term)) {
            return $deny;
        }

        $academicYear = $this->resolveAcademicYear($request, $section);

        if ($deny = $this->resolvePin($section, $academicYear, $pin)) {
            return $deny;
        }

        // With `manage`: every area the caller reaches (null = all).
        // Without it: only the areas whose linked subject they teach.
        $canManage = $request->user()->hasModuleAccess(self::MODULE, 'manage', $section->institution_id);

        $markable = $canManage
            ? $this->markableAreaIds($request, $section, $academicYear)
            : $this->taughtAreaIds($request, $section, $academicYear);

        if ($canManage && ($deny = $this->denyUnlessAnyArea($markable, $academicYear))) {
            return $deny;
        }

        if ($markable === []) {
            return $this->forbidden(
                'You can view this grid but not mark it. Marking needs MATATAG Progress Manage on your '
                .'role, or the adviser linking a subject you teach to the learning area.'
            );
        }

        $request->validate([
            'ratings' => 'present|array|max:'.self::MAX_RATINGS_PER_REQUEST,
            'ratings.*.student_id' => 'required|uuid',
            'ratings.*.slot_id' => 'required|uuid',
            'ratings.*.descriptor' => 'nullable|string',
        ]);

        $ratings = $request->input('ratings', []);

        if ($ratings === []) {
            return response()->json([
                'success' => true,
                'message' => 'Nothing to save.',
                'data' => ['written' => 0, 'cleared' => 0],
            ]);
        }

        if ($error = $this->rejectBadSlots($ratings, $pin, $term, $slots)) {
            return $error;
        }

        if ($error = $this->rejectOtherAreas($slots, $markable)) {
            return $error;
        }

        if ($error = $this->rejectStrangers($ratings, $section, $academicYear)) {
            return $error;
        }

        if ($error = $this->rejectBadDescriptors($ratings, $pin->curriculumVersion?->instrumentKey())) {
            return $error;
        }

        return $this->write($request, $ratings, $section, $pin, $academicYear, $slots);
    }

    // -----------------------------------------------------------------

    /**
     * Every slot must belong to the section's pinned version and to the posted
     * term.
     *
     * Resolved in one query against the pinned version's own areas, so a slot
     * from any other catalog simply is not found — there is no comparison to
     * get backwards.
     *
     * @param  array<int, array<string, mixed>>  $ratings
     * @param  \Illuminate\Support\Collection|null  $slots  out-param, keyed by id
     */
    private function rejectBadSlots(
        array $ratings,
        MatatagSectionCurriculum $pin,
        int $term,
        &$slots,
    ): ?JsonResponse {
        $slotIds = array_values(array_unique(array_column($ratings, 'slot_id')));

        $slots = MatatagCompetencySlot::query()
            ->whereIn('matatag_competency_slots.id', $slotIds)
            ->whereIn(
                'matatag_competency_slots.learning_area_id',
                MatatagLearningArea::where('curriculum_version_id', $pin->curriculum_version_id)->select('id')
            )
            ->get()
            ->keyBy('id');

        $foreign = array_values(array_diff($slotIds, $slots->keys()->all()));

        if ($foreign !== []) {
            return response()->json([
                'success' => false,
                'message' => count($foreign).' of the competencies in this save do not belong to the '
                    ."catalog this section is reporting against ({$pin->curriculumVersion?->code}). "
                    .'Reload the grid.',
                'code' => 'slot_not_in_curriculum',
                'errors' => ['slot_id' => array_slice($foreign, 0, 10)],
            ], 422);
        }

        $wrongTerm = $slots->filter(fn (MatatagCompetencySlot $slot) => $slot->term !== $term);

        if ($wrongTerm->isNotEmpty()) {
            return response()->json([
                'success' => false,
                'message' => $wrongTerm->count().' of the competencies in this save belong to a '
                    ."different term than the {$term} it was sent for. This usually means the page "
                    .'was left open while the term was changed somewhere else; reload the grid.',
                'code' => 'slot_term_mismatch',
                'errors' => ['slot_id' => $wrongTerm->keys()->take(10)->all()],
            ], 422);
        }

        return null;
    }

    /**
     * A subject teacher may write only to the areas they teach.
     *
     * Checked per slot rather than trusting the grid the client loaded: the
     * area selector is a courtesy, and the request body is what is written.
     *
     * @param  \Illuminate\Support\Collection  $slots  keyed by id
     * @param  array<int, string>|null  $markable  null for the adviser
     */
    private function rejectOtherAreas($slots, ?array $markable): ?JsonResponse
    {
        if ($markable === null) {
            return null;
        }

        $outside = $slots->reject(
            fn (MatatagCompetencySlot $slot) => in_array($slot->learning_area_id, $markable, true)
        );

        if ($outside->isNotEmpty()) {
            return response()->json([
                'success' => false,
                'message' => $outside->count().' of the competencies in this save belong to a '
                    .'learning area you do not teach in this section. The adviser marks those.',
                'code' => 'area_not_yours',
                'errors' => ['slot_id' => $outside->keys()->take(10)->all()],
            ], 403);
        }

        return null;
    }

    /**
     * A subject teacher whose link belongs to another year reaches nothing in
     * this one.
     *
     * @param  array<int, string>|null  $markable
     */
    private function denyUnlessAnyArea(?array $markable, string $academicYear): ?JsonResponse
    {
        if ($markable === null || $markable !== []) {
            return null;
        }

        return $this->forbidden(
            'None of your subjects is linked to a learning area of this section for '
            .$academicYear.'. Ask the adviser to link it on the MATATAG Progress tab.'
        );
    }

    /**
     * Every learner must be on this section's active roster for this year.
     *
     * The cross-tenant guard on the write path. Without it a valid token plus
     * a guessed uuid writes a descriptor onto another school's learner, and
     * the row would carry *this* section's `institution_id`, so nothing
     * downstream would ever look wrong.
     *
     * @param  array<int, array<string, mixed>>  $ratings
     */
    private function rejectStrangers(array $ratings, ClassSection $section, string $academicYear): ?JsonResponse
    {
        $studentIds = array_values(array_unique(array_column($ratings, 'student_id')));

        $onRoster = DB::table('student_sections')
            ->where('section_id', $section->id)
            ->where('academic_year', $academicYear)
            ->where('is_active', true)
            ->whereIn('student_id', $studentIds)
            ->pluck('student_id')
            ->all();

        $strangers = array_values(array_diff($studentIds, $onRoster));

        if ($strangers !== []) {
            return response()->json([
                'success' => false,
                'message' => count($strangers).' of the learners in this save are not on this '
                    ."section's roster for {$academicYear}.",
                'code' => 'student_not_on_roster',
                'errors' => ['student_id' => array_slice($strangers, 0, 10)],
            ], 422);
        }

        return null;
    }

    /**
     * Every mark must be on the section's own scale — A-E for Grades 1-3,
     * CO/DV/BG for Kindergarten. The scale comes from the pinned catalog's
     * instrument, so a Kindergarten `A` is refused even though it is a valid
     * Grade 1 mark: it would print with no legend entry to explain it.
     *
     * @param  array<int, array<string, mixed>>  $ratings
     */
    private function rejectBadDescriptors(array $ratings, ?string $instrument): ?JsonResponse
    {
        $bad = [];

        foreach ($ratings as $rating) {
            $descriptor = $rating['descriptor'] ?? null;

            if ($descriptor === null || $descriptor === '') {
                continue;   // clearing a cell
            }

            if (! MatatagTerms::isValidDescriptor(is_string($descriptor) ? strtoupper($descriptor) : null, $instrument)) {
                $bad[] = $descriptor;
            }
        }

        if ($bad !== []) {
            return response()->json([
                'success' => false,
                'message' => 'A descriptor must be one of '
                    .implode(', ', MatatagTerms::descriptorLetters($instrument))
                    .'. There are no numbers in this instrument.',
                'code' => 'invalid_descriptor',
                'errors' => ['descriptor' => array_values(array_unique(array_slice($bad, 0, 10)))],
            ], 422);
        }

        return null;
    }

    /**
     * One transaction: clears, then upserts.
     *
     * Clearing **deletes the row**. There is no "no mark" sentinel and the
     * model has no SoftDeletes, because a trashed row would keep occupying the
     * unique (student, year, slot) slot and silently block the teacher from
     * re-marking that cell.
     *
     * @param  array<int, array<string, mixed>>  $ratings
     * @param  \Illuminate\Support\Collection  $slots
     */
    private function write(
        Request $request,
        array $ratings,
        ClassSection $section,
        MatatagSectionCurriculum $pin,
        string $academicYear,
        $slots,
    ): JsonResponse {
        $now = now();
        $userId = $request->user()->id;

        $rows = [];
        $clear = [];

        foreach ($ratings as $rating) {
            $descriptor = $rating['descriptor'] ?? null;
            $slot = $slots[$rating['slot_id']];

            if ($descriptor === null || $descriptor === '') {
                $clear[] = [$rating['student_id'], $rating['slot_id']];

                continue;
            }

            $rows[$rating['student_id'].':'.$rating['slot_id']] = [
                'id' => (string) Str::uuid7(),
                'institution_id' => $section->institution_id,
                'class_section_id' => $section->id,
                'student_id' => $rating['student_id'],
                'academic_year' => $academicYear,
                'slot_id' => $slot->id,
                'term' => $slot->term,
                'learning_area_id' => $slot->learning_area_id,
                'curriculum_version_id' => $pin->curriculum_version_id,
                'descriptor' => strtoupper($descriptor),
                'marked_by' => $userId,
                'marked_at' => $now,
                'created_at' => $now,
                'updated_at' => $now,
            ];
        }

        // Keyed above, so a payload that names the same cell twice — a
        // double-click on Save, a fill-down overlapping a manual edit —
        // reaches the database once. MySQL rejects an upsert whose own values
        // list repeats a unique key.
        $rows = array_values($rows);

        DB::transaction(function () use ($rows, $clear, $section, $academicYear, $pin, $now) {
            foreach (array_chunk($clear, 500) as $chunk) {
                MatatagCompetencyRating::query()
                    ->where('class_section_id', $section->id)
                    ->where('academic_year', $academicYear)
                    ->where(function ($q) use ($chunk) {
                        foreach ($chunk as [$studentId, $slotId]) {
                            $q->orWhere(fn ($w) => $w
                                ->where('student_id', $studentId)
                                ->where('slot_id', $slotId));
                        }
                    })
                    ->delete();
            }

            foreach (array_chunk($rows, 500) as $chunk) {
                DB::table('matatag_competency_ratings')->upsert(
                    $chunk,
                    ['student_id', 'academic_year', 'slot_id'],
                    ['descriptor', 'marked_by', 'marked_at', 'updated_at',
                        'class_section_id', 'institution_id', 'term', 'learning_area_id',
                        'curriculum_version_id'],
                );
            }

            // The catalog becomes history the moment a child is marked against
            // it. Stamped here rather than by a migration or a nightly job, so
            // there is no window in which a descriptor exists against a
            // catalog the loader still thinks it may rewrite.
            if ($rows !== [] && $pin->curriculumVersion && ! $pin->curriculumVersion->isLocked()) {
                DB::table('matatag_curriculum_versions')
                    ->where('id', $pin->curriculum_version_id)
                    ->whereNull('locked_at')
                    ->update(['locked_at' => $now, 'updated_at' => $now]);
            }
        });

        return response()->json([
            'success' => true,
            'message' => 'Saved.',
            'data' => [
                'written' => count($rows),
                'cleared' => count($clear),
                'saved_at' => $now->toIso8601String(),
            ],
        ]);
    }

    /**
     * The learning area a request names, resolved **within the section's
     * pinned version**.
     *
     * Scoped rather than fetched-then-checked: an area id from another catalog
     * is not found, so there is no moment at which the wrong curriculum is in
     * hand.
     *
     * A subject teacher (`$markable` not null) opens one of their own areas
     * by default, and is refused any other.
     *
     * @param  array<int, string>|null  $markable  null for the adviser
     * @param  MatatagLearningArea|null  $area  out-param
     */
    private function resolveArea(
        Request $request,
        MatatagSectionCurriculum $pin,
        ?array $markable,
        ?MatatagLearningArea &$area,
    ): ?JsonResponse {
        $requested = $request->input('learning_area_id');

        if ($markable !== null && is_string($requested) && $requested !== ''
            && ! in_array($requested, $markable, true)) {
            $area = null;

            return $this->forbidden(
                'You can only open the learning areas you teach in this section.'
            );
        }

        $query = MatatagLearningArea::where('curriculum_version_id', $pin->curriculum_version_id)
            ->when($markable !== null, fn ($q) => $q->whereIn('id', $markable));

        $area = is_string($requested) && $requested !== ''
            ? $query->whereKey($requested)->first()
            // No area named: the first one the PACE form prints, so opening
            // the tab lands somewhere useful.
            : $query->orderBy('sort_order')->first();

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
