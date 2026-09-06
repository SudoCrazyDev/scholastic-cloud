<?php

namespace App\Support;

use App\Models\StudentSection;
use App\Models\StudentSubject;
use App\Models\Subject;
use Illuminate\Support\Collection;

/**
 * Who is expected to sit in a subject.
 *
 * The mirror image of ResolvesStudentSubjects, which answers the same question
 * from the student's side ("which subjects may I open?"). Both have to agree:
 * a submission rate whose denominator counts students the portal would never
 * show the assessment to reads as a teacher's failure when it is arithmetic.
 * So the rule is written once —
 *
 *   - an explicit, active `student_subjects` row always counts;
 *   - a subject that is not limited also takes the active students of its
 *     class section.
 *
 * — and both sides call it.
 */
class SubjectRoster
{
    /**
     * Student ids expected in one subject.
     *
     * @return array<int, string>
     */
    public static function studentIdsFor(?Subject $subject): array
    {
        if (! $subject) {
            return [];
        }

        return self::studentIdsForMany(collect([$subject]))[$subject->id] ?? [];
    }

    public static function countFor(?Subject $subject): int
    {
        return count(self::studentIdsFor($subject));
    }

    /**
     * Student ids for many subjects at once, keyed by subject id.
     *
     * Two queries whatever the number of subjects — the monitor asks this for
     * every subject in a school, and doing it per subject is what turns one
     * screen into a thousand round trips.
     *
     * @param  Collection<int, Subject>  $subjects
     * @return array<string, array<int, string>>
     */
    public static function studentIdsForMany(Collection $subjects): array
    {
        if ($subjects->isEmpty()) {
            return [];
        }

        $byId = $subjects->keyBy('id');

        $explicit = StudentSubject::whereIn('subject_id', $byId->keys())
            ->where('is_active', true)
            ->get(['subject_id', 'student_id'])
            ->groupBy('subject_id');

        // Only sections behind a non-limited subject matter: a limited subject
        // takes nobody from its section, however many students are in it.
        $sectionIds = $subjects
            ->reject(fn (Subject $subject) => (bool) $subject->is_limited_student)
            ->pluck('class_section_id')
            ->filter()
            ->unique();

        $bySection = $sectionIds->isEmpty()
            ? collect()
            : StudentSection::whereIn('section_id', $sectionIds)
                ->where('is_active', true)
                ->get(['section_id', 'student_id'])
                ->groupBy('section_id');

        $rosters = [];

        foreach ($byId as $subjectId => $subject) {
            $ids = ($explicit[$subjectId] ?? collect())->pluck('student_id');

            if (! $subject->is_limited_student && $subject->class_section_id) {
                $ids = $ids->merge(
                    ($bySection[$subject->class_section_id] ?? collect())->pluck('student_id')
                );
            }

            $rosters[$subjectId] = $ids->unique()->values()->all();
        }

        return $rosters;
    }
}
