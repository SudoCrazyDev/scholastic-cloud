<?php

namespace App\Services\Payments;

use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Http;
use RuntimeException;

class PaymentGatewayClient
{
    public function createCharge(array $payload): array
    {
        $response = $this->http()->post('/v1/charges', $payload);
        if (!$response->successful()) {
            throw new RuntimeException(
                'Payments service create charge failed: ' . $response->status() . ' ' . $response->body()
            );
        }

        return (array) $response->json();
    }

    public function getCharge(string $chargeId): array
    {
        $response = $this->http()->get('/v1/charges/' . $chargeId);
        if (!$response->successful()) {
            throw new RuntimeException(
                'Payments service get charge failed: ' . $response->status() . ' ' . $response->body()
            );
        }

        return (array) $response->json();
    }

    private function http(): PendingRequest
    {
        $baseUrl = rtrim((string) config('payments.service.base_url'), '/');
        $internalToken = (string) config('payments.service.internal_token');
        $timeout = (int) config('payments.service.timeout', 15);

        $request = Http::baseUrl($baseUrl)
            ->acceptJson()
            ->asJson()
            ->timeout($timeout);

        if ($internalToken !== '') {
            $request = $request->withHeaders([
                'X-Internal-Token' => $internalToken,
            ]);
        }

        return $request;
    }
}
