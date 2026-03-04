<?php

namespace App\Http\Controllers;

use App\Auth\StudentPortalUser;
use App\Models\SchoolFee;
use App\Models\Student;
use App\Models\StudentOnlinePaymentTransaction;
use App\Services\Payments\OnlinePaymentTransactionService;
use App\Services\Payments\PaymentGatewayClient;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class StudentOnlinePaymentController extends Controller
{
    public function __construct(
        private PaymentGatewayClient $gatewayClient,
        private OnlinePaymentTransactionService $transactionService
    ) {
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
        if (!$institutionId) {
            return response()->json([
                'success' => false,
                'message' => 'User does not have any institution assigned'
            ], 400);
        }

        $studentId = null;
        if ($this->isStudentActor($request)) {
            $studentId = $this->resolveSelfStudentId($request);
        } else {
            $studentId = $filters['student_id'] ?? null;
        }

        if (!$studentId) {
            return response()->json([
                'success' => false,
                'message' => $this->isStudentActor($request)
                    ? 'Student record not found for this account'
                    : 'student_id is required'
            ], $this->isStudentActor($request) ? 403 : 422);
        }

        $belongsToInstitution = Student::where('id', $studentId)
            ->whereHas('studentInstitutions', function ($query) use ($institutionId) {
                $query->where('institution_id', $institutionId);
            })
            ->exists();

        if (!$belongsToInstitution) {
            return response()->json([
                'success' => false,
                'message' => 'Student not found in this institution'
            ], 404);
        }

        $query = StudentOnlinePaymentTransaction::with(['schoolFee', 'completedPayment'])
            ->where('institution_id', $institutionId)
            ->where('student_id', $studentId);

        if (!empty($filters['academic_year'])) {
            $query->where('academic_year', $filters['academic_year']);
        }

        $transactions = $query->orderByDesc('created_at')->get();

        return response()->json([
            'success' => true,
            'data' => $transactions
        ]);
    }

    /**
     * Create an online checkout transaction for a student balance payment.
     */
    public function createCheckout(Request $request): JsonResponse
    {
        $institutionId = $this->resolveInstitutionId($request);
        if (!$institutionId) {
            return response()->json([
                'success' => false,
                'message' => 'User does not have any institution assigned'
            ], 400);
        }

        $isStudentActor = $this->isStudentActor($request);
        $rules = [
            'academic_year' => 'required|string|max:255',
            'amount' => 'required|numeric|min:0.01',
            'currency' => 'nullable|string|size:3',
            'school_fee_id' => 'nullable|uuid|exists:school_fees,id',
            'redirect_url' => 'required|array',
            'redirect_url.success' => 'required|url|max:2000',
            'redirect_url.failure' => 'required|url|max:2000',
            'redirect_url.cancel' => 'required|url|max:2000',
        ];
        if (!$isStudentActor) {
            $rules['student_id'] = 'required|uuid|exists:students,id';
        }

        $validated = $request->validate($rules);

        $studentId = $isStudentActor
            ? $this->resolveSelfStudentId($request)
            : $validated['student_id'];

        if (!$studentId) {
            return response()->json([
                'success' => false,
                'message' => 'Student record not found for this account'
            ], 403);
        }

        $student = Student::where('id', $studentId)
            ->whereHas('studentInstitutions', function ($query) use ($institutionId) {
                $query->where('institution_id', $institutionId);
            })
            ->first();

        if (!$student) {
            return response()->json([
                'success' => false,
                'message' => 'Student not found in this institution'
            ], 404);
        }

        if (!empty($validated['school_fee_id'])) {
            $feeExists = SchoolFee::where('institution_id', $institutionId)
                ->where('id', $validated['school_fee_id'])
                ->exists();
            if (!$feeExists) {
                return response()->json([
                    'success' => false,
                    'message' => 'School fee not found for this institution'
                ], 404);
            }
        }

        $requestReferenceNumber = 'STUPAY-' . now()->format('YmdHis') . '-' . Str::upper(Str::random(8));
        $currency = strtoupper((string) ($validated['currency'] ?? 'PHP'));

        $transaction = StudentOnlinePaymentTransaction::create([
            'institution_id' => $institutionId,
            'student_id' => $studentId,
            'school_fee_id' => $validated['school_fee_id'] ?? null,
            'created_by' => $request->user() instanceof StudentPortalUser ? null : $request->user()?->id,
            'provider' => 'maya_checkout',
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

        $description = 'Student balance payment for ' . $validated['academic_year'];
        $amountValue = (float) $validated['amount'];

        $gatewayPayload = [
            'request_reference_number' => $requestReferenceNumber,
            'amount' => $amountValue,
            'currency' => $currency,
            'description' => $description,
            'success_url' => $validated['redirect_url']['success'],
            'failure_url' => $validated['redirect_url']['failure'],
            'cancel_url' => $validated['redirect_url']['cancel'],
            'buyer' => [
                'first_name' => $student->first_name,
                'last_name' => $student->last_name,
            ],
            'items' => [
                [
                    'name' => 'Student Account Balance',
                    'code' => $requestReferenceNumber,
                    'description' => $description,
                    'quantity' => '1',
                    'amount' => ['value' => $amountValue, 'currency' => $currency],
                    'totalAmount' => ['value' => $amountValue, 'currency' => $currency],
                ],
            ],
            'metadata' => [
                'transaction_id' => $transaction->id,
                'institution_id' => $institutionId,
                'student_id' => $studentId,
                'academic_year' => $validated['academic_year'],
            ],
        ];

        try {
            $gatewayResponse = $this->gatewayClient->createCharge($gatewayPayload);
        } catch (\Throwable $e) {
            Log::warning('Maya checkout createCharge failed', [
                'transaction_id' => $transaction->id,
                'message' => $e->getMessage(),
                'exception' => get_class($e),
            ]);

            $transaction->update([
                'status' => 'failed',
                'failure_reason' => $e->getMessage(),
            ]);

            $message = 'Unable to create online payment checkout at the moment';
            $detail = config('app.debug') ? $e->getMessage() : null;

            return response()->json(array_filter([
                'success' => false,
                'message' => $message,
                'detail' => $detail,
            ]), 502);
        }

        $providerChargeId = (string) (
            data_get($gatewayResponse, 'charge_id')
            ?? data_get($gatewayResponse, 'id')
            ?? ''
        );
        $providerPaymentId = (string) (
            data_get($gatewayResponse, 'checkout_id')
            ?? data_get($gatewayResponse, 'id')
            ?? ''
        );
        $checkoutUrl = (string) (
            data_get($gatewayResponse, 'redirect_url')
            ?? data_get($gatewayResponse, 'redirectUrl')
            ?? ''
        );

        $transaction->update([
            'provider_charge_id' => $providerChargeId !== '' ? $providerChargeId : null,
            'provider_payment_id' => $providerPaymentId !== '' ? $providerPaymentId : null,
            'checkout_url' => $checkoutUrl !== '' ? $checkoutUrl : null,
            'provider_response' => $gatewayResponse,
            'status' => $this->transactionService->resolveStatus($gatewayResponse),
            'expires_at' => now()->addHour(),
        ]);

        $transaction = $transaction->fresh(['schoolFee', 'completedPayment']);

        return response()->json([
            'success' => true,
            'message' => 'Online payment checkout created successfully',
            'data' => [
                ...$transaction->toArray(),
                'redirect_url' => $checkoutUrl,
            ],
        ], 201);
    }

    /**
     * Get a specific online payment transaction and reconcile status if still pending.
     */
    public function show(Request $request, string $id): JsonResponse
    {
        $institutionId = $this->resolveInstitutionId($request);
        if (!$institutionId) {
            return response()->json([
                'success' => false,
                'message' => 'User does not have any institution assigned'
            ], 400);
        }

        $transaction = StudentOnlinePaymentTransaction::with(['schoolFee', 'completedPayment'])
            ->where('institution_id', $institutionId)
            ->find($id);

        if (!$transaction) {
            return response()->json([
                'success' => false,
                'message' => 'Online payment transaction not found'
            ], 404);
        }

        if ($this->isStudentActor($request)) {
            $selfStudentId = $this->resolveSelfStudentId($request);
            if (!$selfStudentId || $selfStudentId !== $transaction->student_id) {
                return response()->json([
                    'success' => false,
                    'message' => 'You can only access your own online payment transactions'
                ], 403);
            }
        }

        if (
            in_array($transaction->status, ['pending', 'authorized'], true) &&
            $transaction->provider_charge_id
        ) {
            try {
                $gatewayStatus = $this->gatewayClient->getCharge($transaction->provider_charge_id);
                $transaction = $this->transactionService->applyGatewayUpdate($transaction, $gatewayStatus);
            } catch (\Throwable) {
                // Status polling is best-effort; if gateway is down, return last known local state.
                $transaction = $transaction->fresh(['schoolFee', 'completedPayment']);
            }
        }

        return response()->json([
            'success' => true,
            'data' => $transaction
        ]);
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
}
