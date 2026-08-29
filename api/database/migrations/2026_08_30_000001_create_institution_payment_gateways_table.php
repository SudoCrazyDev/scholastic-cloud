<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * The merchant account a school takes online payments through.
     *
     * One row per institution per provider, and this is per *institution*
     * rather than per deployment for a reason that holds even when every
     * school on a server uses the same provider: the money lands in the
     * school's own bank account. A merchant account is never shared between
     * two schools, so it can never live in a `.env` file that a whole server
     * reads.
     *
     * Written only by a platform administrator — the module gating the screen
     * is `system_only`, so a school cannot enter or read its own keys. That is
     * deliberate: a mistyped live secret key is a support call in the middle
     * of enrolment, and whoever onboards the merchant account is the platform
     * anyway.
     */
    public function up(): void
    {
        Schema::create('institution_payment_gateways', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('institution_id');

            // A key from config/payments.php — 'maya' today.
            $table->string('provider', 32);

            // 'sandbox' or 'live'. Picks the host, so sandbox keys cannot
            // reach the live endpoint and take real money.
            $table->string('mode', 16)->default('sandbox');

            // Provider-specific variant, e.g. Maya's 'payby' vs 'checkout'.
            $table->string('product', 32)->nullable();

            $table->string('currency', 3)->default('PHP');

            /*
             * The keys themselves, as one JSON bag under the model's
             * `encrypted:array` cast — the fields differ per provider, and
             * naming them as columns would mean a migration per provider.
             *
             * Ciphertext, keyed on APP_KEY. Never selected into a response;
             * the screen works off `credential_hints`.
             */
            $table->text('credentials');

            // Last four characters of each stored key, so the screen can show
            // which key is in place without ever sending the key.
            $table->json('credential_hints')->nullable();

            /*
             * The webhook path segment for this row. Random rather than the
             * institution UUID: the URL is handed to a third party and ends up
             * in their dashboard and their logs, and a tenant identifier in a
             * public URL is an enumeration handle we do not need to give away.
             */
            $table->string('webhook_slug', 64)->unique();

            /*
             * At most one active row per institution — the resolver takes the
             * active one, and activating a row stands the others down. A school
             * switching providers can have next year's keys sitting here
             * inactive without them competing with the ones taking money now.
             */
            $table->boolean('is_active')->default(false);

            $table->uuid('created_by')->nullable();
            $table->uuid('updated_by')->nullable();
            $table->timestamp('last_used_at')->nullable();
            $table->timestamps();

            $table->unique(['institution_id', 'provider'], 'inst_payment_gateway_provider_unique');
            $table->index(['institution_id', 'is_active'], 'inst_payment_gateway_active_idx');

            $table->foreign('institution_id')->references('id')->on('institutions')->cascadeOnDelete();
            $table->foreign('created_by')->references('id')->on('users')->nullOnDelete();
            $table->foreign('updated_by')->references('id')->on('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('institution_payment_gateways');
    }
};
