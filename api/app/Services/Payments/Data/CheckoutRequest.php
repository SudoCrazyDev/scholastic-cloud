<?php

namespace App\Services\Payments\Data;

/**
 * What the platform wants a provider to collect, in the platform's own terms.
 *
 * A driver's job is to turn this into whatever shape its provider wants. The
 * caller never assembles a provider payload, which is what lets a second
 * provider be added without touching the controller.
 */
class CheckoutRequest
{
    /**
     * @param  array<string, mixed>|null  $buyer  name/contact of the payer, where the provider can use it
     * @param  array<string, mixed>  $metadata  echoed back to us on the callback
     * @param  float|null  $subtotal  before discount; null when there was none
     * @param  float|null  $discount  shown as its own line on the provider's receipt
     */
    public function __construct(
        public readonly string $reference,
        public readonly float $amount,
        public readonly string $currency,
        public readonly string $itemName,
        public readonly string $description,
        public readonly string $successUrl,
        public readonly string $failureUrl,
        public readonly string $cancelUrl,
        public readonly ?array $buyer = null,
        public readonly array $metadata = [],
        public readonly ?float $subtotal = null,
        public readonly ?float $discount = null,
    ) {}

    /**
     * Is there a discount breakdown worth showing, and does it add up?
     *
     * A breakdown that does not reconcile with the amount actually charged is
     * dropped rather than sent — a provider receipt whose lines do not sum to
     * its own total is worse than one with no breakdown at all.
     */
    public function hasReconcilingDiscount(): bool
    {
        if ($this->subtotal === null || $this->discount === null || $this->discount <= 0) {
            return false;
        }

        return abs(($this->subtotal - $this->discount) - $this->amount) < 0.01;
    }
}
