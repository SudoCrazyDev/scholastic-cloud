<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Clear the all-zero rows in staff deduction defaults.
     *
     * The rates editor used to write a row for every active deduction type on
     * each save, zero included, so a staff member ended up carrying rows for
     * deductions nobody had given them an amount for. Payroll already skipped
     * those rows, so dropping them changes no existing payslip.
     *
     * They matter now because a missing row is what lets a deduction type's
     * default amount apply to a staff member. Left in place, these leftovers
     * would read as "exempt this person" and keep catalog defaults from ever
     * reaching the staff they were meant for.
     */
    public function up(): void
    {
        DB::table('payroll_compensation_deductions')
            ->where('amount', '<=', 0)
            ->where('employer_amount', '<=', 0)
            ->delete();
    }

    /**
     * Irreversible, and harmlessly so: the deleted rows carried no amount, and
     * the rates editor recreates one for any staff member it is asked to.
     */
    public function down(): void
    {
        //
    }
};
