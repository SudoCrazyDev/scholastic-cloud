<?php

namespace App\Http\Controllers;

use App\Models\StudentOnlinePaymentTransaction;
use App\Services\Payments\OnlinePaymentTransactionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class InternalPaymentCallbackController extends Controller
{
    public function __construct(private OnlinePaymentTransactionService $transactionService)
    {
    }

    /**
     * Maya webhook callback endpoint processed directly by the main API.
     */
    public function mayaStatus(Request $request): JsonResponse
    {
        Log::info('Maya webhook received', [
            'url' => $request->fullUrl(),
            'method' => $request->method(),
        ]);

        if (!$this->verifyWebhookSignature($request)) {
            Log::warning('Maya webhook signature verification failed');
            return response()->json([
                'success' => false,
                'message' => 'Invalid webhook signature'
            ], 401);
        }

        $payload = $request->all();
        $requestReferenceNumber = (string) ($payload['requestReferenceNumber'] ?? '');
        // Pay With Maya (Single Payment) sends paymentId; Checkout may send id
        $providerPaymentId = (string) ($payload['paymentId'] ?? $payload['id'] ?? '');
        $status = $this->mapMayaStatus($payload);
        $paymentStatus = (string) ($payload['paymentStatus'] ?? '');

        // Log full payload (sanitized) to debug why status may be pending – Maya may use different keys per event
        $payloadForLog = $payload;
        unset($payloadForLog['paymentDetails'], $payloadForLog['card'], $payloadForLog['metadata']);
        Log::info('Maya webhook payload', [
            'request_reference_number' => $requestReferenceNumber,
            'provider_payment_id' => $providerPaymentId,
            'status' => $status,
            'payment_status' => $paymentStatus,
            'payload_keys' => array_keys($payload),
            'payload_sanitized' => $payloadForLog,
        ]);

        if ($requestReferenceNumber === '' && $providerPaymentId === '') {
            Log::warning('Maya webhook payload missing identifiers');
            return response()->json([
                'success' => false,
                'message' => 'Webhook payload missing identifiers'
            ], 422);
        }

        $transaction = null;
        if ($requestReferenceNumber !== '') {
            $transaction = StudentOnlinePaymentTransaction::where(
                'request_reference_number',
                $requestReferenceNumber
            )->first();
        }

        if (!$transaction && $providerPaymentId !== '') {
            $transaction = StudentOnlinePaymentTransaction::where('provider_charge_id', $providerPaymentId)->first();
        }

        if (!$transaction && $providerPaymentId !== '') {
            $transaction = StudentOnlinePaymentTransaction::where(
                'provider_payment_id',
                $providerPaymentId
            )->first();
        }

        if (!$transaction) {
            Log::info('Maya webhook: no matching transaction found', [
                'request_reference_number' => $requestReferenceNumber,
                'provider_payment_id' => $providerPaymentId,
            ]);
            return response()->json([
                'success' => true,
                'message' => 'No matching transaction found; webhook acknowledged'
            ], 202);
        }

        $normalized = [
            'status' => $status,
            'payment_status' => $paymentStatus !== '' ? $paymentStatus : null,
            'charge_id' => $providerPaymentId !== '' ? $providerPaymentId : null,
            'provider_payment_id' => $providerPaymentId !== '' ? $providerPaymentId : null,
            'request_reference_number' => $requestReferenceNumber !== ''
                ? $requestReferenceNumber
                : $transaction->request_reference_number,
            'payment_at' => $payload['paymentAt'] ?? $payload['updatedAt'] ?? null,
            'failure_reason' => $this->resolveFailureReason($payload, $status),
            'raw' => $payload,
        ];

        $updatedTransaction = $this->transactionService->applyGatewayUpdate($transaction, $normalized);

        Log::info('Maya webhook processed successfully', [
            'transaction_id' => $updatedTransaction->id,
            'status' => $updatedTransaction->status,
            'completed_payment_id' => $updatedTransaction->completed_payment_id,
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Webhook processed successfully',
            'data' => [
                'id' => $updatedTransaction->id,
                'status' => $updatedTransaction->status,
                'completed_payment_id' => $updatedTransaction->completed_payment_id,
            ]
        ]);
    }

    private function verifyWebhookSignature(Request $request): bool
    {
        $signatureKey = (string) config('payments.maya.webhook_signature_key');
        if ($signatureKey === '') {
            return true;
        }

        $provided = (string) ($request->header('paymaya-signature') ?: $request->header('x-paymaya-signature'));
        if ($provided === '') {
            return false;
        }

        $provided = trim($provided);
        if (str_contains($provided, '=')) {
            $parts = explode('=', $provided, 2);
            $provided = trim($parts[1] ?? '');
        }

        $rawBody = $request->getContent();
        $computed = base64_encode(hash_hmac('sha256', $rawBody, $signatureKey, true));

        return hash_equals($computed, $provided);
    }

    private function mapMayaStatus(array $payload): string
    {
        $status = strtoupper((string) ($payload['status'] ?? ''));
        $paymentStatus = strtoupper((string) ($payload['paymentStatus'] ?? ''));
        $event = strtoupper((string) ($payload['event'] ?? $payload['type'] ?? ''));

        if (
            in_array($status, ['COMPLETED', 'CAPTURED', 'SUCCESS', 'PAID', 'PAYMENT_SUCCESS'], true) ||
            $paymentStatus === 'PAYMENT_SUCCESS' ||
            $event === 'PAYMENT_SUCCESS'
        ) {
            return 'completed';
        }

        if ($status === 'AUTHORIZED' || $paymentStatus === 'AUTHORIZED') {
            return 'authorized';
        }

        if (
            in_array($status, ['FAILED', 'DECLINED'], true) ||
            $paymentStatus === 'PAYMENT_FAILED' ||
            $event === 'PAYMENT_FAILED'
        ) {
            return 'failed';
        }

        if ($status === 'EXPIRED' || $paymentStatus === 'PAYMENT_EXPIRED' || $event === 'PAYMENT_EXPIRED') {
            return 'expired';
        }

        if (
            in_array($status, ['CANCELLED', 'VOIDED'], true) ||
            $paymentStatus === 'PAYMENT_CANCELLED' ||
            $event === 'PAYMENT_CANCELLED'
        ) {
            return 'cancelled';
        }

        return 'pending';
    }

    private function resolveFailureReason(array $payload, string $status): ?string
    {
        if (!in_array($status, ['failed', 'expired', 'cancelled'], true)) {
            return null;
        }

        $reason = $payload['statusReason']
            ?? ($payload['paymentDetails']['responses']['efs']['status'] ?? null)
            ?? null;

        if (!is_string($reason) || trim($reason) === '') {
            return null;
        }

        return trim($reason);
    }
}
