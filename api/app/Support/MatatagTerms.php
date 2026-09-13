<?php

namespace App\Support;

/**
 * The three terms, five descriptors and macro skills of DepEd's MATATAG Key
 * Stage 1 progress report.
 *
 * ## Why this is not App\Support\GradingPeriods
 *
 * `GradingPeriods` already knows the difference between four quarters and
 * three terms, and reusing it here is the obvious move. It is also wrong, and
 * the failure is not obvious until it reaches a teacher.
 *
 * `GradingPeriods::forInstitution($institutionId, $academicYear)` resolves the
 * structure per *(institution, academic year)* — school-wide for the year —
 * and `institution_academic_years` is `UNIQUE (institution_id, year)` with no
 * grade-level dimension to add one to. But MATATAG covers Grades 1-3 only, so
 * a K-12 school needs three terms for its primary grades **while Grades 4-12
 * stay on four numeric quarters in the same year**. Switch that flag and
 * `GradingPeriods::count()` returns 3 for the whole school, and
 * `assertValidPeriod()` starts refusing quarter 4 for every Grade 10 teacher.
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
     * The five descriptors, keyed by letter, each with its English label,
     * Filipino label and the description printed in the report-card legend.
     *
     * @return array<string, array{label: string, filipino: string, description: string}>
     */
    public static function descriptors(): array
    {
        return config('matatag.descriptors', []);
    }

    /**
     * ['A', 'B', 'C', 'D', 'E'] — for `Rule::in()` on anything accepting a mark.
     *
     * @return array<int, string>
     */
    public static function descriptorLetters(): array
    {
        return array_keys(self::descriptors());
    }

    /**
     * Whether a value is a mark this module accepts.
     *
     * Null is not valid here. Clearing a cell is a delete, and the endpoints
     * treat it as one; a "no mark" sentinel would print as a letter.
     */
    public static function isValidDescriptor(?string $descriptor): bool
    {
        return $descriptor !== null
            && array_key_exists($descriptor, self::descriptors());
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
     * 'grade 1' and 'GRADE  1' do not become two different things.
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

        $descriptors = [];
        foreach (self::descriptors() as $letter => $definition) {
            $descriptors[] = [
                'letter' => $letter,
                'label' => $definition['label'] ?? null,
                'filipino' => $definition['filipino'] ?? null,
                'description' => $definition['description'] ?? null,
            ];
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
            'grade_levels' => self::gradeLevels(),
        ];
    }
}
