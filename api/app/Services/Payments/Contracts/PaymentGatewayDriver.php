<?php

namespace App\Services\Payments\Contracts;

use App\Models\InstitutionPaymentGateway;
use App\Services\Payments\Data\CheckoutRequest;
use App\Services\Payments\Data\CheckoutSession;
use App\Services\Payments\Data\GatewayEvent;
use Illuminate\Http\Request;

/**
 * Everything the platform needs one payment provider to do.
 *
 * A driver is constructed with the institution's own gateway row and talks to
 * that school's merchant account only — it never reads credentials from
 * config, which is what made the previous single-provider implementation
 * impossible to run for two schools at once.
 *
 * Implementations must be side-effect free: they talk to the provider and
 * translate, and they never touch the ledger. Deciding what a status means for
 * a student's balance is OnlinePaymentTransactionService's job, once, for every
 * provider.
 */
interface PaymentGatewayDriver
{
    public function __construct(InstitutionPaymentGateway $gateway);

    /**
     * Open a checkout the payer can be redirected to.
     *
     * @throws \App\Services\Payments\PaymentGatewayException when the provider refuses or cannot be reached
     */
    public function createCheckout(CheckoutRequest $request): CheckoutSession;

    /**
     * Ask the provider what actually happened, for a transaction we already
     * know the provider's id for.
     *
     * This is the authority, not the webhook: a payer who closes the tab
     * before the redirect and a webhook that never arrives look identical, and
     * this is how both are resolved.
     *
     * @throws \App\Services\Payments\PaymentGatewayException
     */
    public function fetchCheckout(string $providerPaymentId): GatewayEvent;

    /**
     * Is this callback really from the provider, signed with this school's key?
     *
     * Returning true when no signing key is configured is not acceptable — a
     * webhook that is trusted without a signature is an endpoint anyone can
     * use to post a completed payment into the ledger. A driver that cannot
     * verify must return false and rely on confirmWebhook() instead.
     */
    public function verifyWebhook(Request $request): bool;

    /**
     * Read a callback into the platform's own vocabulary.
     *
     * Pure translation, so it is safe to call on an unverified request — that
     * is how the caller works out which transaction a callback is even about.
     * What it returns is not trustworthy until verifyWebhook() has passed or
     * confirmWebhook() has answered.
     */
    public function parseWebhook(Request $request): GatewayEvent;

    /**
     * Ask the provider whether this actually happened.
     *
     * The answer to a provider that does not sign its callbacks. Maya's
     * Checkout webhooks carry no signature — its webhook screen has seven URL
     * slots and no signing key — so a callback is treated as an unauthenticated
     * nudge and the truth is fetched with the school's own secret key. A forged
     * callback then achieves nothing: the lookup returns the real status, or
     * the provider does not know the payment at all.
     *
     * This is stronger than a signature rather than weaker. It also settles
     * what an event *means*: the status comes from the provider's own record
     * rather than from the name of the event it happened to send.
     *
     * Returns null when the provider cannot be asked or does not recognise the
     * payment — which the caller must treat as "do not act", not as a failure.
     */
    public function confirmWebhook(GatewayEvent $event): ?GatewayEvent;

    /**
     * How this provider should be named on the payment it posts, e.g.
     * "Online - Maya Checkout". Ends up on the student's receipt.
     */
    public function paymentMethodLabel(): string;
}
