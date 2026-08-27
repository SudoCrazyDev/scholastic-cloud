<?php

namespace App\Http\Controllers;

use App\Auth\StudentPortalUser;
use App\Models\PaymentTransaction;
use App\Models\PaymentVoidRequest;
use App\Models\StudentPayment;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PaymentVoidRequestController extends Controller
{
    /*
    | These used to be hardcoded lists of role slugs. They are now read off the
    | role's permissions, so a school can build its own "Cashier" or "Finance
    | Head" role and have it work here. The built-in roles are seeded with the
    | matching permissions, so their behaviour is unchanged.
    */

    private function canApprove(Request $request): bool
    {
        $user = $request->user();

        return $user instanceof User && $user->hasPermissionTo('finance.approve-void');
    }

    /** Whose own voids skip the queue and apply immediately. */
    private function canSelfApprove(Request $request): bool
    {
        $user = $request->user();

        return $user instanceof User && $user->hasPermissionTo('finance.void-immediately');
    }

    private function canRequest(Request $request): bool
    {
        $user = $request->user();

        return $user instanceof User
            && ($user->hasPermissionTo('finance.request-void') || $this->canApprove($request));
    }

    private function resolveInstitutionId(Request $request): ?string
    {
        $user = $request->user();
        if (! $user instanceof User) {
            return null;
        }

        $institutionId = $user->getDefaultInstitutionId();
        if (! $institutionId) {
            $institutionId = $user->userInstitutions()->first()?->institution_id;
        }

        return $institutionId;
    }

    /**
     * List void requests for the user's institution, optionally filtered by status.
     */
    public function index(Request $request): JsonResponse
    {
        if ($request->user() instanceof StudentPortalUser || ! $this->canRequest($request)) {
            return response()->json(['success' => false, 'message' => 'Forbidden.'], 403);
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return response()->json([
                'success' => false,
                'message' => 'User does not have any institution assigned.',
            ], 400);
        }

        $query = PaymentVoidRequest::query()
            ->with(['student:id,first_name,middle_name,last_name', 'requester:id,first_name,last_name', 'reviewer:id,first_name,last_name'])
            ->where('institution_id', $institutionId);

        $status = $request->get('status');
        if (in_array($status, ['pending', 'approved', 'disapproved'], true)) {
            $query->where('status', $status);
        }

        $requests = $query->orderByDesc('created_at')->get();

        return response()->json([
            'success' => true,
            'data' => $requests,
        ]);
    }

    /**
     * Create a void request for a recorded payment (anchored on its receipt).
     *
     * Finance → pending request, even though finance may approve the queue itself,
     * so the request and its approval stay two separate records. Admin → created
     * already approved and the payment is voided immediately. A note is required
     * in both cases.
     */
    public function store(Request $request): JsonResponse
    {
        if ($request->user() instanceof StudentPortalUser || ! $this->canRequest($request)) {
            return response()->json(['success' => false, 'message' => 'Forbidden.'], 403);
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return response()->json([
                'success' => false,
                'message' => 'User does not have any institution assigned.',
            ], 400);
        }

        $validated = $request->validate([
            'receipt_number' => 'required|string|max:255',
            'request_note' => 'required|string|max:2000',
        ]);

        $receiptNumber = $validated['receipt_number'];

        // Resolve every active (non-voided) payment line sharing this receipt.
        $payments = StudentPayment::where('institution_id', $institutionId)
            ->where('receipt_number', $receiptNumber)
            ->whereNull('voided_at')
            ->get();

        if ($payments->isEmpty()) {
            return response()->json([
                'success' => false,
                'message' => 'No active payment found for this receipt. It may already be voided.',
            ], 422);
        }

        // Prevent duplicate pending requests for the same receipt.
        $existingPending = PaymentVoidRequest::where('institution_id', $institutionId)
            ->where('receipt_number', $receiptNumber)
            ->where('status', PaymentVoidRequest::STATUS_PENDING)
            ->exists();

        if ($existingPending) {
            return response()->json([
                'success' => false,
                'message' => 'A void request for this receipt is already pending approval.',
            ], 422);
        }

        $first = $payments->first();
        $transactionId = $payments->firstWhere('payment_transaction_id', '!=', null)?->payment_transaction_id;
        $amount = (float) $payments->sum('amount');
        $isApprover = $this->canSelfApprove($request);
        $userId = $request->user()?->id;

        $voidRequest = DB::transaction(function () use (
            $institutionId,
            $first,
            $receiptNumber,
            $transactionId,
            $amount,
            $validated,
            $isApprover,
            $userId,
            $payments
        ) {
            $voidRequest = PaymentVoidRequest::create([
                'institution_id' => $institutionId,
                'student_id' => $first->student_id,
                'academic_year' => $first->academic_year,
                'receipt_number' => $receiptNumber,
                'payment_transaction_id' => $transactionId,
                'target_payment_id' => $transactionId ? null : $first->id,
                'amount' => $amount,
                'status' => $isApprover ? PaymentVoidRequest::STATUS_APPROVED : PaymentVoidRequest::STATUS_PENDING,
                'request_note' => $validated['request_note'],
                'requested_by' => $userId,
                'reviewed_by' => $isApprover ? $userId : null,
                'reviewed_at' => $isApprover ? now() : null,
            ]);

            // Admin-initiated voids apply immediately.
            if ($isApprover) {
                $this->applyVoid($payments, $userId, $validated['request_note']);
            }

            return $voidRequest;
        });

        $voidRequest->load(['student:id,first_name,middle_name,last_name', 'requester:id,first_name,last_name', 'reviewer:id,first_name,last_name']);

        return response()->json([
            'success' => true,
            'message' => $isApprover
                ? 'Payment voided successfully.'
                : 'Void request submitted for approval.',
            'data' => $voidRequest,
        ], 201);
    }

    /**
     * Approve a pending void request and void the payment.
     */
    public function approve(Request $request, string $id): JsonResponse
    {
        if (! $this->canApprove($request)) {
            return response()->json(['success' => false, 'message' => 'Forbidden.'], 403);
        }

        $institutionId = $this->resolveInstitutionId($request);
        $voidRequest = PaymentVoidRequest::where('institution_id', $institutionId)->find($id);

        if (! $voidRequest) {
            return response()->json(['success' => false, 'message' => 'Void request not found.'], 404);
        }
        if ($voidRequest->status !== PaymentVoidRequest::STATUS_PENDING) {
            return response()->json(['success' => false, 'message' => 'Only pending requests can be approved.'], 422);
        }

        $userId = $request->user()?->id;

        DB::transaction(function () use ($voidRequest, $institutionId, $userId) {
            $payments = StudentPayment::where('institution_id', $institutionId)
                ->where('receipt_number', $voidRequest->receipt_number)
                ->whereNull('voided_at')
                ->get();

            $this->applyVoid($payments, $userId, $voidRequest->request_note);

            $voidRequest->update([
                'status' => PaymentVoidRequest::STATUS_APPROVED,
                'reviewed_by' => $userId,
                'reviewed_at' => now(),
            ]);
        });

        $voidRequest->load(['student:id,first_name,middle_name,last_name', 'requester:id,first_name,last_name', 'reviewer:id,first_name,last_name']);

        return response()->json([
            'success' => true,
            'message' => 'Void request approved. Payment voided.',
            'data' => $voidRequest,
        ]);
    }

    /**
     * Disapprove a pending void request (payment stays active).
     */
    public function disapprove(Request $request, string $id): JsonResponse
    {
        if (! $this->canApprove($request)) {
            return response()->json(['success' => false, 'message' => 'Forbidden.'], 403);
        }

        $institutionId = $this->resolveInstitutionId($request);
        $voidRequest = PaymentVoidRequest::where('institution_id', $institutionId)->find($id);

        if (! $voidRequest) {
            return response()->json(['success' => false, 'message' => 'Void request not found.'], 404);
        }
        if ($voidRequest->status !== PaymentVoidRequest::STATUS_PENDING) {
            return response()->json(['success' => false, 'message' => 'Only pending requests can be disapproved.'], 422);
        }

        $validated = $request->validate([
            'review_note' => 'required|string|max:2000',
        ]);

        $voidRequest->update([
            'status' => PaymentVoidRequest::STATUS_DISAPPROVED,
            'review_note' => $validated['review_note'],
            'reviewed_by' => $request->user()?->id,
            'reviewed_at' => now(),
        ]);

        $voidRequest->load(['student:id,first_name,middle_name,last_name', 'requester:id,first_name,last_name', 'reviewer:id,first_name,last_name']);

        return response()->json([
            'success' => true,
            'message' => 'Void request disapproved.',
            'data' => $voidRequest,
        ]);
    }

    /**
     * Stamp the void on every payment row of the receipt, and on the transaction
     * header once nothing of it is left standing.
     *
     * The header's stamp is what releases the receipt's OR and reference numbers:
     * the unique index is over the live copy of each number, which goes NULL when
     * the header is voided, so the cashier may enter that same OR again on the
     * corrected entry.
     *
     * @param  \Illuminate\Support\Collection<int, StudentPayment>  $payments
     */
    private function applyVoid($payments, ?string $userId, string $note): void
    {
        $voidedAt = now();

        foreach ($payments as $payment) {
            $payment->update([
                'voided_at' => $voidedAt,
                'voided_by' => $userId,
                'void_note' => $note,
            ]);
        }

        $transactionIds = $payments->pluck('payment_transaction_id')->filter()->unique();

        foreach ($transactionIds as $transactionId) {
            $stillStanding = StudentPayment::where('payment_transaction_id', $transactionId)
                ->whereNull('voided_at')
                ->exists();

            if (! $stillStanding) {
                PaymentTransaction::whereKey($transactionId)->update(['voided_at' => $voidedAt]);
            }
        }
    }
}
