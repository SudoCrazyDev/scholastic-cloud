<?php

namespace App\Support;

use App\Models\InstitutionAcademicYear;
use App\Models\Subject;
use Illuminate\Validation\ValidationException;

/**
 * Resolves how many grading periods a school year is divided into.
 *
 * DepEd's newer structure uses 3 terms; the legacy structure uses 4 quarters.
 * Institutions adopt the change on a school-year boundary, so the structure is
 * recorded per academic year on `institution_academic_years.grading_period_type`.
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

    /** Memoised institution/year lookups — these are hit repeatedly per request. */
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
     * Resolve the structure for an institution's academic year. Falls back to the
     * institution's current year, then to quarters.
     */
    public static function forInstitution(?string $institutionId, ?string $academicYear = null): string
    {
        if (! $institutionId) {
            return self::QUARTER;
        }

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

        $type = $query->value('grading_period_type');

        // An academic year that was never registered in institution_academic_years
        // (older data) falls back to the institution's current year.
        if ($type === null && $academicYear) {
            $type = InstitutionAcademicYear::where('institution_id', $institutionId)
                ->where('is_current', true)
                ->value('grading_period_type');
        }

        return self::$resolved[$cacheKey] = self::normalizeType($type);
    }

    /**
     * Resolve the structure for a subject, optionally scoped to a given year.
     */
    public static function forSubject(Subject|string|null $subject, ?string $academicYear = null): string
    {
        if (is_string($subject)) {
            $subject = Subject::find($subject);
        }

        if (! $subject) {
            return self::QUARTER;
        }

        return self::forInstitution($subject->institution_id, $academicYear);
    }

    /**
     * Resolve the structure for the institution a user belongs to.
     */
    public static function forUser($user, ?string $academicYear = null): string
    {
        $institutionId = self::institutionIdForUser($user);

        return self::forInstitution($institutionId, $academicYear);
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
