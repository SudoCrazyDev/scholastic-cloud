<?php

namespace App\Http\Controllers;

use App\Services\MayaCheckoutClient;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class PaymentController extends Controller
{
    public function __construct(private MayaCheckoutClient $mayaClient)
    {
    }

    /**
     * Create a payment charge (called by main API).
     */
    public function createCharge(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'request_reference_number' => 'required|string|max:100',
            'amount' => 'required|numeric|min:0.01',
            'currency' => 'nullable|string|size:3',
            'description' => 'nullable|string|max:255',
            'success_url' => 'required|url|max:2000',
            'failure_url' => 'required|url|max:2000',
            'cancel_url' => 'required|url|max:2000',
            'buyer' => 'nullable|array',
            'items' => 'nullable|array',
            'metadata' => 'nullable|array',
        ]);

        $currency = strtoupper((string) ($validated['currency'] ?? 'PHP'));
        $amountValue = round((float) $validated['amount'], 2);
        $description = (string) ($validated['description'] ?? 'Student account balance payment');
        $requestReference = (string) $validated['request_reference_number'];

        $items = $validated['items'] ?? [];
        if (empty($items)) {
            $items = [[
                'name' => 'Student Account Balance',
                'code' => $requestReference,
                'description' => $description,
                'quantity' => '1',
                'amount' => ['value' => $amountValue, 'currency' => $currency],
                'totalAmount' => ['value' => $amountValue, 'currency' => $currency],
            ]];
        }

        $payload = [
            'totalAmount' => [
                'value' => $amountValue,
                'currency' => $currency,
                'details' => [
                    'discount' => 0,
                    'serviceCharge' => 0,
                    'shippingFee' => 0,
                    'tax' => 0,
                    'subtotal' => $amountValue,
                ],
            ],
            'requestReferenceNumber' => $requestReference,
            'redirectUrl' => [
                'success' => $validated['success_url'],
                'failure' => $validated['failure_url'],
                'cancel' => $validated['cancel_url'],
            ],
            'items' => $items,
            'buyer' => $validated['buyer'] ?? null,
            'metadata' => $validated['metadata'] ?? null,
        ];

        try {
            $mayaResponse = $this->mayaClient->createCheckout($payload, $requestReference);
        } catch (\Throwable $e) {
            Log::error('Failed to create Maya checkout', [
                'error' => $e->getMessage(),
                'request_reference_number' => $requestReference,
            ]);

            return response()->json([
                'success' => false,
                'message' => 'Failed to create Maya checkout transaction',
            ], 502);
        }

        $checkoutId = (string) ($mayaResponse['checkoutId'] ?? '');
        $redirectUrl = (string) ($mayaResponse['redirectUrl'] ?? '');

        return response()->json([
            'success' => true,
            'provider' => 'maya_checkout',
            'id' => $checkoutId,
            'charge_id' => $checkoutId,
            'checkout_id' => $checkoutId,
            'redirect_url' => $redirectUrl,
            'request_reference_number' => $requestReference,
            'status' => $this->mapMayaStatus($mayaResponse),
            'provider_response' => $mayaResponse,
        ], 201);
    }

    /**
     * Get charge status (called by main API).
     */
    public function showCharge(string $id): JsonResponse
    {
        try {
            $mayaResponse = $this->mayaClient->retrievePayment($id);
        } catch (\Throwable $e) {
            Log::error('Failed to retrieve Maya payment', [
                'payment_id' => $id,
                'error' => $e->getMessage(),
            ]);

            return response()->json([
                'success' => false,
                'message' => 'Failed to retrieve payment status',
            ], 502);
        }

        $requestReferenceNumber = (string) ($mayaResponse['requestReferenceNumber'] ?? '');

        return response()->json([
            'success' => true,
            'provider' => 'maya_checkout',
            'id' => $id,
            'charge_id' => $id,
            'checkout_id' => $id,
            'request_reference_number' => $requestReferenceNumber,
            'status' => $this->mapMayaStatus($mayaResponse),
            'payment_status' => $mayaResponse['paymentStatus'] ?? null,
            'payment_at' => $mayaResponse['paymentAt'] ?? null,
            'provider_response' => $mayaResponse,
            'raw' => $mayaResponse,
        ]);
    }

    /**
     * Maya webhook – verify signature and notify main API.
     */
    public function mayaWebhook(Request $request): JsonResponse
    {
        if (!$this->verifyWebhookSignature($request)) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid webhook signature'
            ], 401);
        }

        $payload = $request->all();
        $requestReferenceNumber = (string) ($payload['requestReferenceNumber'] ?? '');
        $providerPaymentId = (string) ($payload['id'] ?? '');
        $status = $this->mapMayaStatus($payload);
        $paymentStatus = (string) ($payload['paymentStatus'] ?? '');
        $failureReason = $this->resolveFailureReason($payload);

        $callbackPayload = [
            'provider' => 'maya_checkout',
            'request_reference_number' => $requestReferenceNumber,
            'charge_id' => $providerPaymentId,
            'provider_payment_id' => $providerPaymentId,
            'status' => $status,
            'payment_status' => $paymentStatus !== '' ? $paymentStatus : null,
            'payment_at' => $payload['paymentAt'] ?? $payload['updatedAt'] ?? null,
            'failure_reason' => $failureReason,
            'raw' => $payload,
        ];

        $this->notifyMainApi($callbackPayload);

        return response()->json([
            'success' => true,
            'received' => true,
        ], 200);
    }

    /**
     * Backward-compatible endpoint alias.
     */
    public function stripeWebhook(Request $request): JsonResponse
    {
        return $this->mayaWebhook($request);
    }

    private function mapMayaStatus(array $payload): string
    {
        $status = strtoupper((string) ($payload['status'] ?? ''));
        $paymentStatus = strtoupper((string) ($payload['paymentStatus'] ?? ''));

        if (
            in_array($status, ['COMPLETED', 'CAPTURED', 'SUCCESS', 'PAID'], true) ||
            $paymentStatus === 'PAYMENT_SUCCESS'
        ) {
            return 'completed';
        }

        if ($status === 'AUTHORIZED' || $paymentStatus === 'AUTHORIZED') {
            return 'authorized';
        }

        if (
            in_array($status, ['FAILED', 'DECLINED'], true) ||
            $paymentStatus === 'PAYMENT_FAILED'
        ) {
            return 'failed';
        }

        if ($status === 'EXPIRED' || $paymentStatus === 'PAYMENT_EXPIRED') {
            return 'expired';
        }

        if (
            in_array($status, ['CANCELLED', 'VOIDED'], true) ||
            $paymentStatus === 'PAYMENT_CANCELLED'
        ) {
            return 'cancelled';
        }

        return 'pending';
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

    private function notifyMainApi(array $payload): void
    {
        $callbackUrl = (string) config('payments.callback.url');
        if ($callbackUrl === '') {
            Log::warning('PAYMENTS_CALLBACK_URL not configured; skipping callback', [
                'request_reference_number' => $payload['request_reference_number'] ?? null,
            ]);
            return;
        }

        $callbackToken = (string) config('payments.callback.token');
        $timeout = (int) config('payments.callback.timeout', 10);

        try {
            $request = Http::asJson()->timeout($timeout)->acceptJson();
            if ($callbackToken !== '') {
                $request = $request->withHeaders([
                    'X-Payments-Callback-Token' => $callbackToken,
                ]);
            }

            $response = $request->post($callbackUrl, $payload);
            if (!$response->successful()) {
                Log::warning('Main API callback failed', [
                    'status' => $response->status(),
                    'body' => $response->body(),
                    'request_reference_number' => $payload['request_reference_number'] ?? null,
                ]);
            }
        } catch (\Throwable $e) {
            Log::error('Main API callback exception', [
                'error' => $e->getMessage(),
                'request_reference_number' => $payload['request_reference_number'] ?? null,
            ]);
        }
    }

    private function resolveFailureReason(array $payload): ?string
    {
        $status = $this->mapMayaStatus($payload);
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
