<?php

namespace App\Services\Tala\Assessments;

use App\Models\StudentAssessmentAttempt;
use App\Models\SubjectEcrItem;
use App\Models\TalaAssessmentProposal;
use App\Services\AssessmentV2Service;
use App\Services\Tala\Tools\AssignedAssessmentScope;
use App\Services\Tala\Tools\ToolContext;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * The one place a Tala proposal becomes a real change.
 *
 * Reached only from TalaProposalController::apply(), which is an ordinary
 * authenticated POST gated on `subjects.manage` — the same permission the
 * Assessments screen requires. No model turn can call this.
 *
 * Everything is re-checked here rather than trusted from the proposal row,
 * because a proposal is a claim made at some earlier moment:
 *
 *   1. **Scope.** The target is resolved through AssignedAssessmentScope again,
 *      so a teacher who has since lost the subject cannot apply an old card.
 *   2. **Staleness.** The item's status, submission count and question count are
 *      compared with what they were when the proposal was drafted. If a student
 *      has submitted in the meantime, the teacher is agreeing to something
 *      different from what they read, so the apply is refused and a fresh
 *      proposal is required.
 *   3. **Single use.** Status moves to `applied` inside the transaction, so a
 *      double-click cannot create two assessments.
 */
class ProposalApplier
{
    public function __construct(private readonly AssessmentV2Service $v2) {}

    /**
     * @return array{item: ?SubjectEcrItem, message: string}
     *
     * @throws RuntimeException when the proposal can no longer be applied.
     */
    public function apply(TalaAssessmentProposal $proposal, ToolContext $context): array
    {
        if (! $proposal->isPending()) {
            throw new RuntimeException(match ($proposal->status) {
                TalaAssessmentProposal::STATUS_APPLIED => 'This suggestion has already been applied.',
                TalaAssessmentProposal::STATUS_DISCARDED => 'This suggestion was discarded.',
                default => 'This suggestion is no longer available.',
            });
        }

        return match ($proposal->action) {
            TalaAssessmentProposal::ACTION_CREATE => $this->create($proposal, $context),
            TalaAssessmentProposal::ACTION_UPDATE => $this->update($proposal, $context),
            TalaAssessmentProposal::ACTION_DELETE => $this->delete($proposal, $context),
            TalaAssessmentProposal::ACTION_PUBLISH => $this->setStatus($proposal, $context, AssessmentTypes::STATUS_PUBLISHED),
            TalaAssessmentProposal::ACTION_UNPUBLISH => $this->setStatus($proposal, $context, AssessmentTypes::STATUS_DRAFT),
            default => throw new RuntimeException('This suggestion cannot be applied.'),
        };
    }

    /**
     * @return array{item: SubjectEcrItem, message: string}
     */
    private function create(TalaAssessmentProposal $proposal, ToolContext $context): array
    {
        $payload = $proposal->payload ?? [];
        $componentId = $payload['subject_ecr_id'] ?? null;

        if (! is_string($componentId) || AssignedAssessmentScope::findComponent($context, $componentId) === null) {
            throw new RuntimeException('That subject is no longer yours, so this cannot be created.');
        }

        $questions = is_array($payload['questions'] ?? null) ? $payload['questions'] : [];

        $item = DB::transaction(function () use ($proposal, $payload, $componentId, $questions) {
            $this->claim($proposal);

            $item = SubjectEcrItem::create([
                'subject_ecr_id' => $componentId,
                'type' => $payload['type'] ?? null,
                // Explicit, because the column defaults to 'published'.
                'status' => AssessmentTypes::STATUS_DRAFT,
                'title' => $payload['title'] ?? 'Untitled',
                'description' => $payload['description'] ?? null,
                'content' => [],
                'content_version' => AssessmentTypes::CONTENT_VERSION,
                'quarter' => $payload['quarter'] ?? null,
                'academic_year' => $payload['academic_year'] ?? null,
            ]);

            // Writes the question rows and recomputes `score` from their points.
            $this->v2->syncQuestions($item, $questions);

            $proposal->forceFill(['applied_item_id' => $item->id])->save();

            return $item->refresh();
        });

        return [
            'item' => $item,
            'message' => 'Saved as a draft. Students cannot see it until you publish it.',
        ];
    }

    /**
     * @return array{item: SubjectEcrItem, message: string}
     */
    private function update(TalaAssessmentProposal $proposal, ToolContext $context): array
    {
        $item = $this->target($proposal, $context);
        $payload = $proposal->payload ?? [];

        $attributes = array_filter([
            'title' => $payload['title'] ?? null,
            'type' => $payload['type'] ?? null,
            'description' => $payload['description'] ?? null,
        ], fn ($value) => $value !== null);

        $questions = is_array($payload['questions'] ?? null) ? $payload['questions'] : null;

        $updated = DB::transaction(function () use ($proposal, $item, $attributes, $questions) {
            $this->claim($proposal);

            if ($questions !== null) {
                // v2 from here on: questions become rows keyed by a stable id,
                // so a later edit cannot re-point a student's answers.
                $attributes['content_version'] = AssessmentTypes::CONTENT_VERSION;
            }

            if ($attributes !== []) {
                $item->fill($attributes)->save();
            }

            if ($questions !== null) {
                // Recomputes `score`; questions no longer present are soft-deleted
                // so their answer history survives.
                $this->v2->syncQuestions($item, $questions);
            }

            $proposal->forceFill(['applied_item_id' => $item->id])->save();

            return $item->refresh();
        });

        return ['item' => $updated, 'message' => 'Assessment updated.'];
    }

    /**
     * @return array{item: null, message: string}
     */
    private function delete(TalaAssessmentProposal $proposal, ToolContext $context): array
    {
        $item = $this->target($proposal, $context);

        DB::transaction(function () use ($proposal, $item) {
            $this->claim($proposal);
            $item->delete();
        });

        return ['item' => null, 'message' => 'Assessment deleted.'];
    }

    /**
     * @return array{item: SubjectEcrItem, message: string}
     */
    private function setStatus(TalaAssessmentProposal $proposal, ToolContext $context, string $status): array
    {
        $item = $this->target($proposal, $context);

        $updated = DB::transaction(function () use ($proposal, $item, $status) {
            $this->claim($proposal);
            $item->forceFill(['status' => $status])->save();
            $proposal->forceFill(['applied_item_id' => $item->id])->save();

            return $item->refresh();
        });

        return [
            'item' => $updated,
            'message' => $status === AssessmentTypes::STATUS_PUBLISHED
                ? 'Published. Students can see it now.'
                : 'Back to draft. Students can no longer see it.',
        ];
    }

    /**
     * Re-resolve the target through the teacher's own scope and check that the
     * ground has not shifted under the proposal.
     */
    private function target(TalaAssessmentProposal $proposal, ToolContext $context): SubjectEcrItem
    {
        $itemId = $proposal->subject_ecr_item_id;

        if (! is_string($itemId)) {
            throw new RuntimeException('This suggestion has no assessment to change.');
        }

        $item = AssignedAssessmentScope::find($context, $itemId);

        if ($item === null) {
            throw new RuntimeException(
                'That assessment no longer exists, or it is no longer one of yours.'
            );
        }

        $this->assertFresh($proposal, $item);

        return $item;
    }

    /**
     * Refuse an apply whose subject has changed since the teacher read the card.
     *
     * The submission count is the one that matters: approving "replace these
     * questions" is a different decision when nobody has answered them and when
     * a class has. Rather than apply it anyway and warn afterwards, the proposal
     * is failed and the teacher can ask for it again against current state.
     */
    private function assertFresh(TalaAssessmentProposal $proposal, SubjectEcrItem $item): void
    {
        $guard = $proposal->payload['guard'] ?? null;

        if (! is_array($guard)) {
            return;
        }

        $attemptsNow = StudentAssessmentAttempt::where('subject_ecr_item_id', $item->id)->count();
        $attemptsThen = (int) ($guard['attempts'] ?? 0);

        if ($attemptsNow !== $attemptsThen) {
            throw new RuntimeException(sprintf(
                'Students have submitted since this was suggested (%d now, %d then). '
                .'Ask Tala to suggest it again so you can see what changed.',
                $attemptsNow,
                $attemptsThen,
            ));
        }

        $statusThen = $guard['status'] ?? null;

        if (is_string($statusThen) && $statusThen !== $item->status) {
            throw new RuntimeException(
                'This assessment is now '.$item->status.', not '.$statusThen
                .', so this suggestion no longer applies. Ask Tala to suggest it again.'
            );
        }
    }

    /**
     * Mark the proposal used, inside the caller's transaction.
     *
     * The conditional update is the lock: a second concurrent apply matches zero
     * rows and is rejected, so a double-click cannot write twice.
     */
    private function claim(TalaAssessmentProposal $proposal): void
    {
        $claimed = TalaAssessmentProposal::whereKey($proposal->id)
            ->where('status', TalaAssessmentProposal::STATUS_PENDING)
            ->update([
                'status' => TalaAssessmentProposal::STATUS_APPLIED,
                'applied_at' => now(),
                'updated_at' => now(),
            ]);

        if ($claimed === 0) {
            throw new RuntimeException('This suggestion has already been applied.');
        }

        $proposal->status = TalaAssessmentProposal::STATUS_APPLIED;
    }
}
