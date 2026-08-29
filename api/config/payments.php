<?php

use App\Services\Payments\Drivers\MayaDriver;

/*
|--------------------------------------------------------------------------
| Payment provider catalog
|--------------------------------------------------------------------------
|
| Which online payment providers the platform knows how to talk to, and what
| each one needs to be told before it can. Deliberately shaped like
| config/tala.php: one file describes the options, and the driver, the
| validation and the admin screen all read it rather than each keeping their
| own copy of the list.
|
| What is NOT here is any school's actual keys. Those live per institution in
| `institution_payment_gateways`, encrypted, because the money has to land in
| that school's own bank account — a merchant account is never shared between
| two schools, even two on the same server. See App\Support\PaymentProviders.
|
| `credentials` declares the fields a provider needs. The admin form renders
| from it and the controller validates against it, so a second provider is a
| entry here plus a driver class — not a new screen.
|
*/

return [

    /*
     * How long to wait on a provider before giving up. A payer is sitting in
     * front of a spinner, so this is short: better a clear failure they can
     * retry than a request that hangs until PHP's own timeout.
     */
    'timeout' => (int) env('PAYMENTS_TIMEOUT', 20),

    'providers' => [

        'maya' => [
            'label' => 'Maya (PayMaya)',
            'description' => 'Philippine cards, Maya wallet and online banking. The payer is redirected to Maya and returns to the portal when they are done.',
            'driver' => MayaDriver::class,

            /*
             * Sandbox keys only work against the sandbox host and live keys
             * only against the live one, so the mode picks the host rather
             * than being a flag the driver reads separately. A school set up
             * on sandbox therefore cannot accidentally take real money.
             */
            'modes' => [
                'sandbox' => [
                    'label' => 'Sandbox',
                    'base_url' => 'https://pg-sandbox.paymaya.com',
                ],
                'live' => [
                    'label' => 'Live',
                    'base_url' => 'https://pg.paymaya.com',
                ],
            ],

            /*
             * Maya sells two products with different keys and different
             * endpoints. A school is issued one or the other, so it is stored
             * per institution rather than per deployment.
             */
            'products' => [
                'payby' => [
                    'label' => 'Pay With Maya (Single Payment)',
                    'description' => 'POST /payby/v2/paymaya/payments. Maya wallet only.',
                ],
                'checkout' => [
                    'label' => 'Maya Checkout',
                    'description' => 'POST /checkout/v1/checkouts. Cards, wallet and online banking, with an itemised receipt.',
                ],
            ],
            'default_product' => 'payby',

            'currencies' => ['PHP'],

            'credentials' => [
                'public_key' => [
                    'label' => 'Public key',
                    'hint' => 'pk-… — used to create a checkout.',
                    'required' => true,
                ],
                'secret_key' => [
                    'label' => 'Secret key',
                    'hint' => 'sk-… — used to read a payment back from Maya.',
                    'required' => true,
                ],
                'webhook_signature_key' => [
                    'label' => 'Webhook signature key',
                    'hint' => 'Signs the callbacks Maya sends. Without it we cannot tell a real payment notice from a forged one, so it is required.',
                    'required' => true,
                ],
            ],
        ],

    ],

];
