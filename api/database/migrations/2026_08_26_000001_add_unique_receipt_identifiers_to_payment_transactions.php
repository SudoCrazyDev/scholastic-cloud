<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * An OR number and a reference number stay optional, but each one a school does
     * enter now names a single collection within that institution.
     *
     * The index goes on `payment_transactions` only. Its `student_payments` line items
     * repeat the header's number by design — a receipt settling four fees writes the
     * same OR number on all four rows — so indexing them would forbid ordinary
     * multi-fee receipts. Standalone payments (no `payment_transaction_id`) are held
     * unique by PaymentIdentifierRegistry instead.
     *
     * Blanks are normalized to NULL first: MySQL treats each NULL in a unique index as
     * distinct, so any number of receipts may leave a number unissued, while two empty
     * strings would have collided.
     */
    public function up(): void
    {
        foreach (['payment_transactions', 'student_payments'] as $table) {
            DB::table($table)->where('or_number', '')->update(['or_number' => null]);
            DB::table($table)->where('reference_number', '')->update(['reference_number' => null]);
        }

        Schema::table('payment_transactions', function (Blueprint $table) {
            $table->unique(['institution_id', 'or_number'], 'payment_transactions_institution_or_unique');
            $table->unique(['institution_id', 'reference_number'], 'payment_transactions_institution_reference_unique');
        });
    }

    public function down(): void
    {
        Schema::table('payment_transactions', function (Blueprint $table) {
            $table->dropUnique('payment_transactions_institution_or_unique');
            $table->dropUnique('payment_transactions_institution_reference_unique');
        });
    }
};
