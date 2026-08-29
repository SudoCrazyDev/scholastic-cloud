<?php

namespace App\Services\Payments;

use App\Models\InstitutionPaymentGateway;
use App\Services\Payments\Contracts\PaymentGatewayDriver;
use App\Support\PaymentProviders;

/**
 * Decides which merchant account a school's payment goes through, and hands
 * back a driver already holding that school's keys.
 *
 * The counterpart of Tala's CredentialResolver, and the piece the old
 * single-provider implementation had nowhere to put: PaymentGatewayClient read
 * config('payments.maya.*') from inside itself, so every school on a server was
 * necessarily the same merchant. Nothing downstream of here knows which
 * provider it is talking to.
 */
class PaymentGatewayManager
{
    /**
     * Per-request memo. A checkout asks once for the gateway and again for the
     * driver, and re-reading means decrypting the keys twice.
     *
     * @var array<string, InstitutionPaymentGateway|null>
     */
    protected array $resolved = [];

    /**
     * The gateway row this school currently takes payments through, or null
     * when nobody has set one up.
     *
     * At most one row per institution is active — the controller stands the
     * others down when it activates one — but the ordering is here anyway so
     * a row activated directly in the database cannot make this ambiguous.
     */
    public function gatewayFor(string $institutionId): ?InstitutionPaymentGateway
    {
        if (array_key_exists($institutionId, $this->resolved)) {
            return $this->resolved[$institutionId];
        }

        return $this->resolved[$institutionId] = InstitutionPaymentGateway::query()
            ->forInstitution($institutionId)
            ->active()
            ->orderByDesc('updated_at')
            ->first();
    }

    /**
     * A driver for a specific gateway row.
     *
     * Takes the row rather than an institution id so a webhook for a payment
     * started under keys the school has since replaced is still verified with
     * the keys it was started under.
     */
    public function driverFor(InstitutionPaymentGateway $gateway): ?PaymentGatewayDriver
    {
        $driver = PaymentProviders::driver($gateway->provider);

        if ($driver === null || ! is_subclass_of($driver, PaymentGatewayDriver::class)) {
            return null;
        }

        return new $driver($gateway);
    }

    /**
     * The driver a new checkout for this school should use, or null when the
     * school cannot take online payments at all.
     */
    public function driverForInstitution(string $institutionId): ?PaymentGatewayDriver
    {
        $gateway = $this->gatewayFor($institutionId);

        if ($gateway === null || ! $gateway->isUsable()) {
            return null;
        }

        return $this->driverFor($gateway);
    }

    /**
     * Find the merchant account a callback is about, by the opaque slug in its
     * URL. The provider is checked too, so a slug cannot be replayed against a
     * different provider's parser.
     */
    public function gatewayForWebhook(string $provider, string $slug): ?InstitutionPaymentGateway
    {
        if (! PaymentProviders::exists($provider)) {
            return null;
        }

        return InstitutionPaymentGateway::query()
            ->where('provider', $provider)
            ->where('webhook_slug', $slug)
            ->first();
    }

    /**
     * Whether this school can take an online payment right now, and why not.
     *
     * The finance screen asks before it offers a Pay Online button — a button
     * that always fails is worse than no button, and "your school has not set
     * this up" is a different message from "the payment failed".
     *
     * @return array<string, mixed>
     */
    public function describe(string $institutionId): array
    {
        $gateway = $this->gatewayFor($institutionId);

        if ($gateway === null) {
            return [
                'ready' => false,
                'provider' => null,
                'provider_label' => null,
                'mode' => null,
                'currency' => null,
                'reason' => 'Online payments have not been set up for this school.',
            ];
        }

        $problems = $gateway->readinessProblems();

        return [
            'ready' => $problems === [],
            'provider' => $gateway->provider,
            'provider_label' => PaymentProviders::label($gateway->provider),
            'mode' => $gateway->mode,
            'currency' => $gateway->currency,
            // The specific problem is a platform concern, not a payer's, so
            // only the fact of it travels; the screen shows the sentence.
            'reason' => $problems === []
                ? null
                : 'Online payments are not available for this school at the moment.',
        ];
    }

    /**
     * Drop the memo. Only the admin screen needs this, after a write.
     */
    public function flush(?string $institutionId = null): void
    {
        if ($institutionId === null) {
            $this->resolved = [];

            return;
        }

        unset($this->resolved[$institutionId]);
    }
}
