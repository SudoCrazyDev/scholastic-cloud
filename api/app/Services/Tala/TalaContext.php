<?php

namespace App\Services\Tala;

use App\Models\ClassSection;
use App\Models\Institution;
use App\Models\InstitutionAcademicYear;
use App\Models\Subject;
use App\Models\User;
use Carbon\CarbonImmutable;

/**
 * Builds Tala's system prompt: who is asking, where they teach, and what they
 * teach.
 *
 * Everything here is read once per turn and injected as text. Tala has no tools
 * in this version — it cannot look anything up, and it cannot write. That keeps
 * a chat module out of the question of what a given role may reach through an
 * assistant, which is a bigger design problem than it looks and does not need
 * solving to make the first version useful.
 *
 * The consequence to remember: this prompt is the entire world Tala can see. If
 * it is not written here, Tala does not know it, and will say so rather than
 * guess — the prompt tells it to.
 */
class TalaContext
{
    public function build(User $user, string $institutionId): string
    {
        $institution = Institution::find($institutionId);
        $academicYear = InstitutionAcademicYear::where('institution_id', $institutionId)
            ->where('is_current', true)
            ->first();

        $today = CarbonImmutable::now((string) config('tala.timezone', 'Asia/Manila'));

        $lines = [
            'You are Tala, the teaching assistant inside ScholasticCloud, a school management system used by schools in the Philippines. You are talking to a subject teacher.',
            '',
            '# Who you are talking to',
            'Teacher: '.$this->fullName($user),
            'School: '.($institution->title ?? 'Unknown'),
        ];

        if ($institution?->division) {
            $lines[] = 'Division: '.$institution->division;
        }

        if ($academicYear) {
            $lines[] = 'Academic year: '.$academicYear->year;
            $lines[] = 'Grading periods: '.str_replace('_', ' ', (string) $academicYear->grading_period_type);
        }

        $lines[] = "Today's date: ".$today->toFormattedDayDateString().' (Philippine time)';

        $load = $this->teachingLoad($user, $institutionId);

        $lines[] = '';
        $lines[] = '# Their teaching load';
        $lines[] = $load === []
            ? 'No subjects are assigned to this teacher for the current year.'
            : implode("\n", array_map(fn ($line) => '- '.$line, $load));

        $advisory = $this->advisorySections($user, $institutionId);

        if ($advisory !== []) {
            $lines[] = '';
            $lines[] = '# Sections they advise';
            $lines[] = implode("\n", array_map(fn ($line) => '- '.$line, $advisory));
        }

        $lines[] = '';
        $lines[] = <<<'GUIDANCE'
            # How to help

            You help with the work of teaching: lesson planning, explaining concepts, writing
            assessment items, drafting parent messages, marking rubrics, differentiating for
            learners who are behind or ahead, and thinking through classroom problems.

            Follow the DepEd K-12 MATATAG Curriculum when the question touches Philippine
            curriculum content, and use Philippine names, places, currency and examples in
            anything a class will see. Do not use MELCs or the old K-12 strands.

            # What you can and cannot see

            The summary above is a quick sketch. Use `list_assigned_subjects` when you need the
            detail behind it — class sizes, schedules, a particular section, another academic
            year — or when the teacher's question turns on what they actually teach. Look it up
            rather than asking them to tell you, and rather than working from the sketch when
            the specifics matter.

            That tool returns this teacher's own assigned subjects and nothing else. You cannot
            see another teacher's load, sections you are not assigned to, or any student's
            grades, attendance or records, and you cannot change anything in ScholasticCloud.
            This is a boundary of the system, not a setting — do not offer to look past it or
            suggest the teacher grant you access.

            If you are asked about a specific student's grades, attendance or records, say
            plainly that you cannot see them and point the teacher at the screen that can — the
            class record for scores, Consolidated Grades for report cards, Student Attendance
            for attendance. Never invent a number, a name, or a record. Guessing at a student's
            grade is worse than saying you do not know it.

            # How to write

            Write the way a helpful colleague in the staff room would: direct, warm, and to the
            point. Lead with the answer. Keep formatting light — a teacher reading this between
            classes does not need a document. Use headings and tables only when the content is
            genuinely a list or a comparison, and prefer plain sentences otherwise. Match the
            teacher's language: reply in Filipino or Taglish if that is how they wrote.
            GUIDANCE;

        return implode("\n", $lines);
    }

    private function fullName(User $user): string
    {
        return trim(implode(' ', array_filter([
            $user->first_name,
            $user->last_name,
        ]))) ?: 'Teacher';
    }

    /**
     * Subjects this teacher is assigned to. `adviser` on a subject is the
     * subject teacher — same column name as the section adviser, different
     * meaning.
     *
     * @return array<int, string>
     */
    private function teachingLoad(User $user, string $institutionId): array
    {
        return Subject::query()
            ->with('classSection:id,title,grade_level')
            ->where('institution_id', $institutionId)
            ->where('adviser', $user->id)
            ->orderBy('title')
            ->get()
            ->map(function (Subject $subject) {
                $section = $subject->classSection;

                $where = $section
                    ? trim(($section->grade_level ? 'Grade '.$section->grade_level.' ' : '').$section->title)
                    : null;

                return $where
                    ? "{$subject->title} — {$where}"
                    : (string) $subject->title;
            })
            ->filter()
            ->values()
            ->all();
    }

    /**
     * @return array<int, string>
     */
    private function advisorySections(User $user, string $institutionId): array
    {
        return ClassSection::query()
            ->where('institution_id', $institutionId)
            ->where('adviser', $user->id)
            ->orderBy('title')
            ->get()
            ->map(fn (ClassSection $section) => trim(
                ($section->grade_level ? 'Grade '.$section->grade_level.' ' : '').$section->title
            ))
            ->filter()
            ->values()
            ->all();
    }
}
