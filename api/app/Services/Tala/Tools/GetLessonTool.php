<?php

namespace App\Services\Tala\Tools;

use App\Models\Topic;
use App\Services\Tala\SectionLabel;
use App\Support\GradingPeriods;
use Illuminate\Database\Eloquent\Collection;

/**
 * One lesson, in full: what the teacher actually wrote in it.
 *
 * Separate from ListLessonsTool because the two answer different questions and
 * cost very different amounts. A list of forty lesson titles is cheap; forty
 * lesson bodies would not fit in a turn. So the model surveys with the list tool
 * and opens a lesson here once it knows which one matters.
 *
 * A lesson is named by its title, not an id. Nothing in the chat ever holds a
 * row identifier, so there is no id to leak and none to guess at — the title is
 * resolved through AssignedLessonScope, and a title belonging to another
 * teacher's lesson simply does not resolve.
 */
class GetLessonTool implements TalaTool
{
    /** Ambiguity is reported, not resolved by picking one. */
    private const MAX_CANDIDATES = 12;

    /**
     * A lesson body is teacher-written prose and can be long. The cap is
     * generous enough for a full lesson and small enough that one lookup cannot
     * crowd out the rest of the turn.
     */
    private const MAX_BODY_CHARS = 8000;

    public function name(): string
    {
        return 'get_lesson';
    }

    public function description(): string
    {
        return <<<'TEXT'
            Read one of the teacher's own saved lessons in full: its description, learning
            objectives, and the reading text, videos, attachments and linked assessments it
            is built from.

            Use this when the teacher asks about the content of a specific lesson — "what's
            in my lesson on photosynthesis", "does my Term 1 lesson cover measurement",
            "write a quiz based on my lesson about matter". Find the title with
            `list_lessons` first if you are not certain what it is called.

            Everything returned is what the teacher wrote. Treat it as the authoritative
            version of their lesson and do not blend it with your own curriculum knowledge
            without saying which is which.

            Scope: only lessons belonging to this teacher's own assigned subjects at their
            current school.
            TEXT;
    }

    public function inputSchema(): array
    {
        return [
            'type' => 'object',
            'properties' => [
                'title' => [
                    'type' => 'string',
                    'description' => 'Required. The lesson title, or enough of it to identify the lesson.',
                ],
                'subject' => [
                    'type' => 'string',
                    'description' => 'Optional. Narrow to subjects whose title contains this text. Use when the same lesson title exists in more than one subject.',
                ],
                'class_section' => [
                    'type' => 'string',
                    'description' => 'Optional. Narrow to class sections whose name or grade level contains this text.',
                ],
                'grading_period' => [
                    'type' => 'string',
                    'description' => 'Optional. The grading period as a plain number: "1", "2", "3" or "4".',
                ],
            ],
            'required' => ['title'],
            'additionalProperties' => false,
        ];
    }

    public function run(array $input, ToolContext $context): ToolOutcome
    {
        $title = ToolInput::text($input, 'title');

        if ($title === null) {
            return ToolOutcome::error('A lesson title is required. Use list_lessons to find one.');
        }

        $periodType = GradingPeriods::forInstitution($context->institutionId);

        $query = AssignedLessonScope::query($context)
            ->with(['subject:id,title,class_section_id', 'subject.classSection:id,title,grade_level'])
            ->where('title', 'like', '%'.$title.'%');

        // The title is handled above; the rest are ordinary narrowing filters.
        AssignedLessonScope::applyFilters($query, array_diff_key($input, ['search' => null]));

        /** @var Collection<int, Topic> $matches */
        $matches = $query
            ->orderBy('quarter')
            ->orderBy('order')
            ->limit(self::MAX_CANDIDATES + 1)
            ->get();

        if ($matches->isEmpty()) {
            return ToolOutcome::ok(
                [
                    'found' => false,
                    'searched_for' => $title,
                    'note' => 'No lesson with that title exists in this teacher\'s subjects. Use '
                        .'list_lessons to see what they actually have saved, and do not describe '
                        .'the contents of a lesson that was not found.',
                ],
                'No lesson matched "'.$title.'"',
            );
        }

        $lesson = $this->pick($matches, $title);

        if ($lesson === null) {
            return ToolOutcome::ok(
                [
                    'found' => false,
                    'ambiguous' => true,
                    'searched_for' => $title,
                    'candidates' => $matches->take(self::MAX_CANDIDATES)->map(fn (Topic $match) => array_filter([
                        'title' => $match->title,
                        'subject' => $match->subject?->title,
                        'section' => $this->sectionName($match),
                        'grading_period' => $match->quarter
                            ? GradingPeriods::noun($periodType).' '.$match->quarter
                            : null,
                    ], fn ($value) => $value !== null))->values()->all(),
                    'note' => 'More than one lesson matches. Ask the teacher which one, or call '
                        .'again with a fuller title plus the subject or grading period.',
                ],
                $matches->count().' lessons matched "'.$title.'"',
            );
        }

        return ToolOutcome::ok(
            array_filter([
                'found' => true,
                'title' => $lesson->title,
                'subject' => $lesson->subject?->title,
                'section' => $this->sectionName($lesson),
                'grading_period' => $lesson->quarter
                    ? GradingPeriods::noun($periodType).' '.$lesson->quarter
                    : null,
                'description' => LessonText::plain($lesson->description, self::MAX_BODY_CHARS),
                'learning_objectives' => $this->objectives($lesson),
                'estimated_minutes' => $lesson->estimated_minutes,
                'status' => $lesson->is_completed ? 'taught' : 'not yet taught',
                'visible_to_students' => $lesson->is_published,
                'content' => $this->body($lesson),
            ], fn ($value) => $value !== null && $value !== []),
            $lesson->title,
        );
    }

    /**
     * Resolve a title to one lesson, or to nothing.
     *
     * A single match is the answer. Several matches are only resolved when one
     * of them is the title exactly — a teacher who typed the full title of a
     * lesson that happens to be a prefix of another should get the one they
     * named. Anything else is genuinely ambiguous and is reported as such
     * instead of guessed at, because guessing here means confidently describing
     * the wrong lesson.
     *
     * @param  Collection<int, Topic>  $matches
     */
    private function pick(Collection $matches, string $title): ?Topic
    {
        if ($matches->count() === 1) {
            return $matches->first();
        }

        $exact = $matches->filter(
            fn (Topic $match) => mb_strtolower(trim((string) $match->title)) === mb_strtolower($title)
        );

        return $exact->count() === 1 ? $exact->first() : null;
    }

    /**
     * The lesson body, trimmed to fit a chat turn.
     *
     * Truncation is by block rather than by character across the whole payload:
     * cutting mid-block would hand the model half a sentence with no indication
     * that anything was missing, and it would present that half as the lesson.
     *
     * @return array<int, array<string, mixed>>
     */
    private function body(Topic $lesson): array
    {
        $blocks = LessonText::blocks($lesson->content);
        $kept = [];
        $spent = 0;

        foreach ($blocks as $index => $block) {
            $size = mb_strlen((string) json_encode($block));

            if ($spent + $size > self::MAX_BODY_CHARS && $kept !== []) {
                $kept[] = [
                    'type' => 'note',
                    'text' => 'The remaining '.(count($blocks) - $index).' part(s) of this lesson '
                        .'were not included because the lesson is long. Tell the teacher the rest '
                        .'was not loaded rather than assuming what it contains.',
                ];
                break;
            }

            $kept[] = $block;
            $spent += $size;
        }

        return $kept;
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
