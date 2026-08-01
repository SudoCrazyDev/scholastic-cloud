<?php

namespace App\Services\Tala\Tools;

use App\Models\ClassSection;
use App\Models\InstitutionAcademicYear;
use App\Models\StudentSection;
use App\Models\StudentSubject;
use App\Models\Subject;
use Illuminate\Database\Eloquent\Collection;

/**
 * Tala's first tool: the teacher's own teaching load.
 *
 * Mirrors what the My Assigned Subjects screen shows, minus the
 * institution-wide widening that screen grants to principals and department
 * heads — see AssignedSubjectScope for why.
 *
 * Subject ids are not returned. Nothing downstream needs one yet, and leaving
 * them out means the model has no row identifier to put in a later argument.
 */
class ListAssignedSubjectsTool implements TalaTool
{
    /** Nobody teaches this many. A cap keeps one turn's context bounded. */
    private const MAX_RESULTS = 60;

    public function name(): string
    {
        return 'list_assigned_subjects';
    }

    public function description(): string
    {
        return <<<'TEXT'
            List the subjects assigned to the teacher you are talking to, with their class
            section, grade level, schedule and class size.

            Use this whenever the answer depends on what they actually teach — "how many
            classes do I have", "plan a lesson for my Grade 7 class", "which of my sections
            is biggest". Prefer calling it over asking the teacher to tell you their load.

            Scope: only this teacher's own assigned subjects at their current school. You
            cannot see another teacher's load, other sections, or any student's records
            through this tool, and there is no way to ask it for them.
            TEXT;
    }

    public function inputSchema(): array
    {
        return [
            'type' => 'object',
            'properties' => [
                'search' => [
                    'type' => 'string',
                    'description' => 'Optional. Narrow to subjects whose title contains this text.',
                ],
                'class_section' => [
                    'type' => 'string',
                    'description' => 'Optional. Narrow to class sections whose name contains this text, e.g. "Rizal" or "Grade 7".',
                ],
                'academic_year' => [
                    'type' => 'string',
                    'description' => 'Optional, e.g. "2025-2026". Defaults to the school\'s current academic year.',
                ],
            ],
            'additionalProperties' => false,
        ];
    }

    public function run(array $input, ToolContext $context): ToolOutcome
    {
        $academicYear = $this->academicYear($input, $context);

        // Starts from the scope, always. The filters below can only narrow it.
        $query = AssignedSubjectScope::query($context)
            ->with(['classSection:id,title,grade_level,academic_year']);

        if ($search = $this->text($input, 'search')) {
            $query->where('title', 'like', '%'.$search.'%');
        }

        if ($section = $this->text($input, 'class_section')) {
            $query->whereHas('classSection', function ($q) use ($section) {
                $q->where('title', 'like', '%'.$section.'%')
                    ->orWhere('grade_level', 'like', '%'.$section.'%');
            });
        }

        if ($academicYear !== null) {
            $query->whereHas('classSection', fn ($q) => $q->where('academic_year', $academicYear));
        }

        /** @var Collection<int, Subject> $subjects */
        $subjects = $query
            ->orderBy('order')
            ->orderBy('title')
            ->limit(self::MAX_RESULTS)
            ->get();

        if ($subjects->isEmpty()) {
            return ToolOutcome::ok(
                [
                    'academic_year' => $academicYear,
                    'count' => 0,
                    'subjects' => [],
                    'note' => 'No subjects are assigned to this teacher'
                        .($academicYear ? " for {$academicYear}." : '.')
                        .' Their school assigns teaching loads under Subjects.',
                ],
                'No assigned subjects found',
            );
        }

        $enrolment = $this->enrolmentCounts($subjects);

        $rows = $subjects->map(fn (Subject $subject) => array_filter([
            'subject' => $subject->title,
            'variant' => $subject->variant,
            'type' => $subject->subject_type,
            'section' => $this->sectionName($subject->classSection),
            'grade_level' => $subject->classSection?->grade_level,
            'academic_year' => $subject->classSection?->academic_year,
            'schedule' => $this->schedule($subject),
            'grading_type' => $subject->grading_type,
            'students' => $enrolment[$subject->id] ?? null,
            'roster' => $subject->is_limited_student ? 'selected students only' : null,
        ], fn ($value) => $value !== null && $value !== []))->values()->all();

        return ToolOutcome::ok(
            [
                'academic_year' => $academicYear,
                'count' => count($rows),
                'subjects' => $rows,
                'truncated' => $subjects->count() >= self::MAX_RESULTS,
            ],
            count($rows).' assigned '.(count($rows) === 1 ? 'subject' : 'subjects'),
        );
    }

    /**
     * Class size, resolved the way the subject is actually taught: a subject
     * with a limited roster counts its own enrolment, an ordinary one counts
     * the section it belongs to.
     *
     * Both counts are gathered in one query each rather than per subject — a
     * full teaching load would otherwise be a few dozen round trips inside a
     * single chat turn.
     *
     * @param  Collection<int, Subject>  $subjects
     * @return array<string, int>
     */
    private function enrolmentCounts(Collection $subjects): array
    {
        $counts = [];

        $limited = $subjects->where('is_limited_student', true);
        $sectionBased = $subjects->where('is_limited_student', false)
            ->filter(fn (Subject $s) => $s->class_section_id !== null);

        if ($limited->isNotEmpty()) {
            $counts += StudentSubject::query()
                ->whereIn('subject_id', $limited->pluck('id'))
                ->selectRaw('subject_id, COUNT(*) as total')
                ->groupBy('subject_id')
                ->pluck('total', 'subject_id')
                ->all();
        }

        if ($sectionBased->isNotEmpty()) {
            $bySection = StudentSection::query()
                ->whereIn('section_id', $sectionBased->pluck('class_section_id')->unique())
                ->where('is_active', true)
                ->selectRaw('section_id, COUNT(*) as total')
                ->groupBy('section_id')
                ->pluck('total', 'section_id');

            foreach ($sectionBased as $subject) {
                $counts[$subject->id] = (int) ($bySection[$subject->class_section_id] ?? 0);
            }
        }

        return array_map('intval', $counts);
    }

    private function sectionName(?ClassSection $section): ?string
    {
        if (! $section) {
            return null;
        }

        return trim(($section->grade_level ? 'Grade '.$section->grade_level.' — ' : '').$section->title);
    }

    /**
     * @return array<string, mixed>
     */
    private function schedule(Subject $subject): array
    {
        return array_filter([
            'days' => $subject->meeting_days ?: null,
            'start' => $subject->start_time?->format('H:i'),
            'end' => $subject->end_time?->format('H:i'),
        ], fn ($value) => $value !== null);
    }

    /**
     * The year to report on: whatever the model asked for, else the school's
     * current one. Null when the school has not set a current year, which
     * simply means "do not filter by year".
     */
    private function academicYear(array $input, ToolContext $context): ?string
    {
        if ($requested = $this->text($input, 'academic_year')) {
            return $requested;
        }

        return InstitutionAcademicYear::query()
            ->where('institution_id', $context->institutionId)
            ->where('is_current', true)
            ->value('year');
    }

    /**
     * Model arguments arrive as whatever the model felt like sending — a
     * number, a null, an array. Anything that is not a usable string is
     * treated as absent rather than passed to the query builder.
     */
    private function text(array $input, string $key): ?string
    {
        $value = $input[$key] ?? null;

        if (! is_string($value)) {
            return null;
        }

        $value = trim($value);

        return $value === '' ? null : $value;
    }
}
