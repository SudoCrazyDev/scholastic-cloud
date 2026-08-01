<?php

namespace App\Services\Tala\Tools;

use App\Models\Subject;
use Illuminate\Database\Eloquent\Builder;

/**
 * The only way the tool layer is allowed to reach a subject.
 *
 * Every query starts here, and the two clauses that matter are applied from
 * ToolContext — the authenticated request — before anything the model said is
 * considered. A filter the model supplies can narrow this set. Nothing it can
 * say widens it.
 *
 * Two things this deliberately does NOT do:
 *
 *   - It does not mirror UserController::getMySubjects(), which widens to every
 *     subject in the institution for principals, institution administrators and
 *     department heads. That widening is right for a screen someone opened on
 *     purpose and wrong for an assistant: Tala ships to subject teachers and
 *     answers about the teacher it is talking to, so a principal who also
 *     teaches sees their own load here and nothing more. If institution-wide
 *     visibility is ever wanted it should be its own tool, described as such,
 *     gated on its own permission.
 *
 *   - It does not take a subject id. There is no argument on the first tool
 *     that could name a row, so there is no id to validate and no way to probe
 *     for one. When a tool does need to accept an id, it must resolve it
 *     through find() below rather than through Subject::find().
 */
class AssignedSubjectScope
{
    /**
     * Subjects this teacher is assigned to, at this institution.
     */
    public static function query(ToolContext $context): Builder
    {
        return Subject::query()
            // `adviser` on a subject is the assigned subject teacher. Taken
            // from the authenticated user, never from tool input.
            ->where('adviser', $context->userId())
            // A teacher can hold posts at more than one school on this
            // platform. The conversation belongs to one of them, and the
            // other one's data is not in scope for it.
            ->where('institution_id', $context->institutionId);
    }

    /**
     * Resolve a subject id through the scope.
     *
     * Returns null for an id that exists but is not this teacher's — the caller
     * reports "not assigned to you" either way, so an outsider's id and a
     * nonexistent one are indistinguishable from the chat.
     */
    public static function find(ToolContext $context, string $subjectId): ?Subject
    {
        return static::query($context)->find($subjectId);
    }
}
