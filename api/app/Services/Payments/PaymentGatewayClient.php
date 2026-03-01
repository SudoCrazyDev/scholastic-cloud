<?php

namespace App\Services\Payments;

use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use RuntimeException;

class PaymentGatewayClient
{
    public function createCharge(array $payload): array
    {
        $requestReferenceNumber = (string) ($payload['request_reference_number'] ?? '');
        if ($requestReferenceNumber === '') {
            throw new RuntimeException('request_reference_number is required');
        }

        $currency = strtoupper((string) ($payload['currency'] ?? 'PHP'));
        $amountValue = round((float) ($payload['amount'] ?? 0), 2);
        $description = (string) ($payload['description'] ?? 'Student account balance payment');
        $items = $payload['items'] ?? [];
        if (!is_array($items) || empty($items)) {
            $items = [[
                'name' => 'Student Account Balance',
                'code' => $requestReferenceNumber,
                'description' => $description,
                'quantity' => '1',
                'amount' => ['value' => $amountValue, 'currency' => $currency],
                'totalAmount' => ['value' => $amountValue, 'currency' => $currency],
            ]];
        }

        $mayaPayload = [
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
            'requestReferenceNumber' => $requestReferenceNumber,
            'redirectUrl' => [
                'success' => (string) ($payload['success_url'] ?? ''),
                'failure' => (string) ($payload['failure_url'] ?? ''),
                'cancel' => (string) ($payload['cancel_url'] ?? ''),
            ],
            'items' => $items,
            'buyer' => is_array($payload['buyer'] ?? null) ? $payload['buyer'] : null,
            'metadata' => is_array($payload['metadata'] ?? null) ? $payload['metadata'] : null,
        ];

        $response = $this->mayaRequestWithPublicKey()
            ->withHeaders([
                'Request-Reference-No' => $requestReferenceNumber,
            ])
            ->post('/checkout/v1/checkouts', $mayaPayload);

        $decoded = $this->decodeResponse($response, 'create checkout');
        $checkoutId = (string) ($decoded['checkoutId'] ?? '');
        $redirectUrl = (string) ($decoded['redirectUrl'] ?? '');

        return [
            'success' => true,
            'provider' => 'maya_checkout',
            'id' => $checkoutId,
            'charge_id' => $checkoutId,
            'checkout_id' => $checkoutId,
            'redirect_url' => $redirectUrl,
            'request_reference_number' => $requestReferenceNumber,
            'status' => $this->mapMayaStatus($decoded),
            'provider_response' => $decoded,
            'raw' => $decoded,
        ];
    }

    public function getCharge(string $chargeId): array
    {
        $response = $this->mayaRequestWithSecretKey()->get('/payments/v1/payments/' . $chargeId);
        $decoded = $this->decodeResponse($response, 'retrieve payment');
        $requestReferenceNumber = (string) ($decoded['requestReferenceNumber'] ?? '');

        return [
            'success' => true,
            'provider' => 'maya_checkout',
            'id' => $chargeId,
            'charge_id' => $chargeId,
            'checkout_id' => $chargeId,
            'request_reference_number' => $requestReferenceNumber,
            'status' => $this->mapMayaStatus($decoded),
            'payment_status' => $decoded['paymentStatus'] ?? null,
            'payment_at' => $decoded['paymentAt'] ?? null,
            'provider_response' => $decoded,
            'raw' => $decoded,
        ];
    }

    private function mayaRequestWithPublicKey(): PendingRequest
    {
        $publicKey = (string) config('payments.maya.public_key');
        if ($publicKey === '') {
            throw new RuntimeException('MAYA_PUBLIC_KEY is not configured');
        }

        return $this->baseMayaRequest($publicKey);
    }

    private function mayaRequestWithSecretKey(): PendingRequest
    {
        $secretKey = (string) config('payments.maya.secret_key');
        if ($secretKey === '') {
            throw new RuntimeException('MAYA_SECRET_KEY is not configured');
        }

        return $this->baseMayaRequest($secretKey);
    }

    private function baseMayaRequest(string $apiKey): PendingRequest
    {
        $baseUrl = rtrim((string) config('payments.maya.base_url'), '/');
        $timeout = (int) config('payments.maya.timeout', 20);
        $basicAuthValue = base64_encode($apiKey . ':');

        return Http::baseUrl($baseUrl)
            ->acceptJson()
            ->asJson()
            ->timeout($timeout)
            ->withHeaders([
                'Authorization' => 'Basic ' . $basicAuthValue,
                'Content-Type' => 'application/json',
            ]);
    }

    private function decodeResponse(Response $response, string $operation): array
    {
        if (!$response->successful()) {
            throw new RuntimeException(
                sprintf('Maya %s failed (%s): %s', $operation, $response->status(), $response->body())
            );
        }

        $decoded = $response->json();
        return is_array($decoded) ? $decoded : [];
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
}
