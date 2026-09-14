<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\ResolvesMatatagSection;
use App\Models\MatatagTermNarrative;
use App\Support\MatatagTerms;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * The adviser's two paragraphs per learner per term.
 *
 * "What Your Child Can Do (Mga Nagagawa)" and "What Your Child Is Learning To
 * Improve (Dapat Linangin)". These **are** the progress report card — the
 * attendance table is derived, the legend is config, and the competency grid
 * prints on the attached PACE forms rather than on the card. What a parent
 * sits down and reads is these two paragraphs.
 */
class MatatagNarrativeController extends Controller
{
    use ResolvesMatatagSection;

    /**
     * A soft cap, enforced here and mirrored by a live counter in the client.
     *
     * DepEd's box is a fixed size and unbounded text has no correct rendering
     * in it — the choices are shrink it until it is unreadable, clip it, or
     * spill onto a continuation page nobody expects. A cap at the point of
     * entry is the only one of the three a teacher can see happening.
     *
     * 600 is a decision, not a placeholder. DepEd's box on `SF9 - GRADE 1`
     * fits roughly this much at a legible size, and the printed card degrades
     * gracefully rather than suddenly: past the cap the renderer shrinks the
     * block toward a 6pt floor and only then spills to a continuation page.
     * Raising it is a one-line change here - the client reads the figure from
     * this endpoint rather than carrying its own copy - so a school that finds
     * it tight is not blocked by a deploy-shaped decision.
     */
    public const MAX_LENGTH = 600;

    public function index(Request $request): JsonResponse
    {
        if ($deny = $this->resolveSection($request, (string) $request->input('class_section_id'), $section)) {
            return $deny;
        }

        $academicYear = $this->resolveAcademicYear($request, $section);

        if ($deny = $this->resolvePin($section, $academicYear, $pin)) {
            return $deny;
        }

        $roster = $this->sectionRoster($section, $academicYear);

        $query = MatatagTermNarrative::query()
            ->where('class_section_id', $section->id)
            ->where('academic_year', $academicYear);

        // A term is optional here: the report card prints all three at once,
        // and the entry screen wants one at a time.
        if ($request->has('term') && $request->input('term') !== null) {
            if ($deny = $this->resolveTerm($request, $term)) {
                return $deny;
            }

            $query->where('term', $term);
        }

        $narratives = [];

        foreach ($query->get() as $row) {
            $narratives[$row->student_id.':'.$row->term] = [
                'can_do' => $row->can_do,
                'to_improve' => $row->to_improve,
                'updated_at' => $row->updated_at?->toIso8601String(),
            ];
        }

        return response()->json([
            'success' => true,
            'data' => [
                'section' => ['id' => $section->id, 'title' => $section->title],
                'academic_year' => $academicYear,
                'max_length' => self::MAX_LENGTH,
                'terms' => MatatagTerms::values(),
                'learners' => $roster->map(fn ($student) => [
                    'student_id' => $student->id,
                    'name' => $this->learnerName($student),
                    'gender' => $student->gender,
                ])->values()->all(),
                'narratives' => (object) $narratives,
                'can_manage' => $request->user()->hasModuleAccess(
                    self::MODULE, 'manage', $section->institution_id
                ),
            ],
        ]);
    }

    /**
     * Write narratives for one or more learners.
     *
     * Same shape as the grid's bulk write and for the same reason: one code
     * path, one set of guards. Both fields empty **deletes** the row rather
     * than storing two empty strings, so "has this learner been written up
     * yet" stays a question the database can answer.
     */
    public function bulkUpsert(Request $request): JsonResponse
    {
        if ($deny = $this->resolveSection($request, (string) $request->input('class_section_id'), $section, 'manage')) {
            return $deny;
        }

        $academicYear = $this->resolveAcademicYear($request, $section);

        if ($deny = $this->resolvePin($section, $academicYear, $pin)) {
            return $deny;
        }

        $request->validate([
            'narratives' => 'present|array|max:200',
            'narratives.*.student_id' => 'required|uuid',
            'narratives.*.term' => 'required|integer',
            'narratives.*.can_do' => 'nullable|string|max:'.self::MAX_LENGTH,
            'narratives.*.to_improve' => 'nullable|string|max:'.self::MAX_LENGTH,
        ]);

        $narratives = $request->input('narratives', []);

        if ($narratives === []) {
            return response()->json([
                'success' => true,
                'message' => 'Nothing to save.',
                'data' => ['written' => 0, 'cleared' => 0],
            ]);
        }

        foreach ($narratives as $narrative) {
            if (! MatatagTerms::isValidTerm($narrative['term'])) {
                return response()->json([
                    'success' => false,
                    'message' => 'Key Stage 1 has '.MatatagTerms::count().' terms; term '
                        .$narrative['term'].' does not exist.',
                ], 422);
            }
        }

        // The same roster guard the grid uses, and for the same reason: a
        // valid token plus a guessed uuid must not write a paragraph onto
        // another school's learner.
        $studentIds = array_values(array_unique(array_column($narratives, 'student_id')));

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

        $now = now();
        $userId = $request->user()->id;
        $rows = [];
        $clear = [];

        foreach ($narratives as $narrative) {
            $canDo = $this->trimToNull($narrative['can_do'] ?? null);
            $toImprove = $this->trimToNull($narrative['to_improve'] ?? null);

            if ($canDo === null && $toImprove === null) {
                $clear[] = [$narrative['student_id'], (int) $narrative['term']];

                continue;
            }

            $rows[$narrative['student_id'].':'.$narrative['term']] = [
                'id' => (string) Str::uuid7(),
                'institution_id' => $section->institution_id,
                'class_section_id' => $section->id,
                'student_id' => $narrative['student_id'],
                'academic_year' => $academicYear,
                'term' => (int) $narrative['term'],
                'can_do' => $canDo,
                'to_improve' => $toImprove,
                'written_by' => $userId,
                'created_at' => $now,
                'updated_at' => $now,
            ];
        }

        $rows = array_values($rows);

        DB::transaction(function () use ($rows, $clear, $section, $academicYear) {
            foreach ($clear as [$studentId, $term]) {
                MatatagTermNarrative::where('class_section_id', $section->id)
                    ->where('academic_year', $academicYear)
                    ->where('student_id', $studentId)
                    ->where('term', $term)
                    ->delete();
            }

            foreach (array_chunk($rows, 200) as $chunk) {
                DB::table('matatag_term_narratives')->upsert(
                    $chunk,
                    ['student_id', 'academic_year', 'term'],
                    ['can_do', 'to_improve', 'written_by', 'updated_at',
                        'class_section_id', 'institution_id'],
                );
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

    private function trimToNull(?string $value): ?string
    {
        $value = $value === null ? null : trim($value);

        return $value === '' ? null : $value;
    }
}
