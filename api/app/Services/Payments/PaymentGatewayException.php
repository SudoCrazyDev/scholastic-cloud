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
     * What a payer may be told. Deliberately incurious about the cause, but
     * not misleading about who has to fix it.
     *
     * A refused credential is the school's setup, not a blip: telling the
     * payer to "try again in a moment" sends them round the same failure
     * indefinitely, and keeps the one person who could fix it from hearing
     * about it. So that case says the school, and says it without naming a
     * key, a host or a merchant id.
     */
    public function publicMessage(): string
    {
        if (in_array($this->status, [401, 403], true)) {
            return 'The online payment account for this school is not accepting payments. '
                .'Please tell the finance office — they will need to have it checked.';
        }

        return 'The online payment service could not be reached. Please try again in a moment.';
    }
}
