<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Cashiering could only allocate a payment to a school_fees row, so additional
     * fees (including materialized late fees) were posted as general lines and their
     * outstanding balance never moved. This column lets a payment settle one.
     */
    public function up(): void
    {
        Schema::table('student_payments', function (Blueprint $table) {
            $table->uuid('student_additional_fee_id')->nullable()->after('school_fee_id');

            $table->foreign('student_additional_fee_id')
                ->references('id')
                ->on('student_additional_fees')
                ->nullOnDelete();

            $table->index(['student_additional_fee_id'], 'sp_additional_fee_idx');
        });
    }

    public function down(): void
    {
        Schema::table('student_payments', function (Blueprint $table) {
            $table->dropForeign(['student_additional_fee_id']);
            $table->dropIndex('sp_additional_fee_idx');
            $table->dropColumn('student_additional_fee_id');
        });
    }
};
