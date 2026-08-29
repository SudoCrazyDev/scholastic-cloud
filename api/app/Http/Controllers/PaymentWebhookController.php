<?php

namespace App\Http\Controllers;

use App\Models\InstitutionPaymentGateway;
use App\Models\StudentOnlinePaymentTransaction;
use App\Services\Payments\OnlinePaymentTransactionService;
use App\Services\Payments\PaymentGatewayManager;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

/**
 * Where providers tell us a payment happened.
 *
 * Public and unauthenticated — a provider has no session — so this endpoint is
 * reachable by anyone who can post JSON. Two rules hold everywhere in it:
 *
 *   1. Nothing is written until the callback has been established as real.
 *      Reading the body, and reading the database to work out which school and
 *      which transaction it is about, are both fine; acting on it is not.
 *   2. There are exactly two ways to establish that, and a callback with
 *      neither is rejected:
 *
 *        - a signature made with the school's own signing key, or
 *        - the provider confirming the payment when asked with the school's
 *          own secret key.
 *
 *      Maya is the second kind. It does not sign Checkout callbacks — its
 *      webhook screen is seven URL slots and no signing key — so the body is a
 *      nudge and the truth is fetched. That is stronger than a signature, not
 *      weaker: a forged callback causes a lookup that returns what really
 *      happened, which for an invented payment is nothing.
 *
 *      What must never happen is the previous behaviour, where an unsigned
 *      callback was trusted whenever no key was configured. That made this an
 *      endpoint for minting paid receipts against real students.
 *
 * Providers retry, so a callback we cannot match is answered 202 rather than
 * 404: retrying will not help, and a provider that keeps retrying eventually
 * disables the endpoint for everyone.
 */
class PaymentWebhookController extends Controller
{
    public function __construct(
        private PaymentGatewayManager $gateways,
        private OnlinePaymentTransactionService $transactionService,
    ) {}

    /**
     * The endpoint a school's merchant account is configured with.
     *
     * The slug names the gateway row, so the right key is in hand before
     * anything is read — which is the whole reason the URL carries one. It is
     * random rather than the institution's id: this URL lives in a third
     * party's dashboard and logs, and a tenant identifier there is an
     * enumeration handle given away for nothing.
     */
    public function handle(Request $request, string $provider, string $slug): JsonResponse
    {
        $gateway = $this->gateways->gatewayForWebhook($provider, $slug);

        if (! $gateway) {
            // Deliberately the same answer as an unmatched transaction: this
            // endpoint should not tell a prober which slugs exist.
            Log::warning('Payment webhook for an unknown gateway', [
                'provider' => $provider,
            ]);

            return $this->acknowledged();
        }

        return $this->process($request, $gateway);
    }

    /**
     * The single fixed URL Maya merchants were configured with before
     * credentials moved per institution.
     *
     * Kept working because it is live: a school whose Maya dashboard points
     * here would otherwise stop being told about payments the moment this
     * deploys. With no slug to go on, the transaction is found by the
     * reference we minted ourselves, and the gateway comes from the
     * transaction — so the callback is still verified against the keys the
     * payment was actually started under.
     */
    public function legacyMaya(Request $request): JsonResponse
    {
        $transaction = $this->findTransaction(
            reference: $this->stringOrNull($request->input('requestReferenceNumber')),
            providerPaymentId: $this->stringOrNull($request->input('paymentId') ?? $request->input('id')),
        );

        $gateway = $transaction ? $this->gatewayForTransaction($transaction, 'maya') : null;

        if (! $gateway) {
            Log::info('Legacy Maya webhook could not be attributed to a merchant account');

            return $this->acknowledged();
        }

        return $this->process($request, $gateway, $transaction);
    }

    /**
     * Verify, then act. Never the other way round.
     */
    private function process(
        Request $request,
        InstitutionPaymentGateway $gateway,
        ?StudentOnlinePaymentTransaction $transaction = null,
    ): JsonResponse {
        $driver = $this->gateways->driverFor($gateway);

        if (! $driver) {
            Log::error('Payment webhook for a provider with no driver', [
                'gateway_id' => $gateway->id,
                'provider' => $gateway->provider,
            ]);

            return $this->acknowledged();
        }

        $event = $driver->parseWebhook($request);

        if (! $event->identifiesATransaction()) {
            Log::warning('Payment webhook carried no transaction identifiers', [
                'gateway_id' => $gateway->id,
                'provider' => $gateway->provider,
            ]);

            return response()->json([
                'success' => false,
                'message' => 'Callback names no transaction.',
            ], 422);
        }

        $transaction ??= $this->findTransaction(
            reference: $event->reference,
            providerPaymentId: $event->providerPaymentId,
            providerChargeId: $event->providerChargeId,
        );

        if (! $transaction) {
            Log::info('Payment webhook matched no transaction', [
                'gateway_id' => $gateway->id,
                'reference' => $event->reference,
            ]);

            return $this->acknowledged();
        }

        /*
         * A verified callback for one school must not be able to move another
         * school's transaction. Without this, a school holding valid keys
         * could post a completed payment against any reference it could guess.
         */
        if ($transaction->institution_id !== $gateway->institution_id) {
            Log::warning('Payment webhook tried to move a transaction belonging to another institution', [
                'gateway_id' => $gateway->id,
                'gateway_institution_id' => $gateway->institution_id,
                'transaction_id' => $transaction->id,
            ]);

            return $this->acknowledged();
        }

        /*
         * Only now is the callback allowed to mean anything, and it takes one
         * of two things: a signature made with the school's key, or the
         * provider itself confirming the payment when asked with the school's
         * secret key.
         *
         * Maya is the second kind — it does not sign Checkout callbacks — so
         * the body is treated as an unauthenticated nudge and the status is
         * fetched rather than read. A forged callback achieves nothing: the
         * lookup returns whatever really happened, which for an invented
         * payment is nothing at all.
         *
         * The confirmed event replaces the parsed one outright. What a callback
         * claims never survives past this point.
         */
        $confirmed = $driver->confirmWebhook($event);

        if (! $confirmed && ! $driver->verifyWebhook($request)) {
            Log::warning('Payment webhook could be neither verified nor confirmed with the provider', [
                'gateway_id' => $gateway->id,
                'institution_id' => $gateway->institution_id,
                'provider' => $gateway->provider,
                'transaction_id' => $transaction->id,
            ]);

            return response()->json([
                'success' => false,
                'message' => 'Callback could not be verified.',
            ], 401);
        }

        $event = $confirmed ?? $event;

        $updated = $this->transactionService->applyGatewayUpdate(
            $transaction,
            $event,
            $driver->paymentMethodLabel(),
        );

        $gateway->forceFill(['last_used_at' => now()])->saveQuietly();

        Log::info('Payment webhook processed', [
            'transaction_id' => $updated->id,
            'provider' => $gateway->provider,
            'status' => $updated->status,
            'completed_payment_id' => $updated->completed_payment_id,
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Webhook processed.',
            'data' => [
                'id' => $updated->id,
                'status' => $updated->status,
                'completed_payment_id' => $updated->completed_payment_id,
            ],
        ]);
    }

    /**
     * Our own reference first: it is the one identifier we minted and know to
     * be unique. The provider's ids are the fallback for a callback that omits
     * it.
     */
    private function findTransaction(
        ?string $reference = null,
        ?string $providerPaymentId = null,
        ?string $providerChargeId = null,
    ): ?StudentOnlinePaymentTransaction {
        if ($reference) {
            $found = StudentOnlinePaymentTransaction::where('request_reference_number', $reference)->first();
            if ($found) {
                return $found;
            }
        }

        foreach (array_filter([$providerPaymentId, $providerChargeId]) as $id) {
            $found = StudentOnlinePaymentTransaction::where('provider_payment_id', $id)
                ->orWhere('provider_charge_id', $id)
                ->first();
            if ($found) {
                return $found;
            }
        }

        return null;
    }

    /**
     * The merchant account a transaction was taken through.
     *
     * Transactions created before credentials moved per institution carry no
     * gateway, so those fall back to the school's active one — which is the
     * right guess for them, since at the time there was only ever one.
     */
    private function gatewayForTransaction(
        StudentOnlinePaymentTransaction $transaction,
        string $provider,
    ): ?InstitutionPaymentGateway {
        if ($transaction->institution_payment_gateway_id) {
            $gateway = InstitutionPaymentGateway::find($transaction->institution_payment_gateway_id);

            if ($gateway && $gateway->provider === $provider) {
                return $gateway;
            }
        }

        $active = $this->gateways->gatewayFor((string) $transaction->institution_id);

        return $active && $active->provider === $provider ? $active : null;
    }

    /**
     * Received and understood, nothing to do. Stops a provider retrying
     * something no retry will fix.
     */
    private function acknowledged(): JsonResponse
    {
        return response()->json([
            'success' => true,
            'message' => 'Acknowledged.',
        ], 202);
    }

    private function stringOrNull(mixed $value): ?string
    {
        $value = is_string($value) ? trim($value) : '';

        return $value === '' ? null : $value;
    }
}
