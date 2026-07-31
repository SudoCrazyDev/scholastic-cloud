<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Let an approver take back an approval that should not have been granted.
     *
     * Disapproving is only open while a request is still pending, so an
     * approval made in error (wrong staff member, wrong dates, or an excuse
     * that turned out not to hold) had no way back. A voided row keeps its
     * history — who approved it and who then withdrew it, and why — while
     * dropping out of what {@see \App\Services\PayrollService} reads, so the
     * day is charged again on the next regeneration.
     */
    public function up(): void
    {
        Schema::table('staff_attendance_requests', function (Blueprint $table) {
            $table->timestamp('voided_at')->nullable()->after('reviewed_at');
            $table->foreignUuid('voided_by')->nullable()->after('voided_at')
                ->references('id')->on('users')->nullOnDelete();
            $table->text('void_note')->nullable()->after('voided_by');
        });
    }

    public function down(): void
    {
        Schema::table('staff_attendance_requests', function (Blueprint $table) {
            $table->dropConstrainedForeignId('voided_by');
            $table->dropColumn(['voided_at', 'void_note']);
        });
    }
};
