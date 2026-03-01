<?php

namespace App\Services;

use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use RuntimeException;

class MayaCheckoutClient
{
    public function createCheckout(array $payload, string $requestReferenceNumber): array
    {
        $response = $this->requestWithPublicKey()
            ->withHeaders([
                'Request-Reference-No' => $requestReferenceNumber,
            ])
            ->post('/checkout/v1/checkouts', $payload);

        return $this->decodeResponse($response, 'create checkout');
    }

    public function retrievePayment(string $paymentId): array
    {
        $response = $this->requestWithSecretKey()
            ->get('/payments/v1/payments/' . $paymentId);

        return $this->decodeResponse($response, 'retrieve payment');
    }

    private function requestWithPublicKey(): PendingRequest
    {
        $publicKey = (string) config('payments.maya.public_key');
        if ($publicKey === '') {
            throw new RuntimeException('MAYA_PUBLIC_KEY is not configured');
        }

        return $this->baseRequest($publicKey);
    }

    private function requestWithSecretKey(): PendingRequest
    {
        $secretKey = (string) config('payments.maya.secret_key');
        if ($secretKey === '') {
            throw new RuntimeException('MAYA_SECRET_KEY is not configured');
        }

        return $this->baseRequest($secretKey);
    }

    private function baseRequest(string $apiKey): PendingRequest
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
}
