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
                    /*
                     * pg.maya.ph, not pg.paymaya.com. Maya moved the
                     * production hostname when it rebranded and gave the old
                     * one a deadline of 2023; keys issued by the current
                     * Business Manager are refused there with a bare 401,
                     * which reads exactly like a wrong key. Sandbox did not
                     * move and is still on the paymaya.com domain.
                     */
                    'base_url' => 'https://pg.maya.ph',
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
                    'hint' => 'sk-… — reads a payment back from Maya. This is what makes a callback trustworthy, so it is required even though only the public key opens a checkout.',
                    'required' => true,
                ],

                /*
                 * Optional, because Maya does not issue one for Checkout —
                 * its webhook screen has seven URL slots and no signing key.
                 * The `paymaya-signature` header is a Biller API facility.
                 *
                 * A callback is never trusted on its own account either way:
                 * where there is no signature the driver confirms it against
                 * Maya before anything is posted. Supplying a key here only
                 * adds a cheaper first check.
                 */
                'webhook_signature_key' => [
                    'label' => 'Webhook signature key',
                    'hint' => 'Only if Maya issued one — its Checkout webhook screen does not. Callbacks are confirmed with Maya directly when this is blank.',
                    'required' => false,
                ],
            ],
        ],

    ],

];
