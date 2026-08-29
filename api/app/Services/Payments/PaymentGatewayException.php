<?php

namespace App\Services\Payments;

use RuntimeException;

/**
 * A provider refused a request, or could not be reached.
 *
 * Carries the provider's own words separately from the sentence we are willing
 * to show a payer: a Maya error body can name keys and merchant ids, and that
 * belongs in the log rather than on a student's screen.
 */
class PaymentGatewayException extends RuntimeException
{
    public function __construct(
        string $message,
        public readonly string $provider = '',
        public readonly ?int $status = null,
        public readonly ?string $providerBody = null,
    ) {
        parent::__construct($message);
    }

    /**
     * What a payer may be told. Deliberately incurious.
     */
    public function publicMessage(): string
    {
        return 'The online payment service could not be reached. Please try again in a moment.';
    }
}
