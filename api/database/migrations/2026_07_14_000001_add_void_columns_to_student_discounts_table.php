<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Soft-void support for student discounts, mirroring student_payments. A
     * voided discount row is kept for audit purposes but is excluded from
     * ledger totals / running balance, NOA, and balance forward.
     */
    public function up(): void
    {
        Schema::table('student_discounts', function (Blueprint $table) {
            $table->timestamp('voided_at')->nullable()->after('created_by');
            $table->foreignUuid('voided_by')->nullable()->after('voided_at')
                ->references('id')->on('users')->onDelete('set null');
            $table->text('void_note')->nullable()->after('voided_by');
        });
    }

    public function down(): void
    {
        Schema::table('student_discounts', function (Blueprint $table) {
            $table->dropConstrainedForeignId('voided_by');
            $table->dropColumn(['voided_at', 'void_note']);
        });
    }
};
