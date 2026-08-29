<?php

namespace Tests\Feature;

use App\Models\Institution;
use App\Models\InstitutionPaymentGateway;
use App\Models\Role;
use App\Models\Student;
use App\Models\StudentInstitution;
use App\Models\StudentOnlinePaymentTransaction;
use App\Models\StudentPayment;
use App\Models\User;
use App\Models\UserInstitution;
use App\Services\Payments\PaymentGatewayManager;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * Online payments, once the merchant account stopped being one per server.
 *
 * Two schools sit side by side throughout, each with its own Maya keys, because
 * every bug this design exists to prevent only appears with two: a checkout
 * charged to the wrong merchant, a callback verified with the wrong key, one
 * school's webhook moving another school's transaction.
 *
 * The other half is the webhook itself. It is public and unauthenticated — a
 * provider has no session — so anyone who can post JSON can reach it, and a
 * callback that posts a payment on its own say-so is money invented out of an
 * HTTP request. Maya does not sign its Checkout callbacks, so what stands in
 * for a signature is reading the payment back from Maya with the school's own
 * secret key. Several tests below are about that being airtight.
 */
class OnlinePaymentGatewayTest extends TestCase
{
    use RefreshDatabase;

    private const NORTH_WEBHOOK_KEY = 'north-webhook-secret';

    private const SOUTH_WEBHOOK_KEY = 'south-webhook-secret';

    private Institution $north;

    private Institution $south;

    private Student $northStudent;

    private Student $southStudent;

    private InstitutionPaymentGateway $northGateway;

    private InstitutionPaymentGateway $southGateway;

    protected function setUp(): void
    {
        parent::setUp();

        $this->north = Institution::factory()->create(['title' => 'North Academy']);
        $this->south = Institution::factory()->create(['title' => 'South Academy']);

        $this->northStudent = $this->studentAt($this->north, 'Nina', 'Norte');
        $this->southStudent = $this->studentAt($this->south, 'Sofia', 'Sur');

        $this->northGateway = $this->gatewayFor($this->north, 'north', self::NORTH_WEBHOOK_KEY, 'sandbox');
        $this->southGateway = $this->gatewayFor($this->south, 'south', self::SOUTH_WEBHOOK_KEY, 'live');

        $this->cashierAt($this->north, 'north-cashier');
        $this->cashierAt($this->south, 'south-cashier');

        /*
         * Nothing here may reach a real provider. Every test declares what Maya
         * answers; anything unfaked throws instead of quietly succeeding, which
         * matters most for the callbacks whose whole safety rests on what the
         * read-back said.
         */
        Http::preventStrayRequests();
    }

    // ---------------------------------------------------------------- checkout

    public function test_each_school_is_charged_through_its_own_merchant_account(): void
    {
        Http::fake([
            '*' => Http::response(['paymentId' => 'pay-north', 'redirectUrl' => 'https://maya.test/north'], 200),
        ]);

        $this->checkout('north-cashier', $this->northStudent)->assertCreated();

        Http::assertSent(function ($request) {
            // Sandbox host, because that is the mode North is set up on. The
            // school on live must not be reachable with sandbox keys.
            $this->assertStringStartsWith('https://pg-sandbox.paymaya.com', $request->url());
            $this->assertSame(
                'Basic '.base64_encode('north-public:'),
                $request->header('Authorization')[0],
            );

            return true;
        });
    }

    public function test_the_other_school_is_charged_through_its_own(): void
    {
        Http::fake([
            '*' => Http::response(['paymentId' => 'pay-south', 'redirectUrl' => 'https://maya.test/south'], 200),
        ]);

        $this->checkout('south-cashier', $this->southStudent)->assertCreated();

        Http::assertSent(function ($request) {
            $this->assertStringStartsWith('https://pg.paymaya.com', $request->url());
            $this->assertSame(
                'Basic '.base64_encode('south-public:'),
                $request->header('Authorization')[0],
            );

            return true;
        });
    }

    public function test_the_transaction_remembers_which_merchant_account_took_it(): void
    {
        Http::fake([
            '*' => Http::response(['paymentId' => 'pay-north', 'redirectUrl' => 'https://maya.test/north'], 200),
        ]);

        $this->checkout('north-cashier', $this->northStudent)->assertCreated();

        $transaction = StudentOnlinePaymentTransaction::firstOrFail();

        $this->assertSame($this->northGateway->id, $transaction->institution_payment_gateway_id);
        $this->assertSame('maya', $transaction->provider);
    }

    public function test_a_school_with_no_gateway_is_told_so_rather_than_failing_at_the_provider(): void
    {
        Http::fake();
        $this->northGateway->update(['is_active' => false]);
        app(PaymentGatewayManager::class)->flush();

        $this->checkout('north-cashier', $this->northStudent)
            ->assertStatus(409)
            ->assertJsonPath('success', false);

        Http::assertNothingSent();
        $this->assertSame(0, StudentOnlinePaymentTransaction::count());
    }

    public function test_a_gateway_missing_a_key_cannot_take_a_payment(): void
    {
        Http::fake();
        // The secret key. Without it a callback can never be confirmed, so a
        // payment taken on this account could never be shown to have happened.
        $this->northGateway->update([
            'credentials' => ['public_key' => 'north-public'],
        ]);
        app(PaymentGatewayManager::class)->flush();

        $this->checkout('north-cashier', $this->northStudent)->assertStatus(409);

        Http::assertNothingSent();
    }

    // ------------------------------------------------------------ availability

    /*
     * The student portal asks this before it draws a Pay button, so what it
     * answers decides whether a payer is offered a path that works. Wrong in
     * one direction hides a working payment method; wrong in the other sends
     * the payer to a checkout that cannot be created.
     */

    public function test_a_school_with_a_working_merchant_account_can_be_paid(): void
    {
        $this->withToken('north-cashier')
            ->getJson('/api/student-online-payments/availability')
            ->assertOk()
            ->assertJsonPath('data.ready', true)
            ->assertJsonPath('data.provider', 'maya')
            ->assertJsonPath('data.provider_label', 'Maya (PayMaya)')
            ->assertJsonPath('data.mode', 'sandbox')
            ->assertJsonPath('data.currency', 'PHP');
    }

    public function test_the_answer_is_the_asking_schools_own(): void
    {
        // North is on sandbox above. South is live, and neither may be told
        // about the other's account.
        $this->withToken('south-cashier')
            ->getJson('/api/student-online-payments/availability')
            ->assertOk()
            ->assertJsonPath('data.ready', true)
            ->assertJsonPath('data.mode', 'live');
    }

    public function test_a_school_nobody_has_set_up_says_so_plainly(): void
    {
        $this->northGateway->delete();

        $this->withToken('north-cashier')
            ->getJson('/api/student-online-payments/availability')
            ->assertOk()
            ->assertJsonPath('data.ready', false)
            ->assertJsonPath('data.provider', null)
            ->assertJsonPath('data.reason', 'Online payments have not been set up for this school.');
    }

    public function test_a_switched_off_account_cannot_be_paid_through(): void
    {
        $this->northGateway->forceFill(['is_active' => false])->save();

        $this->withToken('north-cashier')
            ->getJson('/api/student-online-payments/availability')
            ->assertOk()
            ->assertJsonPath('data.ready', false);
    }

    public function test_a_half_set_up_account_is_not_offered_and_names_no_keys(): void
    {
        $this->northGateway->forceFill([
            'credentials' => ['public_key' => 'north-public'],
        ])->save();

        $response = $this->withToken('north-cashier')
            ->getJson('/api/student-online-payments/availability')
            ->assertOk()
            ->assertJsonPath('data.ready', false);

        /*
         * Which key is missing is the platform's problem, not the payer's.
         * A portal that names it tells anyone who can sign in as a student
         * exactly what their school's merchant account is missing.
         */
        $this->assertStringNotContainsString('secret', strtolower($response->getContent()));
    }

    public function test_availability_never_carries_the_keys(): void
    {
        $body = $this->withToken('north-cashier')
            ->getJson('/api/student-online-payments/availability')
            ->assertOk()
            ->getContent();

        $this->assertStringNotContainsString('north-public', $body);
        $this->assertStringNotContainsString('north-secret', $body);
        $this->assertStringNotContainsString(self::NORTH_WEBHOOK_KEY, $body);
        $this->assertStringNotContainsString($this->northGateway->webhook_slug, $body);
    }

    public function test_availability_needs_a_signed_in_person(): void
    {
        $this->getJson('/api/student-online-payments/availability')->assertUnauthorized();
    }

    // ----------------------------------------------------------------- webhook

    /**
     * Maya does not sign its Checkout callbacks — its webhook screen is seven
     * URL slots and no signing key — so this is the ordinary path, and the one
     * that has to be safe: the callback is a nudge, and the status is fetched
     * from Maya with the school's own secret key.
     */
    public function test_an_unsigned_callback_posts_once_maya_confirms_it(): void
    {
        $transaction = $this->pendingTransaction($this->north, $this->northStudent, $this->northGateway, 'pay-north');

        $this->mayaSays('pay-north', 'PAYMENT_SUCCESS');

        $this->postJson($this->webhookUrl($this->northGateway), [
            'requestReferenceNumber' => $transaction->request_reference_number,
            'paymentId' => 'pay-north',
            'status' => 'PAYMENT_SUCCESS',
        ])->assertOk();

        $transaction->refresh();
        $this->assertSame('completed', $transaction->status);
        $this->assertNotNull($transaction->completed_payment_id);

        $payment = StudentPayment::findOrFail($transaction->completed_payment_id);
        $this->assertSame($this->north->id, $payment->institution_id);
        $this->assertSame('2500.00', (string) $payment->amount);
        $this->assertSame('Online - Pay With Maya', $payment->payment_method);

        // Read back with the school's secret key, on the school's own host.
        Http::assertSent(function ($request) {
            $this->assertStringStartsWith('https://pg-sandbox.paymaya.com/payments/v1/payments/pay-north', $request->url());
            $this->assertSame('Basic '.base64_encode('north-secret:'), $request->header('Authorization')[0]);

            return true;
        });
    }

    /**
     * The attack the old endpoint was open to: a stranger posting a success for
     * a reference they guessed. It now costs them a lookup and nothing else.
     */
    public function test_a_forged_success_cannot_invent_a_payment_maya_never_took(): void
    {
        $transaction = $this->pendingTransaction($this->north, $this->northStudent, $this->northGateway, 'pay-north');

        // Maya's record says otherwise, and Maya's record is what counts.
        $this->mayaSays('pay-north', 'PAYMENT_FAILED');

        $this->postJson($this->webhookUrl($this->northGateway), [
            'requestReferenceNumber' => $transaction->request_reference_number,
            'paymentId' => 'pay-north',
            'status' => 'PAYMENT_SUCCESS',
        ])->assertOk();

        $this->assertSame('failed', $transaction->fresh()->status);
        $this->assertSame(0, StudentPayment::count(), 'a forged callback minted a payment');
    }

    public function test_an_unsigned_callback_maya_does_not_recognise_is_refused(): void
    {
        $transaction = $this->pendingTransaction($this->north, $this->northStudent, $this->northGateway, 'pay-north');

        Http::fake(['*' => Http::response(['error' => 'not found'], 404)]);

        $this->postJson($this->webhookUrl($this->northGateway), [
            'requestReferenceNumber' => $transaction->request_reference_number,
            'paymentId' => 'pay-north',
            'status' => 'PAYMENT_SUCCESS',
        ])->assertStatus(401);

        $this->assertSame('pending', $transaction->fresh()->status);
        $this->assertSame(0, StudentPayment::count());
    }

    public function test_a_callback_with_nothing_to_confirm_and_no_signature_is_refused(): void
    {
        $transaction = $this->pendingTransaction($this->north, $this->northStudent, $this->northGateway, 'pay-north');

        // No payment id, so there is nothing to ask Maya about, and no
        // signature either. Neither route to trust is open.
        $this->postJson($this->webhookUrl($this->northGateway), [
            'requestReferenceNumber' => $transaction->request_reference_number,
            'status' => 'PAYMENT_SUCCESS',
        ])->assertStatus(401);

        $this->assertSame('pending', $transaction->fresh()->status);
        $this->assertSame(0, StudentPayment::count());
    }

    /**
     * Where a provider does sign — Maya's Biller API, and the providers coming
     * after it — the signature stands on its own, with no call out.
     */
    public function test_a_signed_callback_is_trusted_without_asking_the_provider(): void
    {
        $transaction = $this->pendingTransaction($this->north, $this->northStudent, $this->northGateway, 'pay-north');

        // Maya cannot be reached at all. The signature is enough.
        Http::fake(['*' => Http::response(null, 500)]);

        $this->postWebhook($this->northGateway, self::NORTH_WEBHOOK_KEY, [
            'requestReferenceNumber' => $transaction->request_reference_number,
            'paymentId' => 'pay-north',
            'status' => 'PAYMENT_SUCCESS',
        ])->assertOk();

        $this->assertSame('completed', $transaction->fresh()->status);
        $this->assertSame(1, StudentPayment::count());
    }

    public function test_a_callback_signed_with_the_wrong_schools_key_is_refused(): void
    {
        $transaction = $this->pendingTransaction($this->north, $this->northStudent, $this->northGateway, 'pay-north');

        // A real signature — just not made with North's key — and Maya does not
        // vouch for the payment either. This is the case a single shared
        // webhook secret could never have caught.
        Http::fake(['*' => Http::response(['error' => 'not found'], 404)]);

        $this->postWebhook($this->northGateway, self::SOUTH_WEBHOOK_KEY, [
            'requestReferenceNumber' => $transaction->request_reference_number,
            'paymentId' => 'pay-north',
            'status' => 'PAYMENT_SUCCESS',
        ])->assertStatus(401);

        $this->assertSame('pending', $transaction->fresh()->status);
        $this->assertSame(0, StudentPayment::count());
    }

    public function test_a_school_cannot_complete_another_schools_transaction(): void
    {
        $northTransaction = $this->pendingTransaction($this->north, $this->northStudent, $this->northGateway, 'pay-north');

        // South signs correctly, for its own merchant account, but names a
        // reference belonging to North.
        $this->postWebhook($this->southGateway, self::SOUTH_WEBHOOK_KEY, [
            'requestReferenceNumber' => $northTransaction->request_reference_number,
            'paymentId' => 'pay-north',
            'status' => 'PAYMENT_SUCCESS',
        ])->assertStatus(202);

        $this->assertSame('pending', $northTransaction->fresh()->status);
        $this->assertSame(0, StudentPayment::count());
    }

    public function test_a_replayed_callback_does_not_credit_the_student_twice(): void
    {
        $transaction = $this->pendingTransaction($this->north, $this->northStudent, $this->northGateway, 'pay-north');

        $this->mayaSays('pay-north', 'PAYMENT_SUCCESS');

        $payload = [
            'requestReferenceNumber' => $transaction->request_reference_number,
            'paymentId' => 'pay-north',
            'status' => 'PAYMENT_SUCCESS',
        ];

        $this->postWebhook($this->northGateway, self::NORTH_WEBHOOK_KEY, $payload)->assertOk();
        $this->postWebhook($this->northGateway, self::NORTH_WEBHOOK_KEY, $payload)->assertOk();

        $this->assertSame(1, StudentPayment::count());
    }

    public function test_a_late_failure_does_not_unpost_a_completed_payment(): void
    {
        $transaction = $this->pendingTransaction($this->north, $this->northStudent, $this->northGateway, 'pay-north');

        $this->postWebhook($this->northGateway, self::NORTH_WEBHOOK_KEY, [
            'requestReferenceNumber' => $transaction->request_reference_number,
            'status' => 'PAYMENT_SUCCESS',
        ])->assertOk();

        $this->postWebhook($this->northGateway, self::NORTH_WEBHOOK_KEY, [
            'requestReferenceNumber' => $transaction->request_reference_number,
            'status' => 'PAYMENT_EXPIRED',
        ])->assertOk();

        $this->assertSame('completed', $transaction->fresh()->status);
        $this->assertSame(1, StudentPayment::count());
    }

    public function test_a_cancelled_transaction_still_completes_when_the_payer_goes_back_and_pays(): void
    {
        $transaction = $this->pendingTransaction($this->north, $this->northStudent, $this->northGateway, 'pay-north');

        // What the browser writes when the payer is redirected through the
        // cancel URL.
        $transaction->update(['status' => 'cancelled']);

        $this->postWebhook($this->northGateway, self::NORTH_WEBHOOK_KEY, [
            'requestReferenceNumber' => $transaction->request_reference_number,
            'status' => 'PAYMENT_SUCCESS',
        ])->assertOk();

        $this->assertSame('completed', $transaction->fresh()->status);
        $this->assertSame(1, StudentPayment::count());
    }

    public function test_the_legacy_maya_url_still_works_and_still_verifies(): void
    {
        $transaction = $this->pendingTransaction($this->north, $this->northStudent, $this->northGateway, 'pay-north');

        $this->mayaSays('pay-north', 'PAYMENT_SUCCESS');

        $payload = [
            'requestReferenceNumber' => $transaction->request_reference_number,
            'paymentId' => 'pay-north',
            'status' => 'PAYMENT_SUCCESS',
        ];

        $this->call(
            'POST',
            '/api/payments/webhooks/maya',
            [],
            [],
            [],
            $this->signatureHeaders(self::NORTH_WEBHOOK_KEY, $payload),
            json_encode($payload),
        )->assertOk();

        $this->assertSame('completed', $transaction->fresh()->status);
    }

    public function test_the_legacy_maya_url_refuses_an_unsigned_callback(): void
    {
        $transaction = $this->pendingTransaction($this->north, $this->northStudent, $this->northGateway, 'pay-north');

        $this->postJson('/api/payments/webhooks/maya', [
            'requestReferenceNumber' => $transaction->request_reference_number,
            'status' => 'PAYMENT_SUCCESS',
        ])->assertStatus(401);

        $this->assertSame('pending', $transaction->fresh()->status);
    }

    // ------------------------------------------------------- platform screen

    public function test_only_a_platform_administrator_may_see_the_gateways(): void
    {
        $this->withToken('north-cashier')
            ->getJson('/api/institution-payment-gateways')
            ->assertForbidden();

        $this->superAdmin('super-token');

        $this->withToken('super-token')
            ->getJson('/api/institution-payment-gateways')
            ->assertOk()
            ->assertJsonPath('data.providers.0.key', 'maya');
    }

    public function test_a_schools_own_administrator_cannot_grant_itself_the_gateways(): void
    {
        /*
         * The interesting case is not a school administrator being refused —
         * it is one trying to route around the refusal through the only door
         * they do hold, the role builder. `payment-gateways` is system_only,
         * so it is not in the assignable catalog and a crafted payload asking
         * for it is rejected rather than quietly granted.
         */
        $role = Role::create([
            'institution_id' => $this->north->id,
            'title' => 'School Administrator',
            'slug' => Role::generateSlug('School Administrator', $this->north->id),
        ]);
        $role->syncPermissions(['roles.view', 'roles.manage']);

        $admin = User::factory()->create([
            'email' => 'admin@north.test',
            'token' => 'north-admin',
            'token_expiry' => now()->addYear()->toDateTimeString(),
        ]);

        UserInstitution::factory()->create([
            'user_id' => $admin->id,
            'institution_id' => $this->north->id,
            'role_id' => $role->id,
            'is_default' => true,
            'is_main' => true,
        ]);

        $this->withToken('north-admin')
            ->postJson('/api/roles', [
                'title' => 'Definitely Not Platform Staff',
                'permissions' => ['payment-gateways.view', 'payment-gateways.manage'],
            ])
            ->assertStatus(422);

        $this->withToken('north-admin')
            ->getJson('/api/institution-payment-gateways')
            ->assertForbidden();
    }

    public function test_stored_keys_never_come_back_out(): void
    {
        $this->superAdmin('super-token');

        $response = $this->withToken('super-token')
            ->getJson('/api/institution-payment-gateways')
            ->assertOk();

        $body = $response->getContent();

        foreach (['north-public', 'north-secret', self::NORTH_WEBHOOK_KEY] as $secret) {
            $this->assertStringNotContainsString($secret, $body, "a stored secret reached the response: {$secret}");
        }

        // The last four characters are all the screen gets.
        $response->assertJsonFragment(['masked' => '••••blic']);

        // The webhook slug is not a secret in the same sense — it is the URL to
        // paste into the provider's dashboard, and this screen is the only
        // place it is shown.
        $this->assertStringContainsString($this->northGateway->webhook_slug, $body);
    }

    public function test_a_gateway_missing_a_key_cannot_be_switched_on(): void
    {
        $this->superAdmin('super-token');

        // A school being set up for the first time: nothing on file yet.
        $this->southGateway->delete();

        $this->withToken('super-token')
            ->putJson("/api/institution-payment-gateways/{$this->south->id}/maya", [
                'mode' => 'sandbox',
                'product' => 'payby',
                'is_active' => true,
                'credentials' => ['public_key' => 'south-public'],
            ])
            ->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonPath('errors.secret_key.0', 'Secret key is required.');
    }

    public function test_a_half_filled_gateway_may_be_saved_so_long_as_it_stays_off(): void
    {
        $this->superAdmin('super-token');
        $this->southGateway->delete();

        /*
         * Onboarding takes more than one sitting: the webhook key is generated
         * in the provider's dashboard against the URL this screen shows, which
         * does not exist until the row does.
         */
        $this->withToken('super-token')
            ->putJson("/api/institution-payment-gateways/{$this->south->id}/maya", [
                'mode' => 'sandbox',
                'product' => 'payby',
                'is_active' => false,
                'credentials' => ['public_key' => 'south-public'],
            ])
            ->assertOk()
            ->assertJsonPath('data.ready', false)
            ->assertJsonPath('outstanding.secret_key.0', 'Secret key is required.');

        $this->assertNotNull(
            InstitutionPaymentGateway::forInstitution($this->south->id)->first()?->webhookUrl(),
        );
    }

    public function test_saving_a_gateway_leaves_keys_that_were_not_re_entered_alone(): void
    {
        $this->superAdmin('super-token');

        // The screen has never been given the stored keys, so it sends blanks
        // for the ones already on file.
        $this->withToken('super-token')
            ->putJson("/api/institution-payment-gateways/{$this->north->id}/maya", [
                'mode' => 'live',
                'product' => 'checkout',
                'is_active' => true,
                'credentials' => ['public_key' => '', 'secret_key' => '', 'webhook_signature_key' => ''],
            ])
            ->assertOk();

        $gateway = $this->northGateway->fresh();
        $this->assertSame('live', $gateway->mode);
        $this->assertSame('checkout', $gateway->product);
        $this->assertSame('north-public', $gateway->credential('public_key'));
        $this->assertSame(self::NORTH_WEBHOOK_KEY, $gateway->credential('webhook_signature_key'));
    }

    public function test_switching_one_account_on_stands_the_others_down(): void
    {
        $this->superAdmin('super-token');

        /*
         * A second provider, declared only for this test. It also proves the
         * catalog is doing real work: no code below names Maya, and the screen
         * and the validation both pick this up from config alone.
         */
        config()->set('payments.providers.testpay', [
            'label' => 'Test Pay',
            'description' => 'A provider that exists only in this test.',
            'driver' => null,
            'modes' => ['live' => ['label' => 'Live', 'base_url' => 'https://testpay.test']],
            'products' => [],
            'default_product' => null,
            'currencies' => ['PHP'],
            'credentials' => [],
        ]);

        $this->assertTrue($this->northGateway->fresh()->is_active);

        $this->withToken('super-token')
            ->putJson("/api/institution-payment-gateways/{$this->north->id}/testpay", [
                'mode' => 'live',
                'is_active' => true,
                'credentials' => [],
            ])
            ->assertOk();

        $this->assertFalse(
            $this->northGateway->fresh()->is_active,
            'switching a school to another provider must stand its previous one down',
        );

        $this->assertSame(
            1,
            InstitutionPaymentGateway::forInstitution($this->north->id)->active()->count(),
        );

        // And the school South is untouched by any of it.
        $this->assertTrue($this->southGateway->fresh()->is_active);
    }

    // ------------------------------------------------------------- fixtures

    private function studentAt(Institution $institution, string $first, string $last): Student
    {
        $student = Student::create([
            'first_name' => $first,
            'last_name' => $last,
            'gender' => 'female',
            'birthdate' => '2010-01-01',
            'is_active' => true,
        ]);

        StudentInstitution::create([
            'student_id' => $student->id,
            'institution_id' => $institution->id,
            'is_active' => true,
        ]);

        return $student;
    }

    private function gatewayFor(
        Institution $institution,
        string $prefix,
        string $webhookKey,
        string $mode,
    ): InstitutionPaymentGateway {
        return InstitutionPaymentGateway::create([
            'institution_id' => $institution->id,
            'provider' => 'maya',
            'mode' => $mode,
            'product' => 'payby',
            'currency' => 'PHP',
            'credentials' => [
                'public_key' => $prefix.'-public',
                'secret_key' => $prefix.'-secret',
                'webhook_signature_key' => $webhookKey,
            ],
            'is_active' => true,
        ]);
    }

    private function cashierAt(Institution $institution, string $token): User
    {
        $role = Role::create([
            'institution_id' => $institution->id,
            'title' => 'Cashier '.$token,
            'slug' => Role::generateSlug('Cashier '.$token, $institution->id),
        ]);
        $role->syncPermissions(['finance.view', 'finance.manage']);

        $user = User::factory()->create([
            'email' => $token.'@gateways.test',
            'token' => $token,
            'token_expiry' => now()->addYear()->toDateTimeString(),
        ]);

        UserInstitution::factory()->create([
            'user_id' => $user->id,
            'institution_id' => $institution->id,
            'role_id' => $role->id,
            'is_default' => true,
            'is_main' => true,
        ]);

        return $user;
    }

    private function superAdmin(string $token): User
    {
        $user = User::factory()->create([
            'email' => $token.'@platform.test',
            'token' => $token,
            'token_expiry' => now()->addYear()->toDateTimeString(),
        ]);

        UserInstitution::factory()
            ->role('super-administrator')
            ->create([
                'user_id' => $user->id,
                'institution_id' => $this->north->id,
                'is_default' => true,
                'is_main' => true,
            ]);

        $this->assertTrue(
            $user->fresh()->hasFullAccess(),
            'the fixture must actually hold the wildcard, or these tests prove nothing',
        );

        return $user;
    }

    private function checkout(string $token, Student $student)
    {
        return $this->withToken($token)->postJson('/api/student-online-payments/checkout', [
            'student_id' => $student->id,
            'academic_year' => '2026-2027',
            'amount' => 2500,
            'redirect_url' => [
                'success' => 'https://portal.test/paid',
                'failure' => 'https://portal.test/failed',
                'cancel' => 'https://portal.test/cancelled',
            ],
        ]);
    }

    private function pendingTransaction(
        Institution $institution,
        Student $student,
        InstitutionPaymentGateway $gateway,
        string $providerPaymentId,
    ): StudentOnlinePaymentTransaction {
        return StudentOnlinePaymentTransaction::create([
            'institution_id' => $institution->id,
            'institution_payment_gateway_id' => $gateway->id,
            'student_id' => $student->id,
            'provider' => 'maya',
            'status' => 'pending',
            'academic_year' => '2026-2027',
            'amount' => 2500,
            'currency' => 'PHP',
            'request_reference_number' => 'STUPAY-'.strtoupper($providerPaymentId),
            'provider_payment_id' => $providerPaymentId,
            'provider_charge_id' => $providerPaymentId,
        ]);
    }

    /**
     * What Maya answers when the payment is read back.
     */
    private function mayaSays(string $paymentId, string $paymentStatus): void
    {
        Http::fake([
            '*/payments/v1/payments/*' => Http::response([
                'id' => $paymentId,
                'requestReferenceNumber' => 'STUPAY-'.strtoupper($paymentId),
                'status' => $paymentStatus,
                'paymentStatus' => $paymentStatus,
                'paymentAt' => now()->toIso8601String(),
            ], 200),
        ]);
    }

    private function webhookUrl(InstitutionPaymentGateway $gateway): string
    {
        return '/api/payments/webhooks/'.$gateway->provider.'/'.$gateway->webhook_slug;
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, string>
     */
    private function signatureHeaders(string $key, array $payload): array
    {
        $body = json_encode($payload);

        return [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_ACCEPT' => 'application/json',
            'HTTP_PAYMAYA_SIGNATURE' => base64_encode(hash_hmac('sha256', $body, $key, true)),
        ];
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function postWebhook(InstitutionPaymentGateway $gateway, string $signingKey, array $payload)
    {
        return $this->call(
            'POST',
            $this->webhookUrl($gateway),
            [],
            [],
            [],
            $this->signatureHeaders($signingKey, $payload),
            json_encode($payload),
        );
    }
}
