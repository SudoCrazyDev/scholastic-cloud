<?php

namespace App\Services\Tala\Tools;

use App\Models\StudentAssessmentAttempt;
use App\Models\SubjectEcrItem;
use App\Services\Tala\Assessments\AssessmentPresenter;
use App\Support\GradingPeriods;
use Illuminate\Database\Eloquent\Collection;

/**
 * One assessment in full, questions and answer keys included.
 *
 * The model needs this before proposing an edit: an update replaces the whole
 * question set, so proposing one without having read the current set means
 * silently dropping whatever it did not know about. The propose tool says so,
 * and this is the tool it points at.
 *
 * Answer keys are shown as readable choice text rather than the stored letters —
 * see AssessmentPresenter.
 */
class GetAssessmentTool implements TalaTool
{
    private const MAX_CANDIDATES = 12;

    public function name(): string
    {
        return 'get_assessment';
    }

    public function description(): string
    {
        return <<<'TEXT'
            Read one of the teacher's own assessments in full: every question, its choices,
            its answer key and its points, plus whether it is published and how many
            students have submitted.

            Use this when the teacher asks what is in an assessment, and **always before
            proposing an update to one** — an update replaces the entire question set, so
            you must know what is currently in it or you will drop questions the teacher
            wanted to keep.

            Find the exact title with `list_assessments` first if you are not certain of it.

            Scope: only assessments belonging to this teacher's own assigned subjects.
            TEXT;
    }

    public function inputSchema(): array
    {
        return [
            'type' => 'object',
            'properties' => [
                'title' => [
                    'type' => 'string',
                    'description' => 'Required. The assessment title, or enough of it to identify one.',
                ],
                'subject' => [
                    'type' => 'string',
                    'description' => 'Optional. Narrow to subjects whose title contains this text.',
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
            return ToolOutcome::error('An assessment title is required. Use list_assessments to find one.');
        }

        $matches = static::resolve($input, $context, $title);

        if ($matches->isEmpty()) {
            return ToolOutcome::ok(
                [
                    'found' => false,
                    'searched_for' => $title,
                    'note' => 'No assessment with that title exists in this teacher\'s subjects. Use '
                        .'list_assessments to see what they have, and do not describe the contents of '
                        .'an assessment that was not found.',
                ],
                'No assessment matched "'.$title.'"',
            );
        }

        $periodType = GradingPeriods::forInstitution($context->institutionId);
        $item = static::pick($matches, $title);

        if ($item === null) {
            return ToolOutcome::ok(
                [
                    'found' => false,
                    'ambiguous' => true,
                    'searched_for' => $title,
                    'candidates' => $matches->take(self::MAX_CANDIDATES)
                        ->map(fn (SubjectEcrItem $match) => AssessmentPresenter::summary($match, $periodType))
                        ->values()
                        ->all(),
                    'note' => 'More than one assessment matches. Ask the teacher which one, or call '
                        .'again with a fuller title plus the subject or grading period.',
                ],
                $matches->count().' assessments matched "'.$title.'"',
            );
        }

        $attempts = StudentAssessmentAttempt::where('subject_ecr_item_id', $item->id)->count();

        return ToolOutcome::ok(
            array_filter([
                'found' => true,
                'assessment' => AssessmentPresenter::summary($item, $periodType, $attempts),
                'questions' => AssessmentPresenter::questions($item),
                'note' => $attempts > 0
                    ? 'This assessment already has student submissions. Changing or removing a '
                        .'question affects work that has been marked — tell the teacher before '
                        .'proposing an edit.'
                    : null,
            ], fn ($value) => $value !== null && $value !== []),
            $item->title,
        );
    }

    /**
     * Assessments in scope matching a title, most recent first.
     *
     * Shared with ProposeAssessmentTool, which resolves its target the same way
     * so a proposal and the lookup that preceded it cannot disagree.
     *
     * @param  array<string, mixed>  $input
     * @return Collection<int, SubjectEcrItem>
     */
    public static function resolve(array $input, ToolContext $context, string $title): Collection
    {
        $query = AssignedAssessmentScope::query($context)
            ->with([
                'subjectEcr:id,subject_id,title,percentage',
                'subjectEcr.subject:id,title,class_section_id',
                'subjectEcr.subject.classSection:id,title,grade_level',
                'questions',
            ])
            ->where('title', 'like', '%'.$title.'%');

        if ($subject = ToolInput::text($input, 'subject')) {
            $query->whereHas(
                'subjectEcr.subject',
                fn ($q) => $q->where('title', 'like', '%'.$subject.'%')
            );
        }

        if ($section = ToolInput::text($input, 'class_section')) {
            $query->whereHas(
                'subjectEcr.subject.classSection',
                fn ($q) => $q->where('title', 'like', '%'.$section.'%')
                    ->orWhere('grade_level', 'like', '%'.$section.'%')
            );
        }

        if ($period = ToolInput::period($input, 'grading_period')) {
            $query->where('quarter', $period);
        }

        return $query->orderByDesc('created_at')->limit(self::MAX_CANDIDATES + 1)->get();
    }

    /**
     * One match, or nothing.
     *
     * Same rule as GetLessonTool: a single hit wins, several hits are resolved
     * only by an exact title, and anything else is reported as ambiguous rather
     * than guessed. Guessing here would mean proposing a change to the wrong
     * assessment.
     *
     * @param  Collection<int, SubjectEcrItem>  $matches
     */
    public static function pick(Collection $matches, string $title): ?SubjectEcrItem
    {
        if ($matches->count() === 1) {
            return $matches->first();
        }

        $exact = $matches->filter(
            fn (SubjectEcrItem $match) => mb_strtolower(trim((string) $match->title)) === mb_strtolower($title)
        );

        return $exact->count() === 1 ? $exact->first() : null;
    }
}
