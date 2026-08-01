<?php

namespace App\Services\Tala;

use App\Models\ClassSection;

/**
 * Naming a class section the way a teacher would say it.
 *
 * `class_sections.grade_level` holds the whole label — "Grade 7", not "7" — and
 * SubjectDetail renders it as `{grade_level} - {title}`. Prefixing "Grade "
 * onto it produces "Grade Grade 7", which is what Tala was telling the model
 * before this existed. The digits-only branch is kept because a school could
 * reasonably have stored a bare "7", and one wrong label is cheaper to guard
 * against than to explain.
 */
class SectionLabel
{
    public static function for(?ClassSection $section, string $separator = ' — '): ?string
    {
        if (! $section) {
            return null;
        }

        $parts = array_filter([
            static::gradeLevel($section->grade_level),
            trim((string) $section->title) ?: null,
        ]);

        return $parts === [] ? null : implode($separator, $parts);
    }

    private static function gradeLevel(?string $gradeLevel): ?string
    {
        $gradeLevel = trim((string) $gradeLevel);

        if ($gradeLevel === '') {
            return null;
        }

        return ctype_digit($gradeLevel) ? 'Grade '.$gradeLevel : $gradeLevel;
    }
}
