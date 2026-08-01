<?php

namespace App\Services\Tala\Tools;

use App\Models\StudentAssessmentAttempt;
use App\Models\SubjectEcrItem;
use App\Services\Tala\Assessments\AssessmentPresenter;
use App\Services\Tala\Assessments\AssessmentTypes;
use App\Support\GradingPeriods;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;

/**
 * The assessments a teacher already has — quizzes, assignments, exams.
 *
 * Read-only, and a prerequisite for the write path rather than a nicety: an
 * edit or a delete has to name an existing assessment, and the model needs to
 * have seen the list before it can name one that exists. It also stops Tala
 * proposing a duplicate of a quiz the teacher wrote last week.
 *
 * Attempt counts are included because they are what makes a change risky. A
 * draft with no attempts can be rewritten freely; a published exam with
 * thirty submissions cannot.
 */
class ListAssessmentsTool implements TalaTool
{
    private const MAX_RESULTS = 80;

    public function name(): string
    {
        return 'list_assessments';
    }

    public function description(): string
    {
        return <<<TEXT
            List the assessments the teacher has created for their own subjects — quizzes,
            assignments, activities, exams and projects — with type, draft/published status,
            question count, total points and how many students have already submitted.

            Call this whenever the teacher asks what assessments they have, and **always
            before proposing a change to an existing one**, so you name a real assessment
            and can see whether it is published or already has submissions.

            Types: {$this->typeList()}. Status is `draft` (students cannot see it) or
            `published` (they can).

            Scope: only assessments belonging to this teacher's own assigned subjects at
            their current school.
            TEXT;
    }

    public function inputSchema(): array
    {
        return [
            'type' => 'object',
            'properties' => [
                'subject' => [
                    'type' => 'string',
                    'description' => 'Optional. Narrow to subjects whose title contains this text.',
                ],
                'class_section' => [
                    'type' => 'string',
                    'description' => 'Optional. Narrow to class sections whose name or grade level contains this text.',
                ],
                'grading_period' => [
                    'type' => 'string',
                    'description' => 'Optional. The grading period as a plain number: "1", "2", "3" or "4".',
                ],
                'assessment_type' => [
                    'type' => 'string',
                    'enum' => AssessmentTypes::typeKeys(),
                    'description' => 'Optional. Narrow to one kind of assessment.',
                ],
                'status' => [
                    'type' => 'string',
                    'enum' => ['draft', 'published'],
                    'description' => 'Optional. Narrow to drafts or to published assessments.',
                ],
                'search' => [
                    'type' => 'string',
                    'description' => 'Optional. Narrow to assessments whose title contains this text.',
                ],
            ],
            'additionalProperties' => false,
        ];
    }

    public function run(array $input, ToolContext $context): ToolOutcome
    {
        $periodType = GradingPeriods::forInstitution($context->institutionId);

        // Starts from the scope, always.
        $query = AssignedAssessmentScope::query($context)
            ->with([
                'subjectEcr:id,subject_id,title,percentage',
                'subjectEcr.subject:id,title,class_section_id',
                'subjectEcr.subject.classSection:id,title,grade_level',
                'questions',
            ]);

        $this->applyFilters($query, $input);

        /** @var Collection<int, SubjectEcrItem> $items */
        $items = $query
            ->orderByDesc('created_at')
            ->limit(self::MAX_RESULTS + 1)
            ->get();

        $truncated = $items->count() > self::MAX_RESULTS;
        $items = $items->take(self::MAX_RESULTS);

        if ($items->isEmpty()) {
            return ToolOutcome::ok(
                [
                    'count' => 0,
                    'assessments' => [],
                    'note' => 'This teacher has no assessments matching that. Do not describe '
                        .'assessments they might have. If they want one, offer to draft it with '
                        .'propose_assessment.',
                ],
                'No assessments found',
            );
        }

        $attempts = $this->attemptCounts($items);

        $rows = $items->map(fn (SubjectEcrItem $item) => AssessmentPresenter::summary(
            $item,
            $periodType,
            $attempts[$item->id] ?? 0,
        ))->values()->all();

        return ToolOutcome::ok(
            array_filter([
                'count' => count($rows),
                'assessments' => $rows,
                'truncated' => $truncated ?: null,
                'note' => $truncated
                    ? 'More assessments exist than are shown. Narrow by subject, type or grading period.'
                    : null,
            ], fn ($value) => $value !== null),
            count($rows).' '.(count($rows) === 1 ? 'assessment' : 'assessments'),
        );
    }

    /**
     * @param  array<string, mixed>  $input
     */
    private function applyFilters(Builder $query, array $input): void
    {
        if ($subject = ToolInput::text($input, 'subject')) {
            $query->whereHas(
                'subjectEcr.subject',
                fn (Builder $q) => $q->where('title', 'like', '%'.$subject.'%')
            );
        }

        if ($section = ToolInput::text($input, 'class_section')) {
            $query->whereHas(
                'subjectEcr.subject.classSection',
                fn (Builder $q) => $q->where('title', 'like', '%'.$section.'%')
                    ->orWhere('grade_level', 'like', '%'.$section.'%')
            );
        }

        if ($period = ToolInput::period($input, 'grading_period')) {
            $query->where('quarter', $period);
        }

        $type = ToolInput::text($input, 'assessment_type');

        if ($type !== null && AssessmentTypes::isType($type)) {
            $query->where('type', $type);
        }

        $status = ToolInput::text($input, 'status');

        if (in_array($status, [AssessmentTypes::STATUS_DRAFT, AssessmentTypes::STATUS_PUBLISHED], true)) {
            $query->where('status', $status);
        }

        if ($search = ToolInput::text($input, 'search')) {
            $query->where('title', 'like', '%'.$search.'%');
        }
    }

    /**
     * Submissions per assessment, in one query rather than one per row.
     *
     * @param  Collection<int, SubjectEcrItem>  $items
     * @return array<string, int>
     */
    private function attemptCounts(Collection $items): array
    {
        return array_map('intval', StudentAssessmentAttempt::query()
            ->whereIn('subject_ecr_item_id', $items->pluck('id'))
            ->selectRaw('subject_ecr_item_id, COUNT(*) as total')
            ->groupBy('subject_ecr_item_id')
            ->pluck('total', 'subject_ecr_item_id')
            ->all());
    }

    private function typeList(): string
    {
        return implode(', ', AssessmentTypes::typeKeys());
    }
}
