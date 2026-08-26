<?php

namespace App\Http\Controllers;

use App\Auth\StudentPortalUser;
use App\Models\PaymentReceiptSubmission;
use App\Models\PaymentTransaction;
use App\Models\Student;
use App\Models\StudentPayment;
use App\Services\Payments\FeeAllocationGuard;
use App\Services\Payments\PaymentIdentifierRegistry;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class PaymentReceiptSubmissionController extends Controller
{
    /**
     * List receipt submissions.
     *
     * Students see only their own (any status). Reviewer roles see the
     * institution queue, filterable by status / academic year / student.
     */
    public function index(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'status' => 'nullable|in:pending,approved,rejected',
            'academic_year' => 'nullable|string|max:255',
            'student_id' => 'nullable|uuid|exists:students,id',
        ]);

        $institutionId = $this->resolveInstitutionId($request);
        if (!$institutionId) {
            return response()->json([
                'success' => false,
                'message' => 'User does not have any institution assigned',
            ], 400);
        }

        $query = PaymentReceiptSubmission::query()
            ->with([
                'student:id,first_name,middle_name,last_name',
                'reviewer:id,first_name,last_name',
                // An approved row shows how its verified amount was subdivided, which is
                // the transaction's line items and the fee each one settled.
                'paymentTransaction.items.schoolFee:id,name',
                'paymentTransaction.items.additionalFee:id,name,source',
            ])
            ->where('institution_id', $institutionId);

        if ($this->isStudentActor($request)) {
            $studentId = $this->resolveSelfStudentId($request);
            if (!$studentId) {
                return response()->json([
                    'success' => false,
                    'message' => 'Student record not found for this account',
                ], 403);
            }
            $query->where('student_id', $studentId);
        } else {
            if (!$this->canSeeQueue($request)) {
                return response()->json(['success' => false, 'message' => 'Forbidden.'], 403);
            }
            if (!empty($filters['student_id'])) {
                $query->where('student_id', $filters['student_id']);
            }
        }

        if (!empty($filters['status'])) {
            $query->where('status', $filters['status']);
        }
        if (!empty($filters['academic_year'])) {
            $query->where('academic_year', $filters['academic_year']);
        }

        $submissions = $query->orderByDesc('created_at')->get();

        return response()->json([
            'success' => true,
            'data' => $submissions,
        ]);
    }

    /**
     * Student uploads a proof-of-payment receipt for an installment (status = pending).
     */
    public function store(Request $request): JsonResponse
    {
        if (!$this->isStudentActor($request)) {
            return response()->json([
                'success' => false,
                'message' => 'Only students can upload payment receipts.',
            ], 403);
        }

        $validated = $request->validate([
            'academic_year' => 'required|string|max:255',
            'installment_sequence' => 'required|integer|min:1',
            'installment_label' => 'nullable|string|max:255',
            'file' => 'required|file|mimes:png,jpg,jpeg,webp,pdf|max:10240',
        ]);

        $institutionId = $this->resolveInstitutionId($request);
        if (!$institutionId) {
            return response()->json([
                'success' => false,
                'message' => 'User does not have any institution assigned',
            ], 400);
        }

        $studentId = $this->resolveSelfStudentId($request);
        if (!$studentId) {
            return response()->json([
                'success' => false,
                'message' => 'Student record not found for this account',
            ], 403);
        }

        // One pending submission per installment at a time.
        $existingPending = PaymentReceiptSubmission::where('student_id', $studentId)
            ->where('academic_year', $validated['academic_year'])
            ->where('installment_sequence', $validated['installment_sequence'])
            ->where('status', PaymentReceiptSubmission::STATUS_PENDING)
            ->exists();

        if ($existingPending) {
            return response()->json([
                'success' => false,
                'message' => 'A receipt for this installment is already pending review.',
            ], 422);
        }

        $file = $request->file('file');
        $extension = $file->getClientOriginalExtension() ?: 'jpg';
        $fileName = Str::uuid() . '.' . $extension;
        $r2Path = $institutionId . '/student/' . $studentId . '/payment-receipts/' . $fileName;

        Storage::disk('r2')->put($r2Path, file_get_contents($file->getRealPath()));

        $submission = PaymentReceiptSubmission::create([
            'institution_id' => $institutionId,
            'student_id' => $studentId,
            'academic_year' => $validated['academic_year'],
            'installment_sequence' => $validated['installment_sequence'],
            'installment_label' => $validated['installment_label'] ?? null,
            'file_path' => $r2Path,
            'file_name' => $file->getClientOriginalName(),
            'mime_type' => $file->getMimeType() ?? $file->getClientMimeType(),
            'status' => PaymentReceiptSubmission::STATUS_PENDING,
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Receipt uploaded. It will be reviewed by the finance office.',
            'data' => $submission,
        ], 201);
    }

    /**
     * Approve a pending submission: staff enters the verified amount, says which fees it
     * settles, and the payment is posted to the student's ledger.
     *
     * The posting is a real cashiering transaction - a `payment_transactions` header with
     * a `student_payments` line per fee - rather than the single unallocated payment this
     * used to write. A lump sum reduced the balance and told the school nothing about what
     * it had collected: the ledger read "Payment" with no fee against it, and the receipt
     * could not be reconciled fee by fee. Allocations stay optional, and whatever the
     * reviewer leaves unallocated is posted as one "General / Other" line, so approving
     * with nothing but an amount behaves exactly as it did before.
     */
    public function approve(Request $request, string $id): JsonResponse
    {
        if (!$this->canReview($request)) {
            return response()->json(['success' => false, 'message' => 'Forbidden.'], 403);
        }

        $validated = $request->validate([
            'amount' => 'required|numeric|min:0.01',
            'payment_method' => 'nullable|string|max:255',
            'payment_date' => 'nullable|date',
            'or_number' => 'nullable|string|max:255',
            'reference_number' => 'nullable|string|max:255',
            'remarks' => 'nullable|string',
            'allocations' => 'nullable|array',
            'allocations.*.school_fee_id' => 'nullable|uuid|exists:school_fees,id',
            'allocations.*.additional_fee_id' => 'nullable|uuid|exists:student_additional_fees,id',
            'allocations.*.amount' => 'required|numeric|min:0.01',
        ]);

        $institutionId = $this->resolveInstitutionId($request);
        $submission = PaymentReceiptSubmission::where('institution_id', $institutionId)->find($id);

        if (!$submission) {
            return response()->json(['success' => false, 'message' => 'Receipt submission not found.'], 404);
        }
        if ($submission->status !== PaymentReceiptSubmission::STATUS_PENDING) {
            return response()->json(['success' => false, 'message' => 'Only pending submissions can be approved.'], 422);
        }

        $verifiedAmount = round((float) $validated['amount'], 2);
        $allocations = $validated['allocations'] ?? [];

        $badAllocation = FeeAllocationGuard::check(
            $allocations,
            $submission->institution_id,
            $submission->student_id,
            $submission->academic_year
        );

        if ($badAllocation) {
            return response()->json([
                'success' => false,
                'message' => $badAllocation['message'],
            ], $badAllocation['status']);
        }

        $allocatedTotal = round(
            array_sum(array_map(fn ($line) => (float) $line['amount'], $allocations)),
            2
        );

        // Over-allocating would post more than the receipt was verified for, so the
        // ledger and the image would disagree about what the student actually paid.
        if ($allocatedTotal > $verifiedAmount + 0.001) {
            return response()->json([
                'success' => false,
                'message' => 'The fees you subdivided across add up to more than the verified amount.',
                'errors' => ['allocations' => ['Allocated total exceeds the verified amount.']],
            ], 422);
        }

        $orNumber = PaymentIdentifierRegistry::normalize($validated['or_number'] ?? null);
        $referenceNumber = PaymentIdentifierRegistry::normalize($validated['reference_number'] ?? null);

        $taken = PaymentIdentifierRegistry::conflicts($institutionId, [
            'or_number' => $orNumber,
            'reference_number' => $referenceNumber,
        ]);

        if ($taken) {
            return $this->duplicateIdentifierResponse($taken);
        }

        $userId = $request->user()?->id;
        $label = $submission->installment_label
            ?: 'Installment #' . $submission->installment_sequence;
        $remarks = $this->blankToNull($validated['remarks'] ?? null)
            ?? 'Posted from verified online payment receipt (' . $label . ')';
        $paymentDate = $validated['payment_date'] ?? now()->toDateString();
        $paymentMethod = $this->blankToNull($validated['payment_method'] ?? null)
            ?? 'Online - Receipt Upload';

        // Whatever was not pinned to a fee still has to be collected, so it goes in as a
        // General / Other line and the transaction always totals the verified amount.
        $lines = $allocations;
        $unallocated = round($verifiedAmount - $allocatedTotal, 2);
        if ($unallocated > 0 || $lines === []) {
            $lines[] = [
                'school_fee_id' => null,
                'additional_fee_id' => null,
                'amount' => $unallocated > 0 ? $unallocated : $verifiedAmount,
            ];
        }

        DB::transaction(function () use (
            $submission,
            $lines,
            $verifiedAmount,
            $paymentDate,
            $paymentMethod,
            $orNumber,
            $referenceNumber,
            $remarks,
            $userId
        ) {
            $receiptNumber = PaymentTransaction::generateUniqueReceiptNumber();

            $transaction = PaymentTransaction::create([
                'institution_id' => $submission->institution_id,
                'student_id' => $submission->student_id,
                'academic_year' => $submission->academic_year,
                'payment_date' => $paymentDate,
                'payment_method' => $paymentMethod,
                'reference_number' => $referenceNumber,
                'or_number' => $orNumber,
                'receipt_number' => $receiptNumber,
                'remarks' => $remarks,
                'total_amount' => $verifiedAmount,
                'amount_tendered' => null,
                'change_due' => null,
                'received_by' => $userId,
            ]);

            $firstPaymentId = null;

            foreach ($lines as $line) {
                $payment = StudentPayment::create([
                    'institution_id' => $submission->institution_id,
                    'student_id' => $submission->student_id,
                    'payment_transaction_id' => $transaction->id,
                    'school_fee_id' => $line['school_fee_id'] ?? null,
                    'student_additional_fee_id' => $line['additional_fee_id'] ?? null,
                    'academic_year' => $submission->academic_year,
                    'amount' => $line['amount'],
                    'payment_date' => $paymentDate,
                    'payment_method' => $paymentMethod,
                    'reference_number' => $referenceNumber,
                    'or_number' => $orNumber,
                    'receipt_number' => $receiptNumber,
                    'remarks' => $remarks,
                    'received_by' => $userId,
                ]);

                $firstPaymentId ??= $payment->id;
            }

            $submission->update([
                'status' => PaymentReceiptSubmission::STATUS_APPROVED,
                'amount' => $verifiedAmount,
                'student_payment_id' => $firstPaymentId,
                'payment_transaction_id' => $transaction->id,
                'reviewed_by' => $userId,
                'reviewed_at' => now(),
            ]);
        });

        return response()->json([
            'success' => true,
            'message' => 'Receipt approved. Payment posted to the student ledger.',
            'data' => $this->withReviewContext($submission),
        ]);
    }

    /**
     * Correct the payment details on an already-approved receipt.
     *
     * The OR number usually arrives after the fact - the booklet is written up at the end
     * of the day, or the bank reference is only read off the statement later - so an
     * approval that has already posted still needs somewhere to put it. What can be
     * changed is how the collection is *described*: mode of payment, OR number, reference
     * number, date and remarks. What cannot is the money. The verified amount and its
     * subdivision are what the ledger has already been moved by, and restating those here
     * would move a student's balance with no void, no note and no trail - the void request
     * queue is the way that is meant to happen.
     */
    public function updatePaymentDetails(Request $request, string $id): JsonResponse
    {
        if (!$this->canReview($request)) {
            return response()->json(['success' => false, 'message' => 'Forbidden.'], 403);
        }

        $validated = $request->validate([
            'payment_method' => 'nullable|string|max:255',
            'payment_date' => 'nullable|date',
            'or_number' => 'nullable|string|max:255',
            'reference_number' => 'nullable|string|max:255',
            'remarks' => 'nullable|string',
        ]);

        $institutionId = $this->resolveInstitutionId($request);
        $submission = PaymentReceiptSubmission::where('institution_id', $institutionId)
            ->with('paymentTransaction')
            ->find($id);

        if (!$submission) {
            return response()->json(['success' => false, 'message' => 'Receipt submission not found.'], 404);
        }
        if ($submission->status !== PaymentReceiptSubmission::STATUS_APPROVED) {
            return response()->json([
                'success' => false,
                'message' => 'Only an approved receipt has a posted payment to edit.',
            ], 422);
        }

        $transaction = $submission->paymentTransaction;
        if (!$transaction) {
            return response()->json([
                'success' => false,
                'message' => 'This approval was posted before receipts carried a transaction record, so its details cannot be edited here.',
            ], 422);
        }

        $orNumber = PaymentIdentifierRegistry::normalize($validated['or_number'] ?? null);
        $referenceNumber = PaymentIdentifierRegistry::normalize($validated['reference_number'] ?? null);

        $taken = PaymentIdentifierRegistry::conflicts(
            $institutionId,
            ['or_number' => $orNumber, 'reference_number' => $referenceNumber],
            $transaction->id
        );

        if ($taken) {
            return $this->duplicateIdentifierResponse($taken);
        }

        // Only what the request actually carried. A field that is absent is left exactly as
        // the approval posted it rather than being nulled by omission: the screen edits the
        // two receipt identifiers and sends nothing else, so the mode, the date and the
        // remark have to survive that. An identifier sent empty *is* a change — it clears.
        $details = [];

        if ($request->has('or_number')) {
            $details['or_number'] = $orNumber;
        }
        if ($request->has('reference_number')) {
            $details['reference_number'] = $referenceNumber;
        }
        if ($request->has('payment_method')) {
            $details['payment_method'] = $this->blankToNull($validated['payment_method'] ?? null);
        }
        if ($request->has('remarks')) {
            $details['remarks'] = $this->blankToNull($validated['remarks'] ?? null);
        }
        if (!empty($validated['payment_date'])) {
            $details['payment_date'] = $validated['payment_date'];
        }

        if ($details !== []) {
            DB::transaction(function () use ($transaction, $details) {
                $transaction->update($details);

                // The line items denormalize the header's details and the ledger reads them
                // off the lines, so an OR number written only on the header would never show.
                $transaction->items()->update($details);
            });
        }

        return response()->json([
            'success' => true,
            'message' => 'Payment details updated.',
            'data' => $this->withReviewContext($submission),
        ]);
    }

    /**
     * Reload a submission with everything the queue renders it from: who it is for, who
     * reviewed it, and how the posted amount was subdivided.
     */
    private function withReviewContext(PaymentReceiptSubmission $submission): PaymentReceiptSubmission
    {
        return $submission->fresh([
            'student:id,first_name,middle_name,last_name',
            'reviewer:id,first_name,last_name',
            'paymentTransaction.items.schoolFee:id,name',
            'paymentTransaction.items.additionalFee:id,name,source',
        ]);
    }

    /**
     * A field the reviewer cleared is absent, not an empty string — so a blank mode of payment
     * falls back to the default instead of overwriting it with "".
     */
    private function blankToNull(mixed $value): ?string
    {
        $trimmed = trim((string) ($value ?? ''));

        return $trimmed === '' ? null : $trimmed;
    }

    /**
     * @param  array<string, string[]>  $errors
     */
    private function duplicateIdentifierResponse(array $errors): JsonResponse
    {
        return response()->json([
            'success' => false,
            'message' => collect($errors)->flatten()->implode(' '),
            'errors' => $errors,
        ], 422);
    }

    /**
     * Reject a pending submission with a required reason.
     */
    public function reject(Request $request, string $id): JsonResponse
    {
        if (!$this->canReview($request)) {
            return response()->json(['success' => false, 'message' => 'Forbidden.'], 403);
        }

        $validated = $request->validate([
            'review_note' => 'required|string|max:2000',
        ]);

        $institutionId = $this->resolveInstitutionId($request);
        $submission = PaymentReceiptSubmission::where('institution_id', $institutionId)->find($id);

        if (!$submission) {
            return response()->json(['success' => false, 'message' => 'Receipt submission not found.'], 404);
        }
        if ($submission->status !== PaymentReceiptSubmission::STATUS_PENDING) {
            return response()->json(['success' => false, 'message' => 'Only pending submissions can be rejected.'], 422);
        }

        $submission->update([
            'status' => PaymentReceiptSubmission::STATUS_REJECTED,
            'review_note' => $validated['review_note'],
            'reviewed_by' => $request->user()?->id,
            'reviewed_at' => now(),
        ]);

        $submission->load([
            'student:id,first_name,middle_name,last_name',
            'reviewer:id,first_name,last_name',
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Receipt rejected.',
            'data' => $submission,
        ]);
    }

    /**
     * Who may open the institution's queue: whoever can read Finance.
     *
     * The route already says as much (`module:finance,view`); this repeats it
     * because the same method also serves a student's own list, and the two
     * branches must not be able to drift apart.
     */
    private function canSeeQueue(Request $request): bool
    {
        return $this->hasFinanceAbility($request, 'view');
    }

    /**
     * Who may approve or reject: whoever can change Finance.
     *
     * This used to be a hardcoded list of four built-in role slugs, which meant
     * a school's own role — a "Cashier" built in the role builder and ticked
     * for Finance — was handed the screen by the router and then refused by the
     * controller. The queue rendered as empty rather than as denied, so a
     * receipt a student had really uploaded looked like it had never arrived.
     * The permission is the authority, the same as everywhere else in Finance.
     */
    private function canReview(Request $request): bool
    {
        return $this->hasFinanceAbility($request, 'manage');
    }

    private function hasFinanceAbility(Request $request, string $ability): bool
    {
        $user = $request->user();
        if (!$user || $user instanceof StudentPortalUser) {
            return false;
        }

        return method_exists($user, 'hasModuleAccess')
            && $user->hasModuleAccess('finance', $ability);
    }

    private function isStudentActor(Request $request): bool
    {
        $user = $request->user();
        if (!$user) {
            return false;
        }

        if ($user instanceof StudentPortalUser) {
            return true;
        }

        $role = method_exists($user, 'getRole') ? $user->getRole() : null;

        return (string) ($role->slug ?? '') === 'student';
    }

    private function resolveSelfStudentId(Request $request): ?string
    {
        $user = $request->user();
        if (!$user) {
            return null;
        }

        if ($user instanceof StudentPortalUser) {
            return $user->student->id;
        }

        return Student::where('user_id', $user->id)->value('id');
    }

    private function resolveInstitutionId(Request $request): ?string
    {
        $user = $request->user();
        if (!$user) {
            return null;
        }

        if ($user instanceof StudentPortalUser) {
            return $user->student
                ->studentInstitutions()
                ->where('is_active', true)
                ->value('institution_id')
                ?? $user->student->studentInstitutions()->value('institution_id');
        }

        $institutionId = $user->getDefaultInstitutionId();
        if (!$institutionId) {
            $firstUserInstitution = $user->userInstitutions()->first();
            if ($firstUserInstitution) {
                $institutionId = $firstUserInstitution->institution_id;
            }
        }

        if (!$institutionId && $this->isStudentActor($request)) {
            $selfStudentId = $this->resolveSelfStudentId($request);
            if ($selfStudentId) {
                $selfStudent = Student::find($selfStudentId);
                $institutionId = $selfStudent?->studentInstitutions()->value('institution_id');
            }
        }

        return $institutionId;
    }
}
