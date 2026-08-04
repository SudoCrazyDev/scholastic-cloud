<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Records which payment plan a surcharge was assessed under.
     *
     * A surcharge row is identified by installment sequence and stage, which say nothing
     * about the schedule that produced them. When finance moved a student to a different
     * plan, the rows the old schedule had already booked kept occupying every slot the new
     * one needed: the new plan's surcharge was never charged, and the standing rows were
     * re-based onto the new plan's amounts while keeping the old plan's rate — a monthly
     * 3% row surviving as "3% of 3,750.00 · installment #2 overdue since 2026-10-15" on a
     * quarterly plan whose second term was not even due.
     *
     * With the plan recorded, LateFeeService can tell a row that belongs to the current
     * schedule from one the change left behind.
     */
    public function up(): void
    {
        Schema::table('student_additional_fees', function (Blueprint $table) {
            $table->uuid('payment_plan_id')->nullable()->after('source');

            // A deleted plan definition leaves the charges it produced standing — they are
            // money owed, and the sequence/stage still describes them.
            $table->foreign('payment_plan_id')->references('id')->on('payment_plans')->nullOnDelete();
        });

        // Existing surcharges belong to whatever plan the student is on now: that is the
        // schedule they were assessed against, since nothing until now could re-assess them
        // after a change. Stamping them keeps the next ledger load from reading every one of
        // them as superseded and charging the year over again.
        DB::statement(<<<'SQL'
            UPDATE student_additional_fees AS fees
            JOIN student_payment_plans AS selections
              ON selections.institution_id = fees.institution_id
             AND selections.student_id = fees.student_id
             AND selections.academic_year = fees.academic_year
            SET fees.payment_plan_id = selections.payment_plan_id
            WHERE fees.source = 'late_fee'
              AND fees.payment_plan_id IS NULL
              AND selections.payment_plan_id IS NOT NULL
        SQL);
    }

    public function down(): void
    {
        Schema::table('student_additional_fees', function (Blueprint $table) {
            $table->dropForeign(['payment_plan_id']);
            $table->dropColumn('payment_plan_id');
        });
    }
};
