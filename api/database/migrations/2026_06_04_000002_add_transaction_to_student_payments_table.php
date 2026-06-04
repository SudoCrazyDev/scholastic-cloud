<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * student_payments becomes the line items of a payment_transactions header.
     * The receipt_number is now shared across all line items of a transaction,
     * so its unique constraint is relaxed to a plain index. The denormalized
     * receipt_number / school_fee_id / amount columns are kept on each row so
     * ledger, NOA, dashboard and online-payment code continue to work unchanged.
     */
    public function up(): void
    {
        Schema::table('student_payments', function (Blueprint $table) {
            $table->foreignUuid('payment_transaction_id')
                ->nullable()
                ->after('student_id')
                ->references('id')
                ->on('payment_transactions')
                ->onDelete('cascade');
        });

        Schema::table('student_payments', function (Blueprint $table) {
            $table->dropUnique('student_payments_receipt_number_unique');
            $table->index('receipt_number');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('student_payments', function (Blueprint $table) {
            $table->dropIndex(['receipt_number']);
            $table->unique('receipt_number');
        });

        Schema::table('student_payments', function (Blueprint $table) {
            $table->dropConstrainedForeignId('payment_transaction_id');
        });
    }
};
