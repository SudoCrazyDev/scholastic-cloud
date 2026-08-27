<?php

namespace App\Http\Controllers;

use App\Auth\StudentPortalUser;
use App\Services\Payments\PaymentIdentifierRegistry;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Asked before a collection is posted: is this receipt identifier already on the books?
 *
 * The registry has always answered this *after* the write, as a warning riding along with
 * the response — which is right for the till, where the cashier has the physical receipt
 * in hand and the number is not in doubt. Receipt approvals are the other case. The
 * reviewer is reading a reference number off an image a student uploaded, and a number
 * that is already on another collection usually means the student uploaded the same
 * transfer twice. Told afterwards, the duplicate posting has already moved a ledger and
 * has to go through the void queue to come back. Told beforehand, the reviewer looks at
 * the two receipts side by side and decides.
 *
 * It is a check, never a gate: reuse is legitimate often enough — one transfer settling
 * two students' fees, a receipt split across postings — that the answer is information
 * for the reviewer, not a refusal.
 */
class PaymentIdentifierController extends Controller
{
    /**
     * The live collections already carrying the given identifiers.
     *
     * Fields with no holder are absent from `data`, so an empty object is "nothing is
     * reused" and the caller needs no per-field emptiness check.
     */
    public function holders(Request $request): JsonResponse
    {
        $user = $request->user();
        if (!$user || $user instanceof StudentPortalUser) {
            return response()->json(['success' => false, 'message' => 'Forbidden.'], 403);
        }

        $validated = $request->validate([
            'or_number' => 'nullable|string|max:255',
            'reference_number' => 'nullable|string|max:255',
            // The collection being edited is not its own duplicate.
            'except_transaction_id' => 'nullable|uuid',
            'except_payment_id' => 'nullable|uuid',
        ]);

        $institutionId = $this->resolveInstitutionId($request);
        if (!$institutionId) {
            return response()->json([
                'success' => false,
                'message' => 'User does not have any institution assigned',
            ], 400);
        }

        $collisions = PaymentIdentifierRegistry::collisions(
            $institutionId,
            [
                'or_number' => $validated['or_number'] ?? null,
                'reference_number' => $validated['reference_number'] ?? null,
            ],
            $validated['except_transaction_id'] ?? null,
            $validated['except_payment_id'] ?? null
        );

        return response()->json([
            'success' => true,
            'data' => $collisions,
        ]);
    }

    private function resolveInstitutionId(Request $request): ?string
    {
        $user = $request->user();
        if (!$user) {
            return null;
        }

        $institutionId = $user->getDefaultInstitutionId();
        if (!$institutionId) {
            $institutionId = $user->userInstitutions()->value('institution_id');
        }

        return $institutionId;
    }
}
