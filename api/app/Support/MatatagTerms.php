<?php

namespace App\Support;

/**
 * The three terms, five descriptors and macro skills of DepEd's MATATAG Key
 * Stage 1 progress report.
 *
 * ## Why this is not App\Support\GradingPeriods
 *
 * `GradingPeriods` already knows the difference between four quarters and
 * three terms, and reusing it here is the obvious move. It is still wrong, but
 * not for the reason this docblock used to give.
 *
 * The old reason was mechanical: `GradingPeriods` resolved a structure per
 * *(institution, academic year)*, school-wide, so putting Grades 1-3 on three
 * terms would have made `count()` return 3 for the whole school and
 * `assertValidPeriod()` refuse quarter 4 to every Grade 10 teacher.
 *
 * That is no longer true. `institution_grade_level_grading_periods` records
 * per-grade-level exceptions, and `GradingPeriods::forInstitution()` takes an
 * optional grade level. It was added so Senior High could stay on four
 * quarters through a three-term year — DepEd's 3-term structure does not reach
 * Grades 11 and 12, which run two semesters of two quarters each.
 *
 * The reasons that remain are the ones that always mattered:
 *
 * - `GradingPeriods` counts and labels *numeric* periods a school chooses
 *   between. These terms are DepEd's, fixed, and carry A-E descriptors per
 *   competency rather than a numeric grade. A school cannot opt out of them.
 * - Opting a section into MATATAG must not restructure that grade level's
 *   numeric grades. A Grade 1 section can report descriptors here and still
 *   carry numeric running grades under the year's own structure.
 *
 * So this module carries its own terms. They are fixed at three and are not
 * configurable per school: they are DepEd's, not the school's.
 *
 * The shape of this class deliberately mirrors `GradingPeriods` so the two
 * read alike at a call site. That resemblance is a courtesy to the reader, not
 * an invitation to merge them.
 *
 * @see docs/modules/MatatagKeyStage1/MATATAG.md
 */
class MatatagTerms
{
    /** A slot with no language macro skill — Mathematics, GMRC and Makabansa. */
    public const NO_MACRO_SKILL = 'none';

    /**
     * How many terms the year is divided into. Always three.
     */
    public static function count(): int
    {
        return count(config('matatag.terms', []));
    }

    /**
     * The term numbers, ascending: [1, 2, 3].
     *
     * @return array<int, int>
     */
    public static function values(): array
    {
        $values = array_map('intval', array_keys(config('matatag.terms', [])));
        sort($values);

        return $values;
    }

    public static function isValidTerm(int|string|null $term): bool
    {
        return $term !== null && in_array((int) $term, self::values(), true);
    }

    /**
     * 'Term 1'. Falls back to a sensible string rather than throwing, so a
     * stray value in a report never renders as an empty cell.
     */
    public static function label(int|string $term): string
    {
        return config('matatag.terms.'.(int) $term.'.label', 'Term '.(int) $term);
    }

    /**
     * 'Unang Termino'. Printed on the report card beside the English label.
     */
    public static function filipino(int|string $term): string
    {
        return config('matatag.terms.'.(int) $term.'.filipino', '');
    }

    /**
     * The calendar months a term owns, e.g. [6, 7, 8, 9] for Term 1.
     *
     * @return array<int, int>
     */
    public static function monthsFor(int|string $term): array
    {
        return config('matatag.terms.'.(int) $term.'.months', []);
    }

    /**
     * Which term a month belongs to, or null for a month outside the school
     * year (May, and any month a term does not claim).
     *
     * Returns a single term because whole months are assigned to one term
     * each. DepEd's printed form splits September across Terms 1 and 2; we
     * deliberately do not — see the config and the module doc.
     */
    public static function termForMonth(int $month): ?int
    {
        foreach (config('matatag.terms', []) as $term => $definition) {
            if (in_array($month, $definition['months'] ?? [], true)) {
                return (int) $term;
            }
        }

        return null;
    }

    /**
     * The attendance table's rows, in the order DepEd prints them: every month
     * of every term, June through April, each stamped with the calendar year
     * it falls in.
     *
     * Eleven rows for a normal year. The caller fills in class days, days
     * present and days absent per learner.
     *
     * @return array<int, array{term: int, month: int, year: int}>
     */
    public static function monthRows(string $academicYear): array
    {
        $rows = [];

        foreach (self::values() as $term) {
            foreach (self::monthsFor($term) as $month) {
                $rows[] = [
                    'term' => $term,
                    'month' => $month,
                    'year' => self::calendarYearFor($month, $academicYear),
                ];
            }
        }

        return $rows;
    }

    /**
     * The calendar year a month falls in for a given school year.
     *
     * School years run June-May, so June-December belong to the starting year
     * and January-May to the one after. '2026-2027' + month 9 is 2026;
     * '2026-2027' + month 2 is 2027.
     */
    public static function calendarYearFor(int $month, string $academicYear): int
    {
        $startYear = (int) substr($academicYear, 0, 4);

        return $month >= 6 ? $startYear : $startYear + 1;
    }

    /**
     * Every instrument's key: ['ks1', 'kinder'].
     *
     * @return array<int, string>
     */
    public static function instruments(): array
    {
        return array_keys(config('matatag.instruments', []));
    }

    public static function isValidInstrument(?string $instrument): bool
    {
        return $instrument !== null && in_array($instrument, self::instruments(), true);
    }

    /**
     * The instrument a catalog version prints, falling back to Key Stage 1's
     * for a version that names one this config does not know.
     */
    public static function instrumentOrDefault(?string $instrument): string
    {
        return self::isValidInstrument($instrument)
            ? $instrument
            : (string) config('matatag.default_instrument', 'ks1');
    }

    /**
     * An instrument's rating scale, keyed by the stored code, each with its
     * English label, Filipino label, the legend description, and `key` — the
     * one keystroke that sets it in the grid.
     *
     * No instrument named means Key Stage 1's A-E, which is what every caller
     * that predates Kindergarten meant.
     *
     * @return array<string, array{key: string, label: string, filipino: ?string, description: string}>
     */
    public static function descriptors(?string $instrument = null): array
    {
        $instrument = self::instrumentOrDefault($instrument);
        $scale = config("matatag.instruments.{$instrument}.descriptors", []);

        // `ks1` points at the top-level `descriptors` block by name, so the
        // A-E wording stays where DepEd's last rewording was made.
        if (is_string($scale)) {
            $scale = config("matatag.{$scale}", []);
        }

        $out = [];

        foreach ($scale as $code => $definition) {
            $out[(string) $code] = $definition + ['key' => (string) $code, 'filipino' => null];
        }

        return $out;
    }

    /**
     * ['A', 'B', 'C', 'D', 'E'], or ['CO', 'DV', 'BG'] — for `Rule::in()` on
     * anything accepting a mark.
     *
     * @return array<int, string>
     */
    public static function descriptorLetters(?string $instrument = null): array
    {
        return array_keys(self::descriptors($instrument));
    }

    /**
     * Whether a value is a mark this instrument accepts.
     *
     * Null is not valid here. Clearing a cell is a delete, and the endpoints
     * treat it as one; a "no mark" sentinel would print as a letter. Nor is
     * another instrument's mark: an `A` on a Kindergarten card has no legend
     * entry to explain it.
     */
    public static function isValidDescriptor(?string $descriptor, ?string $instrument = null): bool
    {
        return $descriptor !== null
            && array_key_exists($descriptor, self::descriptors($instrument));
    }

    /**
     * The prose fields an instrument records per learner per term, keyed by
     * their `matatag_term_narratives` column, in print order.
     *
     * @return array<string, array{label: string, filipino: ?string, hint: ?string}>
     */
    public static function narrativeFields(?string $instrument = null): array
    {
        $instrument = self::instrumentOrDefault($instrument);

        return config("matatag.instruments.{$instrument}.narratives", []);
    }

    /**
     * Every narrative column any instrument uses — what the write endpoint
     * accepts before it knows which ones the section's instrument keeps.
     *
     * @return array<int, string>
     */
    public static function allNarrativeColumns(): array
    {
        $columns = [];

        foreach (self::instruments() as $instrument) {
            $columns = [...$columns, ...array_keys(self::narrativeFields($instrument))];
        }

        return array_values(array_unique($columns));
    }

    /**
     * What a client needs to render one instrument: its scale, its prose
     * fields, and whether the marks print on the card itself.
     */
    public static function instrumentConfig(?string $instrument = null): array
    {
        $instrument = self::instrumentOrDefault($instrument);

        $descriptors = [];
        foreach (self::descriptors($instrument) as $code => $definition) {
            $descriptors[] = [
                'letter' => $code,
                'key' => $definition['key'],
                'label' => $definition['label'] ?? null,
                'filipino' => $definition['filipino'] ?? null,
                'description' => $definition['description'] ?? null,
            ];
        }

        $narratives = [];
        foreach (self::narrativeFields($instrument) as $field => $definition) {
            $narratives[] = [
                'field' => $field,
                'label' => $definition['label'] ?? $field,
                'filipino' => $definition['filipino'] ?? null,
                'hint' => $definition['hint'] ?? null,
            ];
        }

        return [
            'key' => $instrument,
            'label' => config("matatag.instruments.{$instrument}.label"),
            'ratings_on_card' => (bool) config("matatag.instruments.{$instrument}.ratings_on_card", false),
            'descriptors' => $descriptors,
            'narratives' => $narratives,
        ];
    }

    /**
     * The macro skills, keyed by slug, including `none`.
     *
     * @return array<string, array{label: ?string, abbr: ?string, fills: array<int, string>}>
     */
    public static function macroSkills(): array
    {
        return config('matatag.macro_skills', []);
    }

    public static function isValidMacroSkill(?string $macroSkill): bool
    {
        return $macroSkill !== null
            && array_key_exists($macroSkill, self::macroSkills());
    }

    /**
     * The macro skill a workbook cell's fill colour stands for, or null if the
     * colour is not one of DepEd's.
     *
     * The extractor decodes the catalog with this. A null means either a cell
     * whose competency is not taught that term, or a palette this config has
     * not been told about yet — the extractor must report those rather than
     * quietly dropping them.
     */
    public static function macroSkillForFill(?string $argb): ?string
    {
        if ($argb === null) {
            return null;
        }

        $argb = strtoupper($argb);

        foreach (self::macroSkills() as $slug => $definition) {
            if (in_array($argb, $definition['fills'] ?? [], true)) {
                return $slug;
            }
        }

        return null;
    }

    /**
     * The grade levels Key Stage 1 covers, as DepEd names them.
     *
     * @return array<int, string>
     */
    public static function gradeLevels(): array
    {
        return config('matatag.grade_levels', []);
    }

    /**
     * Every spelling of a grade level this module accepts — the canonical
     * names and their aliases ('Kinder 1', 'Kinder 2' for Kindergarten).
     *
     * @return array<int, string>
     */
    public static function acceptedGradeLevels(): array
    {
        $accepted = self::gradeLevels();

        foreach (config('matatag.grade_level_aliases', []) as $aliases) {
            $accepted = [...$accepted, ...$aliases];
        }

        return array_values(array_unique($accepted));
    }

    /**
     * Whether a section's grade level is one this module reports on.
     *
     * `class_sections.grade_level` is a free string a school types, so compare
     * leniently: case-insensitively, with runs of whitespace collapsed.
     *
     * This answers "is this Key Stage 1", nothing more. It must never be used
     * to pick a curriculum catalog — the grade level alone does not identify
     * one, and DepEd's own workbook offers Grades 1-3 in its header while
     * carrying only Grade 1's competencies. Resolve the catalog from the
     * section's pinned version instead.
     */
    public static function isKeyStageOne(?string $gradeLevel): bool
    {
        return self::canonicalGradeLevel($gradeLevel) !== null;
    }

    /**
     * The canonical spelling of a grade level, or null when it is not one of
     * ours. Use this before storing a grade level against a catalog, so that
     * 'grade 1' and 'GRADE  1' do not become two different things — and so
     * that 'Kinder 1' and 'Kinder 2' both become 'Kindergarten', the one
     * kindergarten grade level DepEd publishes a catalog for.
     */
    public static function canonicalGradeLevel(?string $gradeLevel): ?string
    {
        if ($gradeLevel === null) {
            return null;
        }

        $needle = self::normalizeGradeLevel($gradeLevel);

        foreach (self::gradeLevels() as $candidate) {
            if (self::normalizeGradeLevel($candidate) === $needle) {
                return $candidate;
            }
        }

        foreach (config('matatag.grade_level_aliases', []) as $canonical => $aliases) {
            foreach ($aliases as $alias) {
                if (self::normalizeGradeLevel($alias) === $needle) {
                    return $canonical;
                }
            }
        }

        return null;
    }

    private static function normalizeGradeLevel(string $gradeLevel): string
    {
        return strtolower(preg_replace('/\s+/', ' ', trim($gradeLevel)));
    }

    /**
     * Everything a client needs to render the module without hardcoding any of
     * it: the terms, the descriptor legend and the macro-skill labels.
     *
     * Served by `GET /api/matatag/reference`. Deliberately one payload rather
     * than three endpoints — it is a few hundred bytes of config that changes
     * about once a year.
     */
    public static function config(): array
    {
        $terms = [];
        foreach (self::values() as $term) {
            $terms[] = [
                'value' => $term,
                'label' => self::label($term),
                'filipino' => self::filipino($term),
                'months' => self::monthsFor($term),
            ];
        }

        // Key Stage 1's A-E, kept at the top level for callers that predate
        // instruments. A section's own scale rides on its curriculum version;
        // prefer that.
        $descriptors = self::instrumentConfig()['descriptors'];

        $instruments = [];
        foreach (self::instruments() as $instrument) {
            $instruments[$instrument] = self::instrumentConfig($instrument);
        }

        $macroSkills = [];
        foreach (self::macroSkills() as $slug => $definition) {
            $macroSkills[] = [
                'key' => $slug,
                'label' => $definition['label'] ?? null,
                'abbr' => $definition['abbr'] ?? null,
                // The workbook's own fill colours, served rather than
                // duplicated in the client. The grid paints the form teachers
                // already know, and when DepEd reshades a skill this file is
                // the only place that changes.
                'fills' => $definition['fills'] ?? [],
            ];
        }

        return [
            'terms' => $terms,
            'descriptors' => $descriptors,
            'macro_skills' => $macroSkills,
            'instruments' => $instruments,
            'grade_levels' => self::gradeLevels(),
            // What a client matches a section's free-text grade level against.
            'accepted_grade_levels' => self::acceptedGradeLevels(),
        ];
    }
}
