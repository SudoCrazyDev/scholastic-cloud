<?php

use App\Models\Institution;
use App\Models\InstitutionPaymentGateway;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Log;

return new class extends Migration
{
    /**
     * Carry a deployment's existing Maya keys out of `.env` and onto its school.
     *
     * Credentials used to be one set per server, read from MAYA_PUBLIC_KEY and
     * friends. Pushing to master deploys to every target at once, so without
     * this a school taking money on Friday stops on Monday with nothing in the
     * logs to say why.
     *
     * Deliberately narrow. It only acts when the server holds exactly one
     * institution, because that is the only case where "which school did these
     * keys belong to" has an answer rather than a guess — and a wrong guess
     * here points a school's tuition at another school's bank account. Every
     * other deployment is left for a platform administrator to set up on the
     * Payment Gateways screen, which is where the answer actually lives.
     *
     * The row is created active, because the keys were active: this is meant to
     * preserve behaviour exactly, not to change what a school can do.
     */
    public function up(): void
    {
        $publicKey = trim((string) env('MAYA_PUBLIC_KEY'));
        $secretKey = trim((string) env('MAYA_SECRET_KEY'));

        if ($publicKey === '' || $secretKey === '') {
            return;
        }

        if (InstitutionPaymentGateway::query()->where('provider', 'maya')->exists()) {
            // Already set up on the screen. The screen wins.
            return;
        }

        $institutions = Institution::query()->limit(2)->pluck('id');

        if ($institutions->count() !== 1) {
            Log::warning('Maya keys found in the environment, but this server holds no single institution to attach them to. Set them up on the Payment Gateways screen.', [
                'institution_count' => $institutions->count(),
            ]);

            return;
        }

        $baseUrl = (string) env('MAYA_BASE_URL', 'https://pg-sandbox.paymaya.com');
        $product = (string) env('MAYA_PRODUCT', 'payby');
        $webhookKey = trim((string) env('MAYA_WEBHOOK_SIGNATURE_KEY'));

        $gateway = InstitutionPaymentGateway::create([
            'institution_id' => $institutions->first(),
            'provider' => 'maya',
            // Anything that is not plainly the sandbox host is treated as live.
            'mode' => str_contains($baseUrl, 'sandbox') ? 'sandbox' : 'live',
            'product' => in_array($product, ['payby', 'checkout'], true) ? $product : 'payby',
            'currency' => 'PHP',
            'credentials' => array_filter([
                'public_key' => $publicKey,
                'secret_key' => $secretKey,
                'webhook_signature_key' => $webhookKey !== '' ? $webhookKey : null,
            ]),
            'is_active' => true,
        ]);

        /*
         * A deployment that never had a signing key is the one that changes
         * behaviour here: unsigned callbacks used to be trusted and are now
         * refused. Said loudly, because the symptom — payments that complete at
         * Maya but never post — otherwise looks like nothing at all.
         */
        if ($webhookKey === '') {
            Log::warning('Maya keys moved onto this institution, but no webhook signature key was configured. Callbacks are now refused until one is set on the Payment Gateways screen.', [
                'institution_id' => $gateway->institution_id,
                'webhook_url' => $gateway->webhookUrl(),
            ]);
        }
    }

    /**
     * Rolls back only what it created. A gateway someone has since edited on
     * the screen is left alone — the keys in `.env` are gone by then, and
     * dropping the row would take the only copy with it.
     */
    public function down(): void
    {
        $publicKey = trim((string) env('MAYA_PUBLIC_KEY'));

        if ($publicKey === '') {
            return;
        }

        InstitutionPaymentGateway::query()
            ->where('provider', 'maya')
            ->get()
            ->filter(fn (InstitutionPaymentGateway $gateway) => $gateway->credential('public_key') === $publicKey)
            ->each(fn (InstitutionPaymentGateway $gateway) => $gateway->delete());
    }
};
