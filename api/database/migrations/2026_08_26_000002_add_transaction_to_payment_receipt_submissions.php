<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Approving a receipt now posts a real cashiering transaction rather than one
     * lump payment, so the reviewer can say which fees the money settled and the
     * school can see the split afterwards.
     *
     * `student_payment_id` stays and keeps pointing at the first line item, so
     * anything already reading it still resolves; `payment_transaction_id` is the
     * link to follow for the whole receipt.
     */
    public function up(): void
    {
        Schema::table('payment_receipt_submissions', function (Blueprint $table) {
            $table->foreignUuid('payment_transaction_id')->nullable()->after('student_payment_id')
                ->references('id')->on('payment_transactions')->onDelete('set null');
        });
    }

    public function down(): void
    {
        Schema::table('payment_receipt_submissions', function (Blueprint $table) {
            $table->dropConstrainedForeignId('payment_transaction_id');
        });
    }
};
