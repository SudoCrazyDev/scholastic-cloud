<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Which merchant account a transaction was taken through.
     *
     * Needed the moment credentials stopped being one per deployment. A
     * webhook for a payment started last term must be verified with the
     * signing key that was in force when it was started, not whichever key the
     * school is on now — so the transaction remembers its gateway row rather
     * than looking one up at the time the callback lands.
     */
    public function up(): void
    {
        Schema::table('student_online_payment_transactions', function (Blueprint $table) {
            $table->uuid('institution_payment_gateway_id')->nullable()->after('institution_id');

            $table->index('institution_payment_gateway_id', 'online_tx_gateway_idx');

            /*
             * Named, because the default would be
             * student_online_payment_transactions_institution_payment_gateway_id_foreign,
             * which is past MySQL's 64-character limit for an identifier.
             *
             * Nulled rather than cascaded: deleting a merchant account must not
             * take the record of the money it collected with it.
             */
            $table->foreign('institution_payment_gateway_id', 'online_tx_gateway_foreign')
                ->references('id')->on('institution_payment_gateways')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('student_online_payment_transactions', function (Blueprint $table) {
            $table->dropForeign('online_tx_gateway_foreign');
            $table->dropIndex('online_tx_gateway_idx');
            $table->dropColumn('institution_payment_gateway_id');
        });
    }
};
