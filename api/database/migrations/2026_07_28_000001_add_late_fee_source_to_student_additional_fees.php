<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Overdue payment-plan installments used to surface a late fee computed live on
     * every ledger load, which meant the charge vanished the moment the installment
     * was settled. Late fees are now materialized as real student_additional_fees
     * rows so they stick and can be collected; these columns carry the provenance.
     */
    public function up(): void
    {
        Schema::table('student_additional_fees', function (Blueprint $table) {
            $table->string('source', 20)->default('manual')->after('description');
            $table->unsignedSmallInteger('installment_sequence')->nullable()->after('source');
            $table->decimal('late_fee_percentage', 5, 2)->nullable()->after('installment_sequence');
            $table->decimal('base_amount', 12, 2)->nullable()->after('late_fee_percentage');

            // One late fee per installment per student per year. MySQL allows repeated
            // NULLs in a unique index, so manually added fees are unconstrained.
            $table->unique(
                ['institution_id', 'student_id', 'academic_year', 'installment_sequence'],
                'saf_late_fee_installment_unique'
            );
        });
    }

    public function down(): void
    {
        Schema::table('student_additional_fees', function (Blueprint $table) {
            $table->dropUnique('saf_late_fee_installment_unique');
            $table->dropColumn(['source', 'installment_sequence', 'late_fee_percentage', 'base_amount']);
        });
    }
};
