<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Room for more than one surcharge per installment.
     *
     * A `carry_over` plan assesses a period twice: once when the period opens, against the
     * balance rolled forward from the periods before it, and once when the period's own
     * grace window elapses, against its own unpaid principal. Both belong to the same
     * installment sequence, so the old "one late fee per installment" uniqueness has to
     * widen by the stage that produced the row.
     *
     * `assessed_on` is the date the surcharge was incurred, which for a carried row is the
     * first day of the period rather than any overdue date. The ledger and the notice of
     * account date the charge from it instead of inferring it from the schedule.
     */
    public function up(): void
    {
        Schema::table('student_additional_fees', function (Blueprint $table) {
            $table->string('late_fee_stage', 20)->nullable()->after('installment_sequence');
            $table->date('assessed_on')->nullable()->after('late_fee_stage');
        });

        // Every late fee booked before now was assessed on the installment's own amount.
        DB::table('student_additional_fees')
            ->where('source', 'late_fee')
            ->whereNull('late_fee_stage')
            ->update(['late_fee_stage' => 'installment']);

        // One surcharge per installment per stage. MySQL allows repeated NULLs in a
        // unique index, so hand-added fees stay unconstrained as before.
        //
        // Added before the old one goes, not after: `institution_id` leads both, and MySQL
        // uses whatever index it finds to back the foreign key on that column. Dropping the
        // only candidate first fails with errno 1553.
        Schema::table('student_additional_fees', function (Blueprint $table) {
            $table->unique(
                ['institution_id', 'student_id', 'academic_year', 'installment_sequence', 'late_fee_stage'],
                'saf_late_fee_stage_unique'
            );
        });

        Schema::table('student_additional_fees', function (Blueprint $table) {
            $table->dropUnique('saf_late_fee_installment_unique');
        });
    }

    public function down(): void
    {
        // Carried surcharges have no home under the narrower index — two rows on one
        // installment would collide — so they go with the column that created them.
        DB::table('student_additional_fees')
            ->where('source', 'late_fee')
            ->where('late_fee_stage', 'carry_over')
            ->delete();

        // Same ordering as up(), for the same foreign-key reason.
        Schema::table('student_additional_fees', function (Blueprint $table) {
            $table->unique(
                ['institution_id', 'student_id', 'academic_year', 'installment_sequence'],
                'saf_late_fee_installment_unique'
            );
        });

        Schema::table('student_additional_fees', function (Blueprint $table) {
            $table->dropUnique('saf_late_fee_stage_unique');
        });

        Schema::table('student_additional_fees', function (Blueprint $table) {
            $table->dropColumn(['late_fee_stage', 'assessed_on']);
        });
    }
};
