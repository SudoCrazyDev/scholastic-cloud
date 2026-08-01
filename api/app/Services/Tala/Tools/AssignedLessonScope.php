<?php

namespace App\Services\Tala\Tools;

use App\Models\Topic;
use Illuminate\Database\Eloquent\Builder;

/**
 * The only way the tool layer is allowed to reach a lesson.
 *
 * Lessons live on `topics`, one row per lesson, hanging off a subject. They have
 * no owner column of their own, so the boundary is inherited: a lesson is in
 * scope exactly when its subject is in scope, and subject scope is
 * AssignedSubjectScope. That subquery is the security clause, and it is applied
 * before anything the model said is considered.
 *
 * Written as a `whereIn` over the scope's own query rather than a join so there
 * is one definition of "this teacher's subjects" in the codebase. If the subject
 * rule ever changes, lessons follow it without being edited.
 *
 * The same two deliberate omissions apply as on AssignedSubjectScope: no
 * institution-wide widening for principals, and no lesson id argument. A teacher
 * names a lesson by its title, which is resolved through this scope.
 */
class AssignedLessonScope
{
    public static function query(ToolContext $context): Builder
    {
        return Topic::query()
            ->whereIn(
                'subject_id',
                AssignedSubjectScope::query($context)->select('subjects.id')
            );
    }

    /**
     * Narrow by the filters a tool accepts. Every clause here can only shrink
     * the set the scope above returned.
     *
     * @param  array<string, mixed>  $input
     */
    public static function applyFilters(Builder $query, array $input): Builder
    {
        if ($subject = ToolInput::text($input, 'subject')) {
            $query->whereHas('subject', fn (Builder $q) => $q->where('title', 'like', '%'.$subject.'%'));
        }

        if ($section = ToolInput::text($input, 'class_section')) {
            $query->whereHas(
                'subject.classSection',
                fn (Builder $q) => $q->where('title', 'like', '%'.$section.'%')
                    ->orWhere('grade_level', 'like', '%'.$section.'%')
            );
        }

        if ($period = ToolInput::period($input, 'grading_period')) {
            $query->where('quarter', $period);
        }

        if ($search = ToolInput::text($input, 'search')) {
            $query->where(
                fn (Builder $q) => $q->where('title', 'like', '%'.$search.'%')
                    ->orWhere('description', 'like', '%'.$search.'%')
            );
        }

        return $query;
    }
}
