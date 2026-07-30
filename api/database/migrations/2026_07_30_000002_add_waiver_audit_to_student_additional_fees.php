<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Records who waived an additional fee and why.
     *
     * Soft-deleting a `late_fee` row is a permanent financial decision — it keeps the
     * installment's slot in the unique index, so the fee is never charged again — but the
     * row only carried `deleted_at`. There was no way to tell a deliberate waiver from an
     * accidental delete, nor who was responsible, which is how three 2026-2027 surcharges
     * were suppressed during a data cleanup with no trace.
     */
    public function up(): void
    {
        Schema::table('student_additional_fees', function (Blueprint $table) {
            $table->uuid('deleted_by')->nullable()->after('created_by');
            $table->string('waive_note')->nullable()->after('deleted_by');

            $table->foreign('deleted_by')->references('id')->on('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('student_additional_fees', function (Blueprint $table) {
            $table->dropForeign(['deleted_by']);
            $table->dropColumn(['deleted_by', 'waive_note']);
        });
    }
};
