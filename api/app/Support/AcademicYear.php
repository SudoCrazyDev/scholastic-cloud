<?php

namespace App\Support;

use App\Models\Institution;
use App\Models\Subject;
use Illuminate\Support\Carbon;

/**
 * Resolves which school year a newly created record belongs to.
 *
 * Grade items, running grades and report cards are all scoped by academic year,
 * so a record saved without one drops out of every year-filtered query. A grade
 * item with no year is invisible to the running-grade calculation, which then
 * sums nothing and stores a calculated grade of zero even though the teacher
 * entered scores. Everything that creates such a record resolves its year here.
 */
class AcademicYear
{
    /**
     * The year a subject's records belong to.
     *
     * The subject's class section is the closest thing to an owner of the year;
     * only when it has none do we fall back to the institution-wide setting.
     */
    public static function forSubject(Subject|string|null $subject): string
    {
        if (is_string($subject)) {
            $subject = Subject::with('classSection')->find($subject);
        }

        $sectionYear = $subject?->classSection?->academic_year;

        return $sectionYear ?: self::forInstitution($subject?->institution_id);
    }

    /**
     * The institution's current school year, or the calendar-derived one when a
     * school has never set it in Settings.
     */
    public static function forInstitution(?string $institutionId): string
    {
        $current = $institutionId
            ? Institution::whereKey($institutionId)->value('current_academic_year')
            : null;

        return $current ?: self::derivedFromToday();
    }

    /**
     * School years run June through May, so January–May still belongs to the
     * year that started the previous June.
     */
    public static function derivedFromToday(): string
    {
        $today = Carbon::now();
        $startYear = $today->month >= 6 ? $today->year : $today->year - 1;

        return $startYear . '-' . ($startYear + 1);
    }
}
