<?php

namespace App\Http\Controllers;

use App\Auth\StudentPortalUser;
use App\Models\InstitutionPaymentGateway;
use App\Models\SchoolFee;
use App\Models\Student;
use App\Models\StudentOnlinePaymentTransaction;
use App\Services\Payments\Contracts\PaymentGatewayDriver;
use App\Services\Payments\Data\CheckoutRequest;
use App\Services\Payments\OnlinePaymentTransactionService;
use App\Services\Payments\PaymentGatewayException;
use App\Services\Payments\PaymentGatewayManager;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * Online payments, from the student's side.
 *
 * Which provider a payment goes through is never decided here — the manager
 * hands back a driver already holding the school's own keys, and everything
 * below talks to the driver in the platform's own vocabulary. See
 * config/payments.php.
 */
class StudentOnlinePaymentController extends Controller
{
    public function __construct(
        private PaymentGatewayManager $gateways,
        private OnlinePaymentTransactionService $transactionService
    ) {}

    /**
     * Whether this school can take an online payment at all.
     *
     * The finance screen asks before it renders a Pay Online button. A button
     * that always fails is worse than no button, and "your school has not set
     * this up" is a different thing to say than "the payment failed".
     */
    public function availability(Request $request): JsonResponse
    {
        $institutionId = $this->resolveInstitutionId($request);

        if (! $institutionId) {
            return response()->json([
                'success' => true,
                'data' => ['ready' => false, 'reason' => 'No institution is assigned to this account.'],
            ]);
        }

        return response()->json([
            'success' => true,
            'data' => $this->gateways->describe($institutionId),
        ]);
    }

    /**
     * List online payment transactions for a student.
     */
    public function index(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'student_id' => 'nullable|uuid|exists:students,id',
            'academic_year' => 'nullable|string|max:255',
        ]);

        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return response()->json([
                'success' => false,
                'message' => 'User does not have any institution assigned',
            ], 400);
        }

        $studentId = null;
        if ($this->isStudentActor($request)) {
            $studentId = $this->resolveSelfStudentId($request);
        } else {
            $studentId = $filters['student_id'] ?? null;
        }

        if (! $studentId) {
            return response()->json([
                'success' => false,
                'message' => $this->isStudentActor($request)
                    ? 'Student record not found for this account'
                    : 'student_id is required',
            ], $this->isStudentActor($request) ? 403 : 422);
        }

        $belongsToInstitution = Student::where('id', $studentId)
            ->whereHas('studentInstitutions', function ($query) use ($institutionId) {
                $query->where('institution_id', $institutionId);
            })
            ->exists();

        if (! $belongsToInstitution) {
            return response()->json([
                'success' => false,
                'message' => 'Student not found in this institution',
            ], 404);
        }

        $query = StudentOnlinePaymentTransaction::with(['schoolFee', 'completedPayment'])
            ->where('institution_id', $institutionId)
            ->where('student_id', $studentId);

        if (! empty($filters['academic_year'])) {
            $query->where('academic_year', $filters['academic_year']);
        }

        $transactions = $query->orderByDesc('created_at')->get();

        return response()->json([
            'success' => true,
            'data' => $transactions,
        ]);
    }

    /**
     * Create an online checkout transaction for a student balance payment.
     */
    public function createCheckout(Request $request): JsonResponse
    {
        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return response()->json([
                'success' => false,
                'message' => 'User does not have any institution assigned',
            ], 400);
        }

        $isStudentActor = $this->isStudentActor($request);
        $rules = [
            'academic_year' => 'required|string|max:255',
            'amount' => 'required|numeric|min:0.01',
            'currency' => 'nullable|string|size:3',
            'school_fee_id' => 'nullable|uuid|exists:school_fees,id',
            'item_name' => 'nullable|string|max:255',
            'item_description' => 'nullable|string|max:500',
            'original_amount' => 'nullable|numeric|min:0',
            'discount_amount' => 'nullable|numeric|min:0',
            'redirect_url' => 'required|array',
            'redirect_url.success' => 'required|url|max:2000',
            'redirect_url.failure' => 'required|url|max:2000',
            'redirect_url.cancel' => 'required|url|max:2000',
        ];
        if (! $isStudentActor) {
            $rules['student_id'] = 'required|uuid|exists:students,id';
        }

        $validated = $request->validate($rules);

        $studentId = $isStudentActor
            ? $this->resolveSelfStudentId($request)
            : $validated['student_id'];

        if (! $studentId) {
            return response()->json([
                'success' => false,
                'message' => 'Student record not found for this account',
            ], 403);
        }

        $student = Student::with(['studentAuth', 'user'])
            ->where('id', $studentId)
            ->whereHas('studentInstitutions', function ($query) use ($institutionId) {
                $query->where('institution_id', $institutionId);
            })
            ->first();

        if (! $student) {
            return response()->json([
                'success' => false,
                'message' => 'Student not found in this institution',
            ], 404);
        }

        if (! empty($validated['school_fee_id'])) {
            $feeExists = SchoolFee::where('institution_id', $institutionId)
                ->where('id', $validated['school_fee_id'])
                ->exists();
            if (! $feeExists) {
                return response()->json([
                    'success' => false,
                    'message' => 'School fee not found for this institution',
                ], 404);
            }
        }

        /*
         * The school's own merchant account. Resolved before anything is
         * written, so a school nobody has set up yet gets a clear answer
         * instead of a transaction row that could never have been paid.
         */
        $gateway = $this->gateways->gatewayFor($institutionId);
        $driver = $gateway && $gateway->isUsable() ? $this->gateways->driverFor($gateway) : null;

        if (! $gateway || ! $driver) {
            Log::warning('Online checkout attempted with no usable payment gateway', [
                'institution_id' => $institutionId,
                'gateway_id' => $gateway?->id,
                'problems' => $gateway?->readinessProblems(),
            ]);

            return response()->json([
                'success' => false,
                'message' => 'Online payments are not available for this school.',
            ], 409);
        }

        $requestReferenceNumber = 'STUPAY-'.now()->format('YmdHis').'-'.Str::upper(Str::random(8));
        $currency = strtoupper((string) ($validated['currency'] ?? $gateway->currency ?? 'PHP'));

        $transaction = StudentOnlinePaymentTransaction::create([
            'institution_id' => $institutionId,
            'institution_payment_gateway_id' => $gateway->id,
            'student_id' => $studentId,
            'school_fee_id' => $validated['school_fee_id'] ?? null,
            'created_by' => $request->user() instanceof StudentPortalUser ? null : $request->user()?->id,
            'provider' => $gateway->provider,
            'status' => 'pending',
            'academic_year' => $validated['academic_year'],
            'amount' => $validated['amount'],
            'currency' => $currency,
            'request_reference_number' => $requestReferenceNumber,
            'provider_payload' => [
                'academic_year' => $validated['academic_year'],
                'amount' => (float) $validated['amount'],
                'currency' => $currency,
                'school_fee_id' => $validated['school_fee_id'] ?? null,
                'redirect_url' => $validated['redirect_url'],
            ],
            'metadata' => [
                'source' => $isStudentActor ? 'student_portal' : 'staff_portal',
            ],
        ]);

        $defaultDescription = 'Student balance payment for '.$validated['academic_year'];
        $description = ! empty($validated['item_description'])
            ? $validated['item_description']
            : $defaultDescription;
        $itemName = ! empty($validated['item_name'])
            ? $validated['item_name']
            : 'Student Account Balance';
        $amountValue = (float) $validated['amount'];

        // A discount breakdown is passed along for the provider's receipt to
        // show; whether it is usable is CheckoutRequest's judgement, not ours.
        $checkout = new CheckoutRequest(
            reference: $requestReferenceNumber,
            amount: $amountValue,
            currency: $currency,
            itemName: $itemName,
            description: $description,
            successUrl: $validated['redirect_url']['success'],
            failureUrl: $validated['redirect_url']['failure'],
            cancelUrl: $validated['redirect_url']['cancel'],
            buyer: $this->buildBuyer($student),
            metadata: [
                'transaction_id' => $transaction->id,
                'institution_id' => $institutionId,
                'student_id' => $studentId,
                'academic_year' => $validated['academic_year'],
            ],
            subtotal: isset($validated['original_amount']) ? (float) $validated['original_amount'] : null,
            discount: isset($validated['discount_amount']) ? (float) $validated['discount_amount'] : null,
        );

        try {
            $session = $driver->createCheckout($checkout);
        } catch (PaymentGatewayException $e) {
            // The provider's own words go to the log; the payer gets a sentence
            // that names no keys and no merchant ids.
            Log::warning('Online checkout was refused by the provider', [
                'transaction_id' => $transaction->id,
                'institution_id' => $institutionId,
                'provider' => $gateway->provider,
                'status' => $e->status,
                'message' => $e->getMessage(),
                'provider_body' => $e->providerBody,
            ]);

            $transaction->update([
                'status' => 'failed',
                'failure_reason' => $e->getMessage(),
            ]);

            return response()->json(array_filter([
                'success' => false,
                'message' => $e->publicMessage(),
                'detail' => config('app.debug') ? $e->getMessage() : null,
            ]), 502);
        } catch (\Throwable $e) {
            Log::error('Online checkout failed unexpectedly', [
                'transaction_id' => $transaction->id,
                'institution_id' => $institutionId,
                'provider' => $gateway->provider,
                'message' => $e->getMessage(),
                'exception' => get_class($e),
            ]);

            $transaction->update([
                'status' => 'failed',
                'failure_reason' => $e->getMessage(),
            ]);

            return response()->json(array_filter([
                'success' => false,
                'message' => 'Unable to create an online payment at the moment.',
                'detail' => config('app.debug') ? $e->getMessage() : null,
            ]), 502);
        }

        $transaction->update([
            'provider_charge_id' => $session->providerChargeId ?: null,
            'provider_payment_id' => $session->providerPaymentId ?: null,
            'checkout_url' => $session->redirectUrl ?: null,
            'provider_response' => $session->raw,
            'status' => $session->status,
            'expires_at' => now()->addHour(),
        ]);

        $gateway->forceFill(['last_used_at' => now()])->saveQuietly();

        $transaction = $transaction->fresh(['schoolFee', 'completedPayment']);

        return response()->json([
            'success' => true,
            'message' => 'Online payment checkout created successfully',
            'data' => [
                ...$transaction->toArray(),
                'redirect_url' => $session->redirectUrl,
            ],
        ], 201);
    }

    /**
     * Record the outcome reported by Maya's redirect (failure/cancel) for a transaction
     * that is still locally pending. Only narrows pending → failed/cancelled — does not
     * promote anything to "completed" (that is reserved for the Maya callback/webhook).
     */
    public function recordOutcome(Request $request, string $id): JsonResponse
    {
        $validated = $request->validate([
            'outcome' => ['required', 'in:failed,cancelled'],
        ]);

        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return response()->json([
                'success' => false,
                'message' => 'User does not have any institution assigned',
            ], 400);
        }

        $transaction = StudentOnlinePaymentTransaction::where('institution_id', $institutionId)
            ->find($id);

        if (! $transaction) {
            return response()->json([
                'success' => false,
                'message' => 'Online payment transaction not found',
            ], 404);
        }

        if ($this->isStudentActor($request)) {
            $selfStudentId = $this->resolveSelfStudentId($request);
            if (! $selfStudentId || $selfStudentId !== $transaction->student_id) {
                return response()->json([
                    'success' => false,
                    'message' => 'You can only update your own online payment transactions',
                ], 403);
            }
        }

        if (in_array($transaction->status, ['pending', 'authorized'], true)) {
            $transaction->update([
                'status' => $validated['outcome'],
                'failure_reason' => $validated['outcome'] === 'cancelled'
                    ? 'Cancelled by user'
                    : ($transaction->failure_reason ?? 'Reported failed by gateway redirect'),
            ]);
        }

        return response()->json([
            'success' => true,
            'data' => $transaction->fresh(['schoolFee', 'completedPayment']),
        ]);
    }

    /**
     * Get a specific online payment transaction and reconcile status if still pending.
     */
    public function show(Request $request, string $id): JsonResponse
    {
        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return response()->json([
                'success' => false,
                'message' => 'User does not have any institution assigned',
            ], 400);
        }

        $transaction = StudentOnlinePaymentTransaction::with(['schoolFee', 'completedPayment'])
            ->where('institution_id', $institutionId)
            ->find($id);

        if (! $transaction) {
            return response()->json([
                'success' => false,
                'message' => 'Online payment transaction not found',
            ], 404);
        }

        if ($this->isStudentActor($request)) {
            $selfStudentId = $this->resolveSelfStudentId($request);
            if (! $selfStudentId || $selfStudentId !== $transaction->student_id) {
                return response()->json([
                    'success' => false,
                    'message' => 'You can only access your own online payment transactions',
                ], 403);
            }
        }

        /*
         * Ask the provider what actually happened, for anything still open.
         * This is the path that rescues a payment whose webhook never arrived
         * — and the payer refreshing this page is usually how we find out.
         *
         * The driver is built from the transaction's own gateway rather than
         * the school's current one, so a payment started before the school
         * changed merchant accounts is still read back with the keys it was
         * started under.
         */
        if (
            in_array($transaction->status, ['pending', 'authorized'], true) &&
            $transaction->provider_charge_id
        ) {
            $driver = $this->driverForTransaction($transaction);

            if ($driver) {
                try {
                    $event = $driver->fetchCheckout($transaction->provider_charge_id);
                    $transaction = $this->transactionService->applyGatewayUpdate(
                        $transaction,
                        $event,
                        $driver->paymentMethodLabel(),
                    );
                } catch (\Throwable $e) {
                    // Best effort. A provider being down must not stop a
                    // student seeing the state we already hold.
                    Log::info('Could not reconcile an online payment with its provider', [
                        'transaction_id' => $transaction->id,
                        'message' => $e->getMessage(),
                    ]);

                    $transaction = $transaction->fresh(['schoolFee', 'completedPayment']);
                }
            }
        }

        return response()->json([
            'success' => true,
            'data' => $transaction,
        ]);
    }

    private function resolveInstitutionId(Request $request): ?string
    {
        $user = $request->user();
        if (! $user) {
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
        if (! $institutionId) {
            $firstUserInstitution = $user->userInstitutions()->first();
            if ($firstUserInstitution) {
                $institutionId = $firstUserInstitution->institution_id;
            }
        }

        if (! $institutionId && $this->isStudentActor($request)) {
            $selfStudentId = $this->resolveSelfStudentId($request);
            if ($selfStudentId) {
                $selfStudent = Student::find($selfStudentId);
                $institutionId = $selfStudent?->studentInstitutions()->value('institution_id');
            }
        }

        return $institutionId;
    }

    private function isStudentActor(Request $request): bool
    {
        $user = $request->user();
        if (! $user) {
            return false;
        }

        if ($user instanceof StudentPortalUser) {
            return true;
        }

        $role = method_exists($user, 'getRole') ? $user->getRole() : null;

        return (string) ($role->slug ?? '') === 'student';
    }

    /**
     * Who is paying, in plain fields.
     *
     * Deliberately not any provider's shape — each driver renames these into
     * whatever its provider wants, and decides for itself whether a partial
     * buyer is worth sending. Returned even when incomplete for the same
     * reason: that judgement is not this controller's to make.
     *
     * @return array<string, string|null>|null
     */
    private function buildBuyer(Student $student): ?array
    {
        return [
            'first_name' => trim((string) $student->first_name),
            'middle_name' => trim((string) $student->middle_name),
            'last_name' => trim((string) $student->last_name),
            'email' => trim((string) ($student->studentAuth?->email ?? $student->user?->email ?? '')),
        ];
    }

    /**
     * The driver for the merchant account a transaction was taken through.
     *
     * Transactions predating per-institution credentials carry no gateway, so
     * they fall back to the school's active one — which is the right guess,
     * since at the time there was only ever the one.
     */
    private function driverForTransaction(StudentOnlinePaymentTransaction $transaction): ?PaymentGatewayDriver
    {
        $gateway = $transaction->institution_payment_gateway_id
            ? InstitutionPaymentGateway::find($transaction->institution_payment_gateway_id)
            : null;

        $gateway ??= $this->gateways->gatewayFor((string) $transaction->institution_id);

        return $gateway ? $this->gateways->driverFor($gateway) : null;
    }

    private function resolveSelfStudentId(Request $request): ?string
    {
        $user = $request->user();
        if (! $user) {
            return null;
        }

        if ($user instanceof StudentPortalUser) {
            return $user->student->id;
        }

        return Student::where('user_id', $user->id)->value('id');
    }
}
