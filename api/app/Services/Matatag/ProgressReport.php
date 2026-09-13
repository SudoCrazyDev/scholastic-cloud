<?php

namespace App\Services\Matatag;

use App\Models\ClassSection;
use App\Models\Institution;
use App\Models\MatatagCompetencyRating;
use App\Models\MatatagLearningArea;
use App\Models\MatatagSectionCurriculum;
use App\Models\MatatagTermNarrative;
use App\Models\User;
use App\Support\MatatagTerms;
use Illuminate\Support\Collection;

/**
 * Everything that prints, composed into one payload.
 *
 * The report card (`SF9 - GRADE 1`) and the PACE forms are the module's whole
 * output, and both are assembled here rather than in the controller so the
 * Phase 5 PDF renderer and the .xlsx export read the same thing the screen
 * does. One composition, three consumers.
 *
 * ## The shape is the model
 *
 * A MATATAG record is descriptors and prose. There is no score, no weight, no
 * average, no transmutation and no general average anywhere in DepEd's
 * workbook, and there is no key for one anywhere in this payload — not null,
 * not zero, not "pending". A field that exists gets filled in eventually; the
 * surest way to keep a number off a Key Stage 1 report card is to give it
 * nowhere to go. `MatatagProgressReportTest` asserts that structurally, over
 * the whole response, rather than trusting this comment.
 *
 * The layout follows the paper. The body of the card is narratives, attendance
 * and the A-E legend; the descriptor grid is **not on the card** — it prints on
 * the attached PACE forms, so it lives under `pace` and nowhere else.
 *
 * ## The catalog is hoisted
 *
 * Competency text is the bulk of this payload — 199 rows of up to ~200
 * characters — and it is identical for every learner in a section. It is
 * emitted once under `pace.learning_areas`, and each learner carries only a
 * `slot_id => descriptor` map. For a 50-learner section that is the difference
 * between a payload of a few hundred kilobytes and one of several megabytes.
 */
class ProgressReport
{
    /** Emitted when the whole catalog is wanted: one learner, every area. */
    public const SCOPE_ALL_AREAS = 'all_areas';

    /** One area across a section — the "print one PACE form for the class" case. */
    public const SCOPE_ONE_AREA = 'one_area';

    /** A whole section's report cards, without the forms. See paceScope(). */
    public const SCOPE_OMITTED = 'omitted';

    public function __construct(
        private readonly CurriculumTree $tree,
        private readonly TermAttendance $attendance,
    ) {}

    /**
     * @param  Collection<int, object>  $roster  already scoped, from ResolvesMatatagSection
     * @param  MatatagLearningArea|null  $onlyArea  null for every area of the catalog
     */
    public function compose(
        ClassSection $section,
        MatatagSectionCurriculum $pin,
        string $academicYear,
        Collection $roster,
        ?MatatagLearningArea $onlyArea = null,
    ): array {
        $scope = $this->paceScope($roster, $onlyArea);

        $areas = $scope === self::SCOPE_OMITTED
            ? collect()
            : $this->areasFor($pin, $onlyArea);

        $attendance = $this->attendance->forSection($section, $academicYear, $roster);
        $attendanceByStudent = collect($attendance['learners'])->keyBy('student_id');

        $narratives = $this->narrativesFor($section, $academicYear, $roster);
        $descriptors = $areas->isEmpty()
            ? []
            : $this->descriptorsFor($section, $academicYear, $roster, $areas);

        $reference = MatatagTerms::config();
        $bounds = $this->schoolYearBounds($academicYear);

        return [
            'academic_year' => $academicYear,
            'school' => $this->school($section),
            'section' => $this->section($section),
            'curriculum_version' => $this->tree->version($pin->curriculumVersion),
            // Printed at the foot of the card. Served rather than hardcoded in
            // the renderer, so DepEd rewording a descriptor is a config change.
            'legend' => [
                'descriptors' => $reference['descriptors'],
                'terms' => $reference['terms'],
                'macro_skills' => $reference['macro_skills'],
            ],
            'pace' => [
                'scope' => $scope,
                'note' => $this->paceNote($scope),
                'learning_areas' => $areas->map(fn (MatatagLearningArea $area) => [
                    ...$this->tree->area($area),
                    'domains' => $this->tree->domainsFor($area),
                    'rows' => $this->tree->paceRowsFor($area),
                ])->values()->all(),
            ],
            'learners' => $roster->map(fn ($student) => [
                'student' => $this->student($student, $bounds),
                'narratives' => $this->narrativeRows($narratives[$student->id] ?? []),
                'attendance' => $this->attendanceRow($attendanceByStudent[$student->id] ?? null),
                // Descriptors only. The text they hang off is up in `pace`.
                'pace' => (object) ($descriptors[$student->id] ?? []),
            ])->values()->all(),
            'warnings' => $attendance['warnings'],
        ];
    }

    // -----------------------------------------------------------------

    /**
     * How much of the catalog this request gets.
     *
     * A whole section's PACE forms across all five areas is 50 learners × 604
     * slots, and it is the one combination nobody should reach by accident: it
     * is several megabytes, it is slow, and printing it is 600 pages. Both
     * real print jobs narrow it — "every form for one learner" and "one form
     * for the class" — so those are the two shapes served, and asking for
     * neither returns the report cards without the forms rather than quietly
     * doing the expensive thing.
     *
     * The caller gets told which of the three it received; nothing is silently
     * missing.
     *
     * @param  Collection<int, object>  $roster
     */
    private function paceScope(Collection $roster, ?MatatagLearningArea $onlyArea): string
    {
        if ($onlyArea !== null) {
            return self::SCOPE_ONE_AREA;
        }

        return $roster->count() <= 1 ? self::SCOPE_ALL_AREAS : self::SCOPE_OMITTED;
    }

    private function paceNote(string $scope): ?string
    {
        return $scope === self::SCOPE_OMITTED
            ? 'PACE forms are not included for a whole section at once. Name a learning area for '
                .'one form across the class, or a learner for all of their forms.'
            : null;
    }

    /**
     * @return Collection<int, MatatagLearningArea>
     */
    private function areasFor(MatatagSectionCurriculum $pin, ?MatatagLearningArea $onlyArea): Collection
    {
        if ($onlyArea !== null) {
            return collect([$onlyArea]);
        }

        return MatatagLearningArea::where('curriculum_version_id', $pin->curriculum_version_id)
            ->orderBy('sort_order')
            ->get();
    }

    /**
     * Every descriptor these learners hold, keyed `student_id => slot_id => letter`.
     *
     * Scoped by **institution and year, not by class section**, and that is
     * deliberate in both directions.
     *
     * Not by section, because a learner who moves from one Grade 1 section to
     * another in October would otherwise have their first term silently missing
     * from their own report card — the marks are the learner's, not the
     * section's.
     *
     * But firmly by institution, because a learner can be enrolled at two
     * schools at once. `InstitutionCleanupGroups`' own docblock records that
     * `core_value_markings` is the table it cannot scope through a parent, and
     * this is the same hazard: without the institution filter, School A's
     * report card would print School B's descriptors.
     *
     * @param  Collection<int, object>  $roster
     * @param  Collection<int, MatatagLearningArea>  $areas
     * @return array<string, array<string, string>>
     */
    private function descriptorsFor(
        ClassSection $section,
        string $academicYear,
        Collection $roster,
        Collection $areas,
    ): array {
        if ($roster->isEmpty()) {
            return [];
        }

        $rows = MatatagCompetencyRating::query()
            ->where('institution_id', $section->institution_id)
            ->where('academic_year', $academicYear)
            ->whereIn('student_id', $roster->pluck('id'))
            ->whereIn('learning_area_id', $areas->pluck('id'))
            ->get(['student_id', 'slot_id', 'descriptor']);

        $out = [];

        foreach ($rows as $row) {
            $out[$row->student_id][$row->slot_id] = $row->descriptor;
        }

        return $out;
    }

    /**
     * @param  Collection<int, object>  $roster
     * @return array<string, array<int, MatatagTermNarrative>>
     */
    private function narrativesFor(ClassSection $section, string $academicYear, Collection $roster): array
    {
        if ($roster->isEmpty()) {
            return [];
        }

        // Institution-scoped for the same reason the descriptors are.
        $rows = MatatagTermNarrative::query()
            ->where('institution_id', $section->institution_id)
            ->where('academic_year', $academicYear)
            ->whereIn('student_id', $roster->pluck('id'))
            ->get();

        $out = [];

        foreach ($rows as $row) {
            $out[$row->student_id][(int) $row->term] = $row;
        }

        return $out;
    }

    /**
     * All three terms, always, whether written or not.
     *
     * The card prints three blocks and a blank one is a meaningful thing for a
     * parent to see in December. Omitting the unwritten terms would make the
     * renderer guess how many blocks to draw.
     *
     * @param  array<int, MatatagTermNarrative>  $written
     * @return array<int, array<string, mixed>>
     */
    private function narrativeRows(array $written): array
    {
        $rows = [];

        foreach (MatatagTerms::values() as $term) {
            $row = $written[$term] ?? null;

            $rows[] = [
                'term' => $term,
                'label' => MatatagTerms::label($term),
                'filipino' => MatatagTerms::filipino($term),
                'can_do' => $row?->can_do,
                'to_improve' => $row?->to_improve,
                'updated_at' => $row?->updated_at?->toIso8601String(),
            ];
        }

        return $rows;
    }

    /**
     * @param  array<string, mixed>|null  $row  one learner's block from TermAttendance
     */
    private function attendanceRow(?array $row): array
    {
        return [
            'months' => $row['months'] ?? [],
            'terms' => (object) ($row['terms'] ?? []),
            'total' => $row['total'] ?? ['class_days' => 0, 'days_present' => 0, 'days_absent' => 0],
        ];
    }

    private function school(ClassSection $section): array
    {
        $institution = $section->institution instanceof Institution
            ? $section->institution
            : Institution::find($section->institution_id);

        return [
            'id' => $institution?->id,
            'name' => $institution?->title,
            'address' => $institution?->address,
            'division' => $institution?->division,
            'region' => $institution?->region,
            // DepEd's School ID, which the platform stores as gov_id.
            'school_id' => $institution?->gov_id,
            'logo' => $institution?->logo,
        ];
    }

    private function section(ClassSection $section): array
    {
        $adviser = $section->adviser ? User::find($section->adviser) : null;

        return [
            'id' => $section->id,
            'title' => $section->title,
            'grade_level' => $section->grade_level,
            'adviser' => $adviser === null ? null : [
                'id' => $adviser->id,
                'name' => trim(implode(' ', array_filter([
                    $adviser->first_name,
                    $adviser->middle_name,
                    $adviser->last_name,
                    $adviser->ext_name,
                ]))),
            ],
        ];
    }

    /**
     * @param  array{0: array{int, int, int}, 1: array{int, int, int}}  $bounds
     */
    private function student(object $student, array $bounds): array
    {
        return [
            'id' => $student->id,
            'lrn' => $student->lrn ?? null,
            'name' => trim(implode(' ', array_filter([
                $student->first_name,
                $student->middle_name,
                $student->last_name,
                $student->ext_name,
            ]))),
            'first_name' => $student->first_name,
            'middle_name' => $student->middle_name,
            'last_name' => $student->last_name,
            'ext_name' => $student->ext_name,
            'sex' => $student->gender,
            'birthdate' => $this->dateString($student->birthdate),
            'age_at_start_of_school_year' => $this->ageOn($student->birthdate, ...$bounds[0]),
            'age_at_end_of_school_year' => $this->ageOn($student->birthdate, ...$bounds[1]),
        ];
    }

    /**
     * The first and last day of the school year, as [year, month, day] pairs.
     *
     * Read off the term months rather than assumed, so a grade level whose
     * terms run differently gets its own bounds — and, more importantly, so
     * nothing here goes near `now()`. `config/app.php` hardcodes UTC while the
     * schools are in Asia/Manila, which puts "today" a day out for eight hours
     * of every day; a learner's printed age is not something to get wrong on a
     * DepEd form.
     *
     * @return array{0: array{int, int, int}, 1: array{int, int, int}}
     */
    private function schoolYearBounds(string $academicYear): array
    {
        $rows = MatatagTerms::monthRows($academicYear);

        if ($rows === []) {
            $start = (int) substr($academicYear, 0, 4);

            return [[$start, 6, 1], [$start + 1, 3, 31]];
        }

        $first = $rows[0];
        $last = $rows[count($rows) - 1];

        return [
            [$first['year'], $first['month'], 1],
            [$last['year'], $last['month'], $this->lastDayOf($last['year'], $last['month'])],
        ];
    }

    /**
     * Whole years completed on a given date.
     *
     * Written out rather than handed to a date library: the arithmetic is four
     * lines, it is exact, and it does not change meaning between Carbon major
     * versions the way `diffInYears` has.
     */
    private function ageOn(mixed $birthdate, int $year, int $month, int $day): ?int
    {
        $date = $this->dateString($birthdate);

        if ($date === null) {
            return null;
        }

        [$birthYear, $birthMonth, $birthDay] = array_map('intval', explode('-', substr($date, 0, 10)));

        if ($birthYear === 0) {
            return null;
        }

        $age = $year - $birthYear;

        if ($month < $birthMonth || ($month === $birthMonth && $day < $birthDay)) {
            $age--;
        }

        return $age < 0 ? null : $age;
    }

    private function dateString(mixed $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }

        if ($value instanceof \DateTimeInterface) {
            return $value->format('Y-m-d');
        }

        return substr((string) $value, 0, 10);
    }

    private function lastDayOf(int $year, int $month): int
    {
        return (int) date('t', mktime(0, 0, 0, $month, 1, $year));
    }
}
