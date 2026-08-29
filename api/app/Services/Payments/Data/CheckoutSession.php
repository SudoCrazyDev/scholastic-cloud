<?php

namespace App\Services\Payments\Data;

use App\Services\Payments\GatewayStatus;

/**
 * A checkout the provider has accepted and the payer can now be sent to.
 */
class CheckoutSession
{
    /**
     * @param  string  $providerPaymentId  the provider's own id for the attempt
     * @param  string  $providerChargeId  where a provider distinguishes the two; the same value otherwise
     * @param  string  $redirectUrl  where to send the payer
     * @param  array<string, mixed>  $raw  the provider's untouched response, stored for support
     */
    public function __construct(
        public readonly string $providerPaymentId,
        public readonly string $providerChargeId,
        public readonly string $redirectUrl,
        public readonly string $status = GatewayStatus::PENDING,
        public readonly array $raw = [],
    ) {}
}
