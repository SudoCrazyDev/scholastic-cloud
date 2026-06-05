<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Soft-void support for recorded payments. A voided payment row is kept for
     * audit purposes but is excluded from ledger totals / running balance. When
     * a whole receipt is voided, every student_payments row sharing that
     * receipt_number is stamped here.
     */
    public function up(): void
    {
        Schema::table('student_payments', function (Blueprint $table) {
            $table->timestamp('voided_at')->nullable()->after('received_by');
            $table->foreignUuid('voided_by')->nullable()->after('voided_at')
                ->references('id')->on('users')->onDelete('set null');
            $table->text('void_note')->nullable()->after('voided_by');
        });
    }

    public function down(): void
    {
        Schema::table('student_payments', function (Blueprint $table) {
            $table->dropConstrainedForeignId('voided_by');
            $table->dropColumn(['voided_at', 'void_note']);
        });
    }
};
