<?php

namespace App\Services\Payments\Drivers;

use App\Models\InstitutionPaymentGateway;
use App\Services\Payments\Contracts\PaymentGatewayDriver;
use App\Services\Payments\Data\CheckoutRequest;
use App\Services\Payments\Data\CheckoutSession;
use App\Services\Payments\Data\GatewayEvent;
use App\Services\Payments\GatewayStatus;
use App\Services\Payments\PaymentGatewayException;
use Carbon\Carbon;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\Response;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Maya (PayMaya).
 *
 * Maya sells two products and a school is issued keys for one of them:
 *
 *   - `payby`    — Pay With Maya, Single Payment. POST /payby/v2/paymaya/payments.
 *                  Maya wallet only.
 *   - `checkout` — Maya Checkout. POST /checkout/v1/checkouts. Cards, wallet and
 *                  online banking, and the only one that renders an itemised
 *                  receipt with a discount line.
 *
 * Which one is stored per institution, because two schools on the same server
 * can hold different Maya contracts.
 */
class MayaDriver implements PaymentGatewayDriver
{
    public function __construct(private readonly InstitutionPaymentGateway $gateway) {}

    public function createCheckout(CheckoutRequest $request): CheckoutSession
    {
        return $this->gateway->resolvedProduct() === 'checkout'
            ? $this->createCheckoutProductCharge($request)
            : $this->createPayByCharge($request);
    }

    /**
     * Pay With Maya — Single Payment. Uses the public key.
     */
    private function createPayByCharge(CheckoutRequest $request): CheckoutSession
    {
        $payload = [
            'totalAmount' => [
                'value' => round($request->amount, 2),
                'currency' => strtoupper($request->currency),
            ],
            'requestReferenceNumber' => $request->reference,
            'redirectUrl' => [
                'success' => $request->successUrl,
                'failure' => $request->failureUrl,
                'cancel' => $request->cancelUrl,
            ],
        ];

        if ($request->metadata !== []) {
            $payload['metadata'] = $request->metadata;
        }

        $decoded = $this->decode(
            $this->requestWithPublicKey()->post('/payby/v2/paymaya/payments', $payload),
            'create Pay With Maya payment',
        );

        $paymentId = (string) ($decoded['paymentId'] ?? '');

        return new CheckoutSession(
            providerPaymentId: $paymentId,
            providerChargeId: $paymentId,
            redirectUrl: (string) ($decoded['redirectUrl'] ?? ''),
            status: $this->mapStatus($decoded),
            raw: $decoded,
        );
    }

    /**
     * Maya Checkout. Uses the public key.
     */
    private function createCheckoutProductCharge(CheckoutRequest $request): CheckoutSession
    {
        $currency = strtoupper($request->currency);
        $amount = round($request->amount, 2);

        // No discount unless the caller supplied a breakdown that reconciles
        // with what is actually being charged; see CheckoutRequest.
        $discount = 0.0;
        $subtotal = $amount;
        if ($request->hasReconcilingDiscount()) {
            $subtotal = round((float) $request->subtotal, 2);
            $discount = round((float) $request->discount, 2);
        }

        $payload = [
            'totalAmount' => [
                'value' => $amount,
                'currency' => $currency,
                'details' => [
                    'discount' => $discount,
                    'serviceCharge' => 0,
                    'shippingFee' => 0,
                    'tax' => 0,
                    'subtotal' => $subtotal,
                ],
            ],
            'requestReferenceNumber' => $request->reference,
            'redirectUrl' => [
                'success' => $request->successUrl,
                'failure' => $request->failureUrl,
                'cancel' => $request->cancelUrl,
            ],
            'items' => [
                [
                    'name' => $request->itemName,
                    'code' => $request->reference,
                    'description' => $request->description,
                    'quantity' => '1',
                    'amount' => ['value' => $amount, 'currency' => $currency],
                    'totalAmount' => ['value' => $amount, 'currency' => $currency],
                ],
            ],
            'buyer' => $this->buyerPayload($request->buyer),
            'metadata' => $request->metadata !== [] ? $request->metadata : null,
        ];

        $decoded = $this->decode(
            $this->requestWithPublicKey()
                ->withHeaders(['Request-Reference-No' => $request->reference])
                ->post('/checkout/v1/checkouts', $payload),
            'create checkout',
        );

        $checkoutId = (string) ($decoded['checkoutId'] ?? '');

        return new CheckoutSession(
            providerPaymentId: $checkoutId,
            providerChargeId: $checkoutId,
            redirectUrl: (string) ($decoded['redirectUrl'] ?? ''),
            status: $this->mapStatus($decoded),
            raw: $decoded,
        );
    }

    public function fetchCheckout(string $providerPaymentId): GatewayEvent
    {
        $decoded = $this->decode(
            $this->requestWithSecretKey()->get('/payments/v1/payments/'.$providerPaymentId),
            'retrieve payment',
        );

        $status = $this->mapStatus($decoded);

        return new GatewayEvent(
            status: $status,
            reference: $this->nullIfBlank($decoded['requestReferenceNumber'] ?? null),
            providerPaymentId: $providerPaymentId,
            providerChargeId: $providerPaymentId,
            paidAt: $this->parseTimestamp($decoded['paymentAt'] ?? null),
            failureReason: $this->failureReason($decoded, $status),
            raw: $decoded,
        );
    }

    /**
     * The cheap first check, where Maya has given the school a signing key.
     *
     * Usually it has not: Maya's Checkout webhook screen is seven URL slots and
     * no signing key, and `paymaya-signature` is a Biller API facility. So this
     * returning false is the ordinary case, not an error — confirmWebhook()
     * is what makes a Maya callback trustworthy.
     *
     * What it must never do is return true because no key is configured. That
     * is what the previous implementation did, and it left the endpoint open to
     * anyone who could guess a reference number: a forged PAYMENT_SUCCESS
     * posted a real payment against a real student's balance.
     */
    public function verifyWebhook(Request $request): bool
    {
        $signatureKey = $this->gateway->credential('webhook_signature_key');
        if ($signatureKey === null) {
            return false;
        }

        $header = trim((string) (
            $request->header('paymaya-signature') ?: $request->header('x-paymaya-signature')
        ));
        if ($header === '') {
            return false;
        }

        $computed = base64_encode(
            hash_hmac('sha256', $request->getContent(), $signatureKey, true)
        );

        foreach ($this->signatureCandidates($header) as $candidate) {
            if (hash_equals($computed, $candidate)) {
                return true;
            }
        }

        return false;
    }

    /**
     * The signatures a header could be carrying.
     *
     * Maya has sent this bare and has sent it as a "t=…,v1=…" list, so both are
     * tried rather than guessed between. Splitting on the first "=" — which is
     * what this used to do unconditionally — is wrong for the bare form: a
     * base64 SHA-256 is 44 characters ending in "=" padding, so that split
     * destroyed every well-formed signature it was handed.
     *
     * @return array<string>
     */
    private function signatureCandidates(string $header): array
    {
        $candidates = [$header];

        if (str_contains($header, ',')) {
            foreach (explode(',', $header) as $part) {
                $part = trim($part);
                if (str_contains($part, '=')) {
                    $candidates[] = trim(explode('=', $part, 2)[1] ?? '');
                }
            }
        }

        return array_values(array_filter(array_unique($candidates)));
    }

    public function parseWebhook(Request $request): GatewayEvent
    {
        $payload = $request->all();
        $status = $this->mapStatus($payload);

        return new GatewayEvent(
            status: $status,
            reference: $this->nullIfBlank($payload['requestReferenceNumber'] ?? null),
            // Pay With Maya sends paymentId; Checkout may send id.
            providerPaymentId: $this->nullIfBlank($payload['paymentId'] ?? $payload['id'] ?? null),
            providerChargeId: $this->nullIfBlank($payload['paymentId'] ?? $payload['id'] ?? null),
            paidAt: $this->parseTimestamp($payload['paymentAt'] ?? $payload['updatedAt'] ?? null),
            failureReason: $this->failureReason($payload, $status),
            raw: $payload,
        );
    }

    /**
     * Ask Maya what really happened.
     *
     * Maya does not sign Checkout callbacks, so this is what makes one
     * trustworthy: the payment is read back with the school's secret key, and
     * that answer wins over anything the callback claimed. In Maya Checkout the
     * checkoutId doubles as the paymentId, so the same lookup serves both
     * products.
     */
    public function confirmWebhook(GatewayEvent $event): ?GatewayEvent
    {
        $paymentId = $event->providerPaymentId ?: $event->providerChargeId;

        if (! $paymentId) {
            // Nothing to look up. A callback carrying only our own reference
            // cannot be confirmed, and must not be acted on.
            return null;
        }

        try {
            return $this->fetchCheckout($paymentId);
        } catch (PaymentGatewayException $e) {
            Log::info('Maya could not confirm a callback', [
                'provider_payment_id' => $paymentId,
                'status' => $e->status,
                'message' => $e->getMessage(),
            ]);

            return null;
        }
    }

    public function paymentMethodLabel(): string
    {
        return $this->gateway->resolvedProduct() === 'checkout'
            ? 'Online - Maya Checkout'
            : 'Online - Pay With Maya';
    }

    /**
     * The payer, in Maya's camelCase.
     *
     * Maya rejects a partial buyer — firstName, lastName and contact are all
     * required once the object is present — so an incomplete one is omitted
     * rather than sent and refused. The caller passes plain snake_case fields
     * and never learns this; shaping a provider's payload is the driver's job.
     *
     * @param  array<string, mixed>|null  $buyer
     * @return array<string, mixed>|null
     */
    private function buyerPayload(?array $buyer): ?array
    {
        if ($buyer === null) {
            return null;
        }

        $firstName = $this->nullIfBlank($buyer['first_name'] ?? null);
        $lastName = $this->nullIfBlank($buyer['last_name'] ?? null);
        $email = $this->nullIfBlank($buyer['email'] ?? null);

        if ($firstName === null || $lastName === null || $email === null) {
            return null;
        }

        $payload = [
            'firstName' => $firstName,
            'lastName' => $lastName,
            'contact' => ['email' => $email],
        ];

        $middleName = $this->nullIfBlank($buyer['middle_name'] ?? null);
        if ($middleName !== null) {
            $payload['middleName'] = $middleName;
        }

        return $payload;
    }

    private function requestWithPublicKey(): PendingRequest
    {
        return $this->authorized($this->requireCredential('public_key'));
    }

    private function requestWithSecretKey(): PendingRequest
    {
        return $this->authorized($this->requireCredential('secret_key'));
    }

    private function requireCredential(string $key): string
    {
        $value = $this->gateway->credential($key);

        if ($value === null) {
            throw new PaymentGatewayException(
                sprintf('Maya %s is not configured for this institution.', $key),
                provider: 'maya',
            );
        }

        return $value;
    }

    private function authorized(string $apiKey): PendingRequest
    {
        $baseUrl = $this->gateway->baseUrl();

        if ($baseUrl === '') {
            throw new PaymentGatewayException(
                sprintf('No Maya endpoint is configured for the "%s" mode.', $this->gateway->mode),
                provider: 'maya',
            );
        }

        return Http::baseUrl($baseUrl)
            ->acceptJson()
            ->asJson()
            ->timeout((int) config('payments.timeout', 20))
            ->withHeaders([
                // Maya reads the key as the username of a basic auth pair with
                // an empty password.
                'Authorization' => 'Basic '.base64_encode($apiKey.':'),
                'Content-Type' => 'application/json',
            ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function decode(Response $response, string $operation): array
    {
        if (! $response->successful()) {
            throw new PaymentGatewayException(
                sprintf('Maya %s failed (%s).', $operation, $response->status()),
                provider: 'maya',
                status: $response->status(),
                providerBody: $response->body(),
            );
        }

        $decoded = $response->json();

        return is_array($decoded) ? $decoded : [];
    }

    /**
     * Maya's several vocabularies, collapsed into the platform's one.
     *
     * It reports a status under `status`, `paymentStatus` or the webhook's
     * `event`/`type` depending on the product and the call, and the three do
     * not always agree in wording — so all three are read and any one of them
     * saying success is success.
     *
     * @param  array<string, mixed>  $payload
     */
    private function mapStatus(array $payload): string
    {
        $status = strtoupper((string) ($payload['status'] ?? ''));
        $paymentStatus = strtoupper((string) ($payload['paymentStatus'] ?? ''));
        $event = strtoupper((string) ($payload['event'] ?? $payload['type'] ?? ''));

        $says = function (array $words) use ($status, $paymentStatus, $event): bool {
            return in_array($status, $words, true)
                || in_array($paymentStatus, $words, true)
                || in_array($event, $words, true);
        };

        if ($says(['COMPLETED', 'CAPTURED', 'SUCCESS', 'PAID', 'PAYMENT_SUCCESS'])) {
            return GatewayStatus::COMPLETED;
        }

        /*
         * An authorisation is a hold, not money. So is a passed 3-D Secure
         * check: the cardholder proved who they were and the payment has still
         * not been taken. Neither may post to a ledger.
         */
        if ($says(['AUTHORIZED', 'AUTH_SUCCESS', '3DS_PAYMENT_SUCCESS'])) {
            return GatewayStatus::AUTHORIZED;
        }

        if ($says(['FAILED', 'DECLINED', 'PAYMENT_FAILED', 'AUTH_FAILED', '3DS_PAYMENT_FAILURE'])) {
            return GatewayStatus::FAILED;
        }

        if ($says(['EXPIRED', 'PAYMENT_EXPIRED', 'CAPTURE_HOLD_EXPIRED', '3DS_PAYMENT_DROPOUT'])) {
            return GatewayStatus::EXPIRED;
        }

        if ($says(['CANCELLED', 'VOIDED', 'PAYMENT_CANCELLED'])) {
            return GatewayStatus::CANCELLED;
        }

        /*
         * Everything else is pending, and that includes Maya's DONE. DONE is
         * final in Maya's own list but sits beside PAYMENT_FAILED there — it
         * says the checkout finished, not that it was paid. Reading it as
         * success would post money for a card that was declined. The read-back
         * carries paymentStatus alongside it, and that is what decides.
         */
        return GatewayStatus::PENDING;
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function failureReason(array $payload, string $status): ?string
    {
        if (! in_array($status, [GatewayStatus::FAILED, GatewayStatus::EXPIRED, GatewayStatus::CANCELLED], true)) {
            return null;
        }

        $reason = $payload['statusReason']
            ?? ($payload['paymentDetails']['responses']['efs']['status'] ?? null);

        return $this->nullIfBlank(is_string($reason) ? $reason : null);
    }

    private function nullIfBlank(mixed $value): ?string
    {
        $value = trim((string) ($value ?? ''));

        return $value === '' ? null : $value;
    }

    private function parseTimestamp(mixed $value): ?Carbon
    {
        if (! is_string($value) || trim($value) === '') {
            return null;
        }

        try {
            return Carbon::parse($value);
        } catch (Throwable) {
            // A provider timestamp we cannot read is not worth failing a
            // payment over; the caller falls back to now().
            return null;
        }
    }
}
