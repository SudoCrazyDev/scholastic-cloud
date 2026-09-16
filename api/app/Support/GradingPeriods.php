<?php

namespace App\Support;

use App\Models\ClassSection;
use App\Models\InstitutionAcademicYear;
use App\Models\InstitutionGradeLevelGradingPeriod;
use App\Models\Subject;
use Illuminate\Validation\ValidationException;

/**
 * Resolves how many grading periods a school year is divided into.
 *
 * DepEd's newer structure uses 3 terms; the legacy structure uses 4 quarters.
 * Institutions adopt the change on a school-year boundary, so the structure is
 * recorded per academic year on `institution_academic_years.grading_period_type`.
 *
 * ## Two axes, not one
 *
 * The year is only the *default*. The 3-term structure does not reach Senior
 * High: Grades 11 and 12 run two semesters of two quarters each, so a school on
 * terms still grades its SHS learners over four periods in the same year. Those
 * exceptions live in `institution_grade_level_grading_periods`, one row per
 * grade level that differs. Resolution is always:
 *
 *     grade-level override -> academic-year default -> quarters
 *
 * A grade level is therefore part of the question, and callers should pass one
 * wherever they have a section or a subject in hand. `forInstitution()` without
 * one answers for the year default, which is right for school-wide chrome and
 * wrong for anything that grades a particular learner.
 *
 * The stored period value stays a plain ordinal ('1'..'4') in every table, so a
 * term-based year simply never uses '4'. Only the count and the labels change.
 */
class GradingPeriods
{
    public const QUARTER = 'quarter';
    public const TERM = 'term';

    public const TYPES = [self::QUARTER, self::TERM];

    private const COUNTS = [
        self::QUARTER => 4,
        self::TERM => 3,
    ];

    /** Ordinal prefixes shared by both structures. */
    private const ORDINALS = ['1st', '2nd', '3rd', '4th'];

    /**
     * Grade levels DepEd's 3-term structure does not cover. Used only to seed a
     * school's defaults and to explain the exception in the UI — never to decide
     * a structure at runtime, which always reads the stored override so a school
     * that wants something else is obeyed.
     */
    public const SENIOR_HIGH_GRADE_LEVELS = ['Grade 11', 'Grade 12'];

    /**
     * Memoised (institution, year) lookups — these are hit repeatedly per request.
     * Each entry is the year default plus that year's grade-level overrides, so a
     * screen rendering thirty sections costs one query rather than thirty.
     *
     * @var array<string, array{type: string, overrides: array<string, string>}>
     */
    private static array $resolved = [];

    /**
     * Normalise an arbitrary value to a supported type, defaulting to quarters.
     */
    public static function normalizeType(?string $type): string
    {
        return in_array($type, self::TYPES, true) ? $type : self::QUARTER;
    }

    /**
     * Number of grading periods in the year (4 for quarters, 3 for terms).
     */
    public static function count(?string $type): int
    {
        return self::COUNTS[self::normalizeType($type)];
    }

    /**
     * Period ordinals as strings, e.g. ['1', '2', '3', '4'].
     */
    public static function values(?string $type): array
    {
        return array_map('strval', range(1, self::count($type)));
    }

    /**
     * Period ordinals as integers, for whereIn() against integer-ish columns.
     */
    public static function intValues(?string $type): array
    {
        return range(1, self::count($type));
    }

    /**
     * Singular noun for the period, e.g. 'Quarter' or 'Term'.
     */
    public static function noun(?string $type): string
    {
        return self::normalizeType($type) === self::TERM ? 'Term' : 'Quarter';
    }

    /**
     * Plural noun for the period, e.g. 'Quarters' or 'Terms'.
     */
    public static function pluralNoun(?string $type): string
    {
        return self::noun($type) . 's';
    }

    /**
     * Ordinal label for a single period, e.g. '1st Quarter' or '2nd Term'.
     */
    public static function label(?string $type, int|string $period): string
    {
        $index = max(1, (int) $period);
        $ordinal = self::ORDINALS[$index - 1] ?? ($index . 'th');

        return $ordinal . ' ' . self::noun($type);
    }

    /**
     * Short label for a single period, e.g. 'Q1' or 'T2'.
     */
    public static function shortLabel(?string $type, int|string $period): string
    {
        return substr(self::noun($type), 0, 1) . (int) $period;
    }

    /**
     * Full config payload handed to the client so the UI can render labels and
     * period counts without duplicating this logic.
     */
    public static function config(?string $type): array
    {
        $type = self::normalizeType($type);

        return [
            'type' => $type,
            'count' => self::count($type),
            'noun' => self::noun($type),
            'noun_plural' => self::pluralNoun($type),
            'periods' => array_map(fn (string $value) => [
                'value' => $value,
                'label' => self::label($type, $value),
                'short' => self::shortLabel($type, $value),
                'numbered' => self::noun($type) . ' ' . $value,
            ], self::values($type)),
        ];
    }

    /**
     * Canonical spelling of a grade level, for storing and comparing overrides.
     *
     * `class_sections.grade_level` is a free string a school types, so 'Grade 11',
     * 'grade 11' and 'Grade  11' all have to land on the same override. Runs of
     * whitespace are collapsed and the ends trimmed; the school's own casing is
     * kept, because a school naming a level we do not know must still be able to
     * set its structure. Comparison is case-insensitive — see gradeLevelKey().
     */
    public static function canonicalGradeLevel(?string $gradeLevel): ?string
    {
        if ($gradeLevel === null || trim($gradeLevel) === '') {
            return null;
        }

        return preg_replace('/\s+/', ' ', trim($gradeLevel));
    }

    /** Lookup key for a grade level: canonical spelling, case-folded. */
    private static function gradeLevelKey(?string $gradeLevel): ?string
    {
        $canonical = self::canonicalGradeLevel($gradeLevel);

        return $canonical === null ? null : mb_strtolower($canonical);
    }

    /**
     * The year default and its grade-level overrides, memoised per
     * (institution, academic year).
     *
     * @return array{type: string, overrides: array<string, string>, labels: array<string, string>}
     */
    private static function structureFor(string $institutionId, ?string $academicYear): array
    {
        $cacheKey = $institutionId . '|' . ($academicYear ?? '');
        if (array_key_exists($cacheKey, self::$resolved)) {
            return self::$resolved[$cacheKey];
        }

        $query = InstitutionAcademicYear::where('institution_id', $institutionId);

        if ($academicYear) {
            $query->where('year', $academicYear);
        } else {
            $query->where('is_current', true);
        }

        $year = $query->first(['id', 'grading_period_type']);

        // An academic year that was never registered in institution_academic_years
        // (older data) falls back to the institution's current year — overrides
        // included, so the fallback is a whole structure and not just its default.
        if (! $year && $academicYear) {
            $year = InstitutionAcademicYear::where('institution_id', $institutionId)
                ->where('is_current', true)
                ->first(['id', 'grading_period_type']);
        }

        $overrides = [];
        $labels = [];

        if ($year) {
            $rows = InstitutionGradeLevelGradingPeriod::where('institution_academic_year_id', $year->id)
                ->get(['grade_level', 'grading_period_type']);

            foreach ($rows as $row) {
                $key = self::gradeLevelKey($row->grade_level);
                if ($key !== null) {
                    $overrides[$key] = self::normalizeType($row->grading_period_type);
                    $labels[$key] = self::canonicalGradeLevel($row->grade_level);
                }
            }
        }

        return self::$resolved[$cacheKey] = [
            'type' => self::normalizeType($year?->grading_period_type),
            'overrides' => $overrides,
            'labels' => $labels,
        ];
    }

    /**
     * Resolve the structure for an institution's academic year, optionally for one
     * grade level. Falls back to the institution's current year, then to quarters.
     *
     * Pass a grade level whenever one is in scope. Without it this answers for the
     * year default, which is correct for school-wide chrome and wrong for anything
     * that grades a particular learner — a 3-term school still has Grades 11 and
     * 12 on four quarters.
     */
    public static function forInstitution(
        ?string $institutionId,
        ?string $academicYear = null,
        ?string $gradeLevel = null
    ): string {
        if (! $institutionId) {
            return self::QUARTER;
        }

        $structure = self::structureFor($institutionId, $academicYear);
        $key = self::gradeLevelKey($gradeLevel);

        if ($key !== null && array_key_exists($key, $structure['overrides'])) {
            return $structure['overrides'][$key];
        }

        return $structure['type'];
    }

    /**
     * Every grade level that departs from a year's default, keyed by its canonical
     * spelling. Shipped with the auth profile so the client can resolve a section's
     * structure without a request per screen.
     *
     * A stored row that merely restates the year default is not an exception and is
     * left out — the client only needs to know where reality differs.
     *
     * @return array<string, string>
     */
    public static function overridesForInstitution(?string $institutionId, ?string $academicYear = null): array
    {
        if (! $institutionId) {
            return [];
        }

        $structure = self::structureFor($institutionId, $academicYear);
        $out = [];

        foreach ($structure['overrides'] as $key => $type) {
            if ($type !== $structure['type']) {
                $out[$structure['labels'][$key]] = $type;
            }
        }

        return $out;
    }

    /**
     * Full config for a year, plus a config per grade level that differs.
     *
     * The client gets one payload it can resolve locally: the top level for
     * anything school-wide, `by_grade_level` for a screen that knows its section.
     *
     * Passing a grade level answers the top level for that grade level instead,
     * for a screen already scoped to one. `by_grade_level` is sent either way, so
     * a report spanning the whole school can still label each row correctly.
     */
    public static function configForInstitution(
        ?string $institutionId,
        ?string $academicYear = null,
        ?string $gradeLevel = null
    ): array {
        $config = self::config(self::forInstitution($institutionId, $academicYear, $gradeLevel));

        $byGradeLevel = [];
        foreach (self::overridesForInstitution($institutionId, $academicYear) as $gradeLevel => $type) {
            $byGradeLevel[$gradeLevel] = self::config($type);
        }

        // An object, not an array: an empty PHP array encodes as [] and would
        // arrive in the client as a list it cannot key into.
        $config['by_grade_level'] = (object) $byGradeLevel;

        return $config;
    }

    /**
     * Resolve the structure for a class section — the most precise caller, since a
     * section carries both the grade level and the academic year.
     */
    public static function forSection(ClassSection|string|null $section, ?string $academicYear = null): string
    {
        if (is_string($section)) {
            $section = ClassSection::find($section);
        }

        if (! $section) {
            return self::QUARTER;
        }

        return self::forInstitution(
            $section->institution_id,
            $academicYear ?: $section->academic_year,
            $section->grade_level
        );
    }

    /**
     * Resolve the structure for a subject, optionally scoped to a given year.
     *
     * A subject always belongs to a class section (the FK is not nullable), and the
     * section is what carries the grade level, so this reaches through it rather
     * than answering with the school-wide default.
     */
    public static function forSubject(Subject|string|null $subject, ?string $academicYear = null): string
    {
        if (is_string($subject)) {
            $subject = Subject::with('classSection:id,grade_level,academic_year')->find($subject);
        }

        if (! $subject) {
            return self::QUARTER;
        }

        $section = $subject->relationLoaded('classSection')
            ? $subject->getRelation('classSection')
            : $subject->classSection()->first(['id', 'grade_level', 'academic_year']);

        return self::forInstitution(
            $subject->institution_id,
            $academicYear ?: $section?->academic_year,
            $section?->grade_level
        );
    }

    /**
     * Resolve the structure for the institution a user belongs to.
     */
    public static function forUser(
        $user,
        ?string $academicYear = null,
        ?string $gradeLevel = null
    ): string {
        $institutionId = self::institutionIdForUser($user);

        return self::forInstitution($institutionId, $academicYear, $gradeLevel);
    }

    /**
     * The user's default institution id, mirroring how the client picks one.
     */
    public static function institutionIdForUser($user): ?string
    {
        if (! $user) {
            return null;
        }

        if (! empty($user->institution_id)) {
            return $user->institution_id;
        }

        if (method_exists($user, 'getDefaultInstitutionId')) {
            $default = $user->getDefaultInstitutionId();
            if ($default) {
                return $default;
            }
        }

        if (method_exists($user, 'userInstitutions')) {
            return $user->userInstitutions()->first()?->institution_id;
        }

        return null;
    }

    /**
     * Clear the memoised lookups (used after a structure change, and in tests).
     */
    public static function flushCache(): void
    {
        self::$resolved = [];
    }

    /**
     * Grading-period values accepted for a resolved structure, for use in
     * validation rules.
     */
    public static function validationValues(?string $type): array
    {
        return self::values($type);
    }

    /**
     * All values any structure could ever use. Used where the structure cannot be
     * resolved cheaply and a lenient rule is acceptable, since a period beyond the
     * configured count simply never gets rendered.
     */
    public static function anyValues(): array
    {
        return ['1', '2', '3', '4'];
    }

    /**
     * Whether an institution/year uses the given period.
     */
    public static function isValidPeriod(?string $type, int|string $period): bool
    {
        $period = (int) $period;

        return $period >= 1 && $period <= self::count($type);
    }

    /**
     * Reject a period the resolved structure does not have — e.g. quarter 4 for a
     * year running on 3 terms. Kept separate from the request rules because the
     * structure can only be resolved after the subject/institution is loaded.
     */
    public static function assertValidPeriod(?string $type, int|string $period, string $field = 'quarter'): void
    {
        if (self::isValidPeriod($type, $period)) {
            return;
        }

        throw ValidationException::withMessages([
            $field => sprintf(
                'This academic year is divided into %d %s, so %s %s does not exist.',
                self::count($type),
                strtolower(self::pluralNoun($type)),
                strtolower(self::noun($type)),
                $period
            ),
        ]);
    }
}
