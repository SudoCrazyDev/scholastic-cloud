<?php

namespace App\Services\Tala\Tools;

use App\Models\SubjectEcr;
use App\Models\SubjectEcrItem;
use Illuminate\Database\Eloquent\Builder;

/**
 * The only way the tool layer is allowed to reach an assessment.
 *
 * An assessment (`subject_ecr_items`, the "assessment method" of the
 * `assessment-methods/*` routes) hangs off a grading component
 * (`subjects_ecr`), which hangs off a subject. Neither intermediate table has an
 * owner column, so the boundary is inherited two levels down from
 * AssignedSubjectScope — the same pattern AssignedLessonScope uses, one join
 * deeper.
 *
 * This scope guards **writes as well as reads**, and it is the reason the write
 * path is safe: the applier resolves its target through `find()` here, so a
 * proposal can only ever name an assessment belonging to the teacher who is
 * about to approve it.
 */
class AssignedAssessmentScope
{
    public static function query(ToolContext $context): Builder
    {
        return SubjectEcrItem::query()
            ->whereIn('subject_ecr_id', static::componentQuery($context)->select('subjects_ecr.id'));
    }

    /**
     * The grading components — "Written Works 30%", "Performance Tasks 50%" —
     * of the teacher's own subjects. A new assessment has to be filed under one
     * of these, and which one changes how it weighs in the running grade, so it
     * is the teacher's call rather than the model's guess.
     */
    public static function componentQuery(ToolContext $context): Builder
    {
        return SubjectEcr::query()
            ->whereIn('subject_id', AssignedSubjectScope::query($context)->select('subjects.id'));
    }

    /**
     * Resolve an assessment id through the scope.
     *
     * Returns null for an id that exists but is not this teacher's, so an
     * outsider's id and a nonexistent one are indistinguishable — the same
     * property AssignedSubjectScope::find() has, and the one the applier relies
     * on when it re-checks a proposal at approval time.
     */
    public static function find(ToolContext $context, string $itemId): ?SubjectEcrItem
    {
        return static::query($context)->find($itemId);
    }

    /**
     * Resolve a grading component id through the scope.
     */
    public static function findComponent(ToolContext $context, string $componentId): ?SubjectEcr
    {
        return static::componentQuery($context)->find($componentId);
    }
}
