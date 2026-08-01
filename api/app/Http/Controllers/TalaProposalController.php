<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\AuthorizesModuleAccess;
use App\Models\TalaAssessmentProposal;
use App\Services\Tala\Assessments\AssessmentPresenter;
use App\Services\Tala\Assessments\ProposalApplier;
use App\Services\Tala\Tools\ToolContext;
use App\Support\GradingPeriods;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use RuntimeException;

/**
 * Approving or discarding a change Tala suggested to an assessment.
 *
 * This is the write path for the assistant, and it is a plain HTTP endpoint on
 * purpose. The chat produces a proposal; a teacher clicks; this runs. Nothing a
 * model emits reaches ProposalApplier without a request signed by the teacher
 * who owns the proposal.
 *
 * Two gates, both required:
 *
 *   - `tala.manage` — they use Tala at all. Applied by the route.
 *   - `subjects,manage` — they may change assessments. Also applied by the
 *     route, and it is the same permission the Assessments screen sits behind,
 *     so Tala can never be a way around a permission a teacher does not have.
 *
 * On top of that, every query here is scoped to the signed-in user: a proposal
 * belongs to the teacher whose conversation produced it, and nobody else can see
 * or apply it even if they hold both abilities.
 */
class TalaProposalController extends Controller
{
    use AuthorizesModuleAccess;

    public function __construct(private readonly ProposalApplier $applier) {}

    /**
     * Pending and recently resolved proposals for one thread, so reopening a
     * chat shows its cards in the state the teacher left them.
     */
    public function index(Request $request, string $conversationId): JsonResponse
    {
        if ($response = $this->resolveStaff($request, $user)) {
            return $response;
        }

        $proposals = TalaAssessmentProposal::query()
            ->where('user_id', $user->id)
            ->where('conversation_id', $conversationId)
            ->orderBy('created_at')
            ->limit(50)
            ->get();

        return response()->json([
            'success' => true,
            'data' => $proposals->map(fn (TalaAssessmentProposal $proposal) => $proposal->toCard())->all(),
        ]);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $proposal = $this->findOwned($request, $id);

        if (! $proposal) {
            return $this->missing();
        }

        return response()->json([
            'success' => true,
            'data' => $proposal->toCard(),
        ]);
    }

    /**
     * Apply it. This is the moment the gradebook changes.
     */
    public function apply(Request $request, string $id): JsonResponse
    {
        if ($response = $this->resolveStaff($request, $user)) {
            return $response;
        }

        $proposal = TalaAssessmentProposal::query()
            ->where('user_id', $user->id)
            ->find($id);

        if (! $proposal) {
            return $this->missing();
        }

        $context = new ToolContext($user, $proposal->institution_id, $proposal->conversation_id);

        try {
            $result = $this->applier->apply($proposal, $context);
        } catch (RuntimeException $e) {
            // A refusal the teacher should read — stale state, already applied,
            // access lost. Recorded on the row so the card stops offering a
            // button that cannot work.
            $proposal->forceFill([
                'status' => $proposal->isPending() ? TalaAssessmentProposal::STATUS_FAILED : $proposal->status,
                'failure_reason' => $e->getMessage(),
            ])->save();

            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
                'data' => $proposal->fresh()?->toCard(),
            ], 409);
        } catch (\Throwable $e) {
            Log::error('Tala: applying an assessment proposal failed', [
                'proposal_id' => $proposal->id,
                'action' => $proposal->action,
                'error' => $e->getMessage(),
            ]);

            $proposal->forceFill([
                'status' => TalaAssessmentProposal::STATUS_FAILED,
                'failure_reason' => 'Something went wrong applying this.',
            ])->save();

            return response()->json([
                'success' => false,
                'message' => 'Something went wrong applying this. Nothing was changed.',
            ], 500);
        }

        $item = $result['item'];
        $periodType = GradingPeriods::forInstitution($proposal->institution_id);

        return response()->json([
            'success' => true,
            'message' => $result['message'],
            'data' => [
                'proposal' => $proposal->fresh()?->toCard(),
                'assessment' => $item ? AssessmentPresenter::summary($item, $periodType) : null,
            ],
        ]);
    }

    public function discard(Request $request, string $id): JsonResponse
    {
        $proposal = $this->findOwned($request, $id);

        if (! $proposal) {
            return $this->missing();
        }

        if ($proposal->isPending()) {
            $proposal->forceFill([
                'status' => TalaAssessmentProposal::STATUS_DISCARDED,
                'discarded_at' => now(),
            ])->save();
        }

        return response()->json([
            'success' => true,
            'message' => 'Suggestion discarded.',
            'data' => $proposal->fresh()?->toCard(),
        ]);
    }

    /**
     * Scoped by owner, so somebody else's proposal id reads as missing rather
     * than forbidden.
     */
    private function findOwned(Request $request, string $id): ?TalaAssessmentProposal
    {
        $user = $this->staffUser($request);

        if (! $user) {
            return null;
        }

        return TalaAssessmentProposal::query()->where('user_id', $user->id)->find($id);
    }

    private function missing(): JsonResponse
    {
        return response()->json([
            'success' => false,
            'message' => 'Suggestion not found',
        ], 404);
    }
}
