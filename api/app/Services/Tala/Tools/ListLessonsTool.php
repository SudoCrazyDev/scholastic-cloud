<?php

namespace App\Services\Tala\Tools;

use App\Models\Topic;
use App\Services\Tala\SectionLabel;
use App\Support\GradingPeriods;
use Illuminate\Database\Eloquent\Collection;

/**
 * The lessons a teacher has built for their own subjects.
 *
 * This tool exists because of a specific failure. Asked "what lessons do I have
 * for Term 1", a Tala with no way to look them up answered from general
 * knowledge of the DepEd curriculum and presented the result as the teacher's
 * own plan. Every word of it was invented. A read tool closes that off properly:
 * the answer now comes from the `topics` rows the teacher wrote, and an empty
 * result is reported as empty.
 *
 * Titles and summaries only. The body of a lesson comes from GetLessonTool, one
 * lesson at a time, so a teacher with a full year of material does not spend a
 * turn's context listing it.
 */
class ListLessonsTool implements TalaTool
{
    /**
     * Enough for a year of one subject, or a period across several. Past this
     * the result says so and asks the model to narrow, which is more useful than
     * a silently clipped list.
     */
    private const MAX_RESULTS = 100;

    private const MAX_DESCRIPTION_CHARS = 220;

    public function name(): string
    {
        return 'list_lessons';
    }

    public function description(): string
    {
        return <<<'TEXT'
            List the lessons the teacher has created in ScholasticCloud for their own
            subjects, with the grading period, class section, learning objectives and
            what each lesson contains.

            These are the teacher's actual saved lessons. Call this — do not answer from
            general curriculum knowledge — whenever the teacher asks what lessons, topics
            or coverage they have: "what lessons do I have for Term 1", "what have I
            covered in Science", "which lessons are still unpublished", "what should I
            teach next". If this returns no lessons, the teacher genuinely has none saved
            for what was asked; say that plainly rather than describing lessons they might
            have.

            Returns summaries. Use `get_lesson` for the full content of one lesson.

            Scope: only lessons belonging to this teacher's own assigned subjects at their
            current school. Another teacher's lessons, other sections, and student work
            cannot be reached through this tool.
            TEXT;
    }

    public function inputSchema(): array
    {
        return [
            'type' => 'object',
            'properties' => [
                'subject' => [
                    'type' => 'string',
                    'description' => 'Optional. Narrow to subjects whose title contains this text, e.g. "Science".',
                ],
                'class_section' => [
                    'type' => 'string',
                    'description' => 'Optional. Narrow to class sections whose name or grade level contains this text, e.g. "Sincerity" or "Grade 7".',
                ],
                'grading_period' => [
                    'type' => 'string',
                    'description' => 'Optional. The grading period as a plain number: "1", "2", "3" or "4". Use "1" for the first quarter or first term.',
                ],
                'search' => [
                    'type' => 'string',
                    'description' => 'Optional. Narrow to lessons whose title or description contains this text.',
                ],
                'include_unpublished' => [
                    'type' => 'boolean',
                    'description' => 'Optional, defaults to true. Unpublished lessons are drafts the students cannot see yet. Set false to list only what students can see.',
                ],
            ],
            'additionalProperties' => false,
        ];
    }

    public function run(array $input, ToolContext $context): ToolOutcome
    {
        $periodType = GradingPeriods::forInstitution($context->institutionId);

        // Starts from the scope, always. The filters can only narrow it.
        $query = AssignedLessonScope::query($context)
            ->with(['subject:id,title,class_section_id', 'subject.classSection:id,title,grade_level']);

        AssignedLessonScope::applyFilters($query, $input);

        if (! ToolInput::boolean($input, 'include_unpublished', true)) {
            $query->where('is_published', true);
        }

        /** @var Collection<int, Topic> $lessons */
        $lessons = $query
            ->orderBy('quarter')
            ->orderBy('order')
            ->orderBy('title')
            ->limit(self::MAX_RESULTS + 1)
            ->get();

        $truncated = $lessons->count() > self::MAX_RESULTS;
        $lessons = $lessons->take(self::MAX_RESULTS);

        if ($lessons->isEmpty()) {
            return $this->emptyResult($input, $context, $periodType);
        }

        $rows = $lessons->map(fn (Topic $lesson) => array_filter([
            'title' => $lesson->title,
            'subject' => $lesson->subject?->title,
            'section' => $this->sectionName($lesson),
            'grading_period' => $lesson->quarter
                ? GradingPeriods::noun($periodType).' '.$lesson->quarter
                : null,
            'summary' => LessonText::plain($lesson->description, self::MAX_DESCRIPTION_CHARS),
            'learning_objectives' => $this->objectives($lesson),
            'estimated_minutes' => $lesson->estimated_minutes,
            'status' => $lesson->is_completed ? 'taught' : 'not yet taught',
            'visible_to_students' => $lesson->is_published,
            'contains' => LessonText::blockCounts($lesson->content),
        ], fn ($value) => $value !== null && $value !== []))->values()->all();

        return ToolOutcome::ok(
            array_filter([
                'count' => count($rows),
                'lessons' => $rows,
                'truncated' => $truncated ?: null,
                'note' => $truncated
                    ? 'More lessons exist than are shown. Narrow by subject or grading period.'
                    : null,
            ], fn ($value) => $value !== null),
            count($rows).' '.(count($rows) === 1 ? 'lesson' : 'lessons'),
        );
    }

    /**
     * Nothing matched — say what the teacher does have.
     *
     * "No lessons found" on its own invites the model to fill the silence, and
     * it is also just unhelpful: a teacher who asked about the wrong period, or
     * whose lessons are filed under a period they did not expect, learns nothing
     * from it. So the miss is reported alongside a breakdown of where their
     * lessons actually are, which is still strictly inside the same scope.
     *
     * @param  array<string, mixed>  $input
     */
    private function emptyResult(array $input, ToolContext $context, string $periodType): ToolOutcome
    {
        $noun = GradingPeriods::noun($periodType);

        $available = AssignedLessonScope::query($context)
            ->selectRaw('quarter, COUNT(*) as total')
            ->groupBy('quarter')
            ->pluck('total', 'quarter');

        $elsewhere = [];
        foreach ($available as $quarter => $total) {
            $key = $quarter ? $noun.' '.$quarter : 'no grading period set';
            $elsewhere[$key] = (int) $total;
        }

        $note = $elsewhere === []
            ? 'This teacher has not created any lessons in ScholasticCloud yet, for any subject or '
                .strtolower($noun).'. Do not describe lessons they might have — there are none saved. '
                .'They create them under Subjects → Lessons.'
            : 'No saved lessons match that. The teacher does have lessons elsewhere — see '
                .'lessons_by_'.strtolower($noun).' — so check whether a different '.strtolower($noun)
                .' or subject was meant. Do not substitute lessons from general curriculum knowledge.';

        return ToolOutcome::ok(
            array_filter([
                'count' => 0,
                'lessons' => [],
                'requested_grading_period' => ToolInput::period($input, 'grading_period'),
                'lessons_by_'.strtolower($noun) => $elsewhere ?: null,
                'note' => $note,
            ], fn ($value) => $value !== null),
            'No saved lessons found',
        );
    }

    private function sectionName(Topic $lesson): ?string
    {
        return SectionLabel::for($lesson->subject?->classSection);
    }

    /**
     * @return array<int, string>
     */
    private function objectives(Topic $lesson): array
    {
        $objectives = is_array($lesson->learning_objectives) ? $lesson->learning_objectives : [];

        return array_values(array_filter(array_map(
            fn ($objective) => is_string($objective) ? trim($objective) : null,
            $objectives
        ), fn ($objective) => $objective !== null && $objective !== ''));
    }
}
