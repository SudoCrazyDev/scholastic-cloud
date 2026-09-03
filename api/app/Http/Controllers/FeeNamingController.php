<?php

namespace App\Http\Controllers;

use App\Models\FeeNamingRun;
use App\Models\StudentPayment;
use App\Services\Finance\FeeNamingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The Finance Setup screen for naming the fees on "General / Other" collections.
 *
 * See FeeNamingService for what the operation is and why it moves no balance. The shape
 * here is deliberate: a preview that writes nothing, a run that recomputes rather than
 * trusting the preview it was shown, and an undo. Nothing about this is urgent enough to
 * be worth doing without looking at it first.
 */
class FeeNamingController extends Controller
{
    public function __construct(private FeeNamingService $naming)
    {
    }

    /** What a run would write. Writes nothing itself. */
    public function preview(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'academic_year' => 'nullable|string|max:20',
            'scope' => 'nullable|in:receipts,all',
        ]);

        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return response()->json(['success' => false, 'message' => 'No institution resolved.'], 422);
        }

        $plan = $this->naming->preview(
            $institutionId,
            $this->blankToNull($validated['academic_year'] ?? null),
            $validated['scope'] ?? FeeNamingService::SCOPE_RECEIPTS
        );

        return response()->json(['success' => true, 'data' => $plan]);
    }

    /** Name the fees, as one revertible run. */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'academic_year' => 'nullable|string|max:20',
            'scope' => 'nullable|in:receipts,all',
        ]);

        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return response()->json(['success' => false, 'message' => 'No institution resolved.'], 422);
        }

        $run = $this->naming->apply(
            $institutionId,
            $this->blankToNull($validated['academic_year'] ?? null),
            $validated['scope'] ?? FeeNamingService::SCOPE_RECEIPTS,
            $request->user()?->id
        );

        if ($run->line_count === 0) {
            return response()->json([
                'success' => true,
                'message' => 'Nothing left to name — no General / Other collection was in scope.',
                'data' => $this->withContext($run->fresh()),
            ]);
        }

        return response()->json([
            'success' => true,
            'message' => 'Named the fees on ' . $run->receipt_count . ' '
                . ($run->receipt_count === 1 ? 'collection' : 'collections')
                . '. No balance changed.',
            'data' => $this->withContext($run->fresh()),
        ]);
    }

    /** Every run this school has made, newest first. */
    public function index(Request $request): JsonResponse
    {
        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return response()->json(['success' => false, 'message' => 'No institution resolved.'], 422);
        }

        $runs = FeeNamingRun::with(['creator:id,first_name,last_name', 'reverter:id,first_name,last_name'])
            ->where('institution_id', $institutionId)
            ->orderByDesc('created_at')
            ->limit(50)
            ->get()
            ->map(fn ($run) => $this->withContext($run));

        return response()->json(['success' => true, 'data' => $runs]);
    }

    /** Put a run back. */
    public function revert(Request $request, string $id): JsonResponse
    {
        $institutionId = $this->resolveInstitutionId($request);
        $run = FeeNamingRun::where('institution_id', $institutionId)->find($id);

        if (! $run) {
            return response()->json(['success' => false, 'message' => 'Run not found.'], 404);
        }
        if ($run->isReverted()) {
            return response()->json(['success' => false, 'message' => 'That run has already been undone.'], 422);
        }

        try {
            $result = $this->naming->revert($run, $request->user()?->id);
        } catch (\RuntimeException $e) {
            // A line the run named has since been voided, so collapsing it here would
            // quietly undo somebody's correction along with the naming.
            return response()->json(['success' => false, 'message' => $e->getMessage()], 422);
        }

        return response()->json([
            'success' => true,
            'message' => 'Undone. ' . $result['restored'] . ' '
                . ($result['restored'] === 1 ? 'collection is' : 'collections are')
                . ' back to General / Other, and no balance changed.',
            'data' => $this->withContext($run->fresh()),
        ]);
    }

    /**
     * A run plus whether it can still be undone.
     *
     * `can_revert` is answered here rather than left to the screen: whether an undo is
     * still possible depends on nothing having been voided since, which the browser has
     * no way to know.
     */
    private function withContext(FeeNamingRun $run): array
    {
        $voided = ! $run->isReverted() && StudentPayment::where('fee_naming_run_id', $run->id)
            ->whereNotNull('voided_at')
            ->exists();

        return array_merge($run->toArray(), [
            'can_revert' => ! $run->isReverted() && ! $voided && $run->line_count > 0,
            'blocked_by_void' => $voided,
        ]);
    }

    /** Staff only — this screen is behind a module ability no student can hold. */
    private function resolveInstitutionId(Request $request): ?string
    {
        $user = $request->user();
        if (! $user) {
            return null;
        }

        $institutionId = $user->getDefaultInstitutionId();
        if (! $institutionId) {
            $institutionId = $user->userInstitutions()->first()?->institution_id;
        }

        return $institutionId;
    }

    private function blankToNull(?string $value): ?string
    {
        $value = is_string($value) ? trim($value) : $value;

        return $value === '' ? null : $value;
    }
}
