<?php

namespace Tests\Unit;

use App\Models\InstitutionPaymentGateway;
use App\Services\Payments\Drivers\MayaDriver;
use App\Services\Payments\GatewayStatus;
use Illuminate\Http\Request;
use Tests\TestCase;

/**
 * Maya's several vocabularies, read into the platform's one.
 *
 * This used to live on OnlinePaymentTransactionService, which meant the one
 * class that posts to a student's ledger also knew what Maya calls things. It
 * is a driver's job now: the ledger sees only `completed`, `failed` and the
 * rest, and every provider added after this translates into the same words.
 */
class MayaTranslationTest extends TestCase
{
    private function driver(string $webhookKey = 'signing-key'): MayaDriver
    {
        // Never saved — none of what is tested here touches the database.
        $gateway = new InstitutionPaymentGateway([
            'provider' => 'maya',
            'mode' => 'sandbox',
            'product' => 'payby',
            'currency' => 'PHP',
            'credentials' => [
                'public_key' => 'pk-test',
                'secret_key' => 'sk-test',
                'webhook_signature_key' => $webhookKey,
            ],
        ]);

        return new MayaDriver($gateway);
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function statusOf(array $payload): string
    {
        return $this->driver()->parseWebhook(Request::create('/', 'POST', $payload))->status;
    }

    public function test_maya_says_success_in_more_than_one_place(): void
    {
        $this->assertSame(GatewayStatus::COMPLETED, $this->statusOf(['paymentStatus' => 'PAYMENT_SUCCESS']));
        $this->assertSame(GatewayStatus::COMPLETED, $this->statusOf(['status' => 'PAYMENT_SUCCESS']));
        $this->assertSame(GatewayStatus::COMPLETED, $this->statusOf(['status' => 'COMPLETED']));
        $this->assertSame(GatewayStatus::COMPLETED, $this->statusOf(['status' => 'CAPTURED']));

        // Webhooks carry it as the event name rather than a status.
        $this->assertSame(GatewayStatus::COMPLETED, $this->statusOf(['event' => 'PAYMENT_SUCCESS']));
    }

    public function test_the_unhappy_endings(): void
    {
        $this->assertSame(GatewayStatus::AUTHORIZED, $this->statusOf(['status' => 'AUTHORIZED']));
        $this->assertSame(GatewayStatus::FAILED, $this->statusOf(['paymentStatus' => 'PAYMENT_FAILED']));
        $this->assertSame(GatewayStatus::FAILED, $this->statusOf(['status' => 'DECLINED']));
        $this->assertSame(GatewayStatus::EXPIRED, $this->statusOf(['paymentStatus' => 'PAYMENT_EXPIRED']));
        $this->assertSame(GatewayStatus::CANCELLED, $this->statusOf(['paymentStatus' => 'PAYMENT_CANCELLED']));
        $this->assertSame(GatewayStatus::CANCELLED, $this->statusOf(['status' => 'VOIDED']));
    }

    public function test_anything_unrecognised_is_pending_rather_than_a_guess(): void
    {
        $this->assertSame(GatewayStatus::PENDING, $this->statusOf(['paymentStatus' => 'PENDING_PAYMENT']));
        $this->assertSame(GatewayStatus::PENDING, $this->statusOf(['status' => 'SOMETHING_NEW']));
        $this->assertSame(GatewayStatus::PENDING, $this->statusOf([]));
    }

    public function test_a_failure_reason_is_only_kept_for_a_failure(): void
    {
        $failed = $this->driver()->parseWebhook(Request::create('/', 'POST', [
            'paymentStatus' => 'PAYMENT_FAILED',
            'statusReason' => 'Insufficient funds',
        ]));

        $this->assertSame('Insufficient funds', $failed->failureReason);

        // A reason arriving alongside a success is noise, and storing it would
        // leave "Insufficient funds" sitting on a paid transaction.
        $succeeded = $this->driver()->parseWebhook(Request::create('/', 'POST', [
            'paymentStatus' => 'PAYMENT_SUCCESS',
            'statusReason' => 'Insufficient funds',
        ]));

        $this->assertNull($succeeded->failureReason);
    }

    public function test_both_of_mayas_identifier_shapes_are_read(): void
    {
        // Pay With Maya sends paymentId.
        $payBy = $this->driver()->parseWebhook(Request::create('/', 'POST', [
            'requestReferenceNumber' => 'STUPAY-1',
            'paymentId' => 'pay-1',
        ]));
        $this->assertSame('STUPAY-1', $payBy->reference);
        $this->assertSame('pay-1', $payBy->providerPaymentId);

        // Checkout may send it as id.
        $checkout = $this->driver()->parseWebhook(Request::create('/', 'POST', ['id' => 'chk-1']));
        $this->assertSame('chk-1', $checkout->providerPaymentId);
        $this->assertNull($checkout->reference);
    }

    public function test_a_callback_naming_nothing_is_recognised_as_such(): void
    {
        $event = $this->driver()->parseWebhook(Request::create('/', 'POST', ['status' => 'PAYMENT_SUCCESS']));

        $this->assertFalse($event->identifiesATransaction());
    }

    /**
     * A base64 SHA-256 is 44 characters and ends in "=" padding.
     *
     * The signature check used to split the header on its first "=" and keep
     * the right-hand side, which mangled every well-formed bare signature it
     * was handed. It went unnoticed because the same method returned true
     * whenever no signing key was configured — so the only callbacks it ever
     * accepted were the unsigned ones.
     */
    public function test_a_bare_signature_with_base64_padding_verifies(): void
    {
        $body = json_encode(['requestReferenceNumber' => 'STUPAY-1', 'status' => 'PAYMENT_SUCCESS']);
        $signature = base64_encode(hash_hmac('sha256', $body, 'signing-key', true));

        $this->assertStringEndsWith('=', $signature, 'the padding is the whole point of this test');

        $this->assertTrue($this->driver()->verifyWebhook($this->signed($body, $signature)));
    }

    public function test_a_labelled_signature_list_verifies(): void
    {
        $body = json_encode(['requestReferenceNumber' => 'STUPAY-1']);
        $signature = base64_encode(hash_hmac('sha256', $body, 'signing-key', true));

        $this->assertTrue($this->driver()->verifyWebhook(
            $this->signed($body, 't=1724500000,v1='.$signature),
        ));
    }

    public function test_a_signature_made_with_another_key_does_not_verify(): void
    {
        $body = json_encode(['requestReferenceNumber' => 'STUPAY-1']);
        $signature = base64_encode(hash_hmac('sha256', $body, 'someone-elses-key', true));

        $this->assertFalse($this->driver()->verifyWebhook($this->signed($body, $signature)));
    }

    public function test_an_unsigned_callback_does_not_verify_even_with_no_key_on_file(): void
    {
        $body = json_encode(['requestReferenceNumber' => 'STUPAY-1']);

        $this->assertFalse($this->driver()->verifyWebhook(Request::create('/', 'POST', [], [], [], [], $body)));

        // And a gateway with no signing key trusts nothing at all, which is the
        // opposite of what this used to do.
        $keyless = new InstitutionPaymentGateway(['provider' => 'maya', 'credentials' => []]);
        $signature = base64_encode(hash_hmac('sha256', $body, '', true));

        $this->assertFalse((new MayaDriver($keyless))->verifyWebhook($this->signed($body, $signature)));
    }

    private function signed(string $body, string $signature): Request
    {
        return Request::create('/', 'POST', [], [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_PAYMAYA_SIGNATURE' => $signature,
        ], $body);
    }
}
