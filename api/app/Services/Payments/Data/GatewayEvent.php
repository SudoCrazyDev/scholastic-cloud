<?php

namespace App\Services\Payments\Data;

use Carbon\CarbonInterface;

/**
 * A status change, however we heard about it — a webhook the provider pushed,
 * or a read-back we asked for. Both arrive here in the same shape so the
 * ledger-posting path cannot tell them apart, and does not need to.
 */
class GatewayEvent
{
    /**
     * @param  array<string, mixed>  $raw
     */
    public function __construct(
        public readonly string $status,
        public readonly ?string $reference = null,
        public readonly ?string $providerPaymentId = null,
        public readonly ?string $providerChargeId = null,
        public readonly ?CarbonInterface $paidAt = null,
        public readonly ?string $failureReason = null,
        public readonly array $raw = [],
    ) {}

    /**
     * Does this event name a transaction at all? A callback carrying neither
     * our reference nor the provider's id cannot be matched to anything.
     */
    public function identifiesATransaction(): bool
    {
        return ($this->reference ?? '') !== ''
            || ($this->providerPaymentId ?? '') !== ''
            || ($this->providerChargeId ?? '') !== '';
    }
}
