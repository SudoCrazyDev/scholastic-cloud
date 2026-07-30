<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Let a deduction type be a percentage of salary instead of a fixed peso
 * figure — SSS is "5% of the basic salary", not "₱540".
 *
 * The percentage needs something to be taken from, and the existing gross is
 * already net of lates, undertime and absences: charging SSS on it would make
 * a contribution shrink because somebody arrived late. So payslips also
 * record `basic_pay` — the salary for the period with nothing taken off —
 * and a type says which of the two it is a percentage of.
 *
 * Every existing type keeps its behaviour: `calculation_type` defaults to
 * 'fixed', which reads exactly the columns it already did.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payroll_deduction_types', function (Blueprint $table) {
            $table->string('calculation_type', 20)->default('fixed')->after('name');
            // Percent, not a fraction: 5.000 is 5%. Three decimals covers the
            // fractional rates the contribution tables actually use.
            $table->decimal('rate_percent', 6, 3)->default(0)->after('default_amount');
            $table->decimal('employer_rate_percent', 6, 3)->default(0)->after('default_employer_amount');
            $table->string('percent_basis', 20)->default('basic_pay')->after('employer_rate_percent');
        });

        // Per-staff override / exemption, mirroring the fixed amounts.
        Schema::table('payroll_compensation_deductions', function (Blueprint $table) {
            $table->decimal('rate_percent', 6, 3)->default(0)->after('amount');
            $table->decimal('employer_rate_percent', 6, 3)->default(0)->after('employer_amount');
        });

        // Snapshotted per line so a payslip can be reprinted years later and
        // still say what the percentage was and what it was taken from.
        Schema::table('payslip_deductions', function (Blueprint $table) {
            $table->string('calculation_type', 20)->default('fixed')->after('name');
            $table->decimal('rate_percent', 6, 3)->default(0)->after('amount');
            $table->decimal('employer_rate_percent', 6, 3)->default(0)->after('employer_amount');
            $table->string('percent_basis', 20)->nullable()->after('employer_rate_percent');
            $table->decimal('basis_amount', 10, 2)->default(0)->after('percent_basis');
        });

        Schema::table('payslips', function (Blueprint $table) {
            // Daily rate × scheduled working days: the salary before any late,
            // undertime or absence is taken off.
            $table->decimal('basic_pay', 10, 2)->default(0)->after('overtime_total');
        });
    }

    public function down(): void
    {
        Schema::table('payroll_deduction_types', function (Blueprint $table) {
            $table->dropColumn(['calculation_type', 'rate_percent', 'employer_rate_percent', 'percent_basis']);
        });

        Schema::table('payroll_compensation_deductions', function (Blueprint $table) {
            $table->dropColumn(['rate_percent', 'employer_rate_percent']);
        });

        Schema::table('payslip_deductions', function (Blueprint $table) {
            $table->dropColumn(['calculation_type', 'rate_percent', 'employer_rate_percent', 'percent_basis', 'basis_amount']);
        });

        Schema::table('payslips', function (Blueprint $table) {
            $table->dropColumn('basic_pay');
        });
    }
};
