<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A third way for a deduction type to arrive at its figure: a table of salary
 * ranges.
 *
 * Neither a flat peso amount nor a single percentage describes how the
 * contribution tables actually work — SSS is a schedule of salary brackets,
 * each naming what the employee remits and what the employer matches, and the
 * two are not the same figure. So a bracket type owns many ranges, the salary
 * for the period picks exactly one of them, and that range says what each side
 * pays.
 *
 * Within a range the pair can be quoted either way: SSS publishes pesos per
 * bracket, PhilHealth publishes a percentage of the salary within a floor and
 * a ceiling. `amount_type` picks which of the two columns the range means.
 *
 * The salary a range is matched against is the type's existing `percent_basis`
 * — basic pay (before lates and absences) or salary earned — so a bracket type
 * makes the same choice a percentage one already does, for the same reason.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payroll_deduction_brackets', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('deduction_type_id');
            $table->decimal('min_salary', 10, 2)->default(0);
            // Null is the open-ended top range: "₱30,000 and above".
            $table->decimal('max_salary', 10, 2)->nullable();
            // 'fixed' reads the peso columns, 'percentage' the rate columns.
            $table->string('amount_type', 20)->default('fixed');
            $table->decimal('employee_amount', 10, 2)->default(0);
            $table->decimal('employee_rate_percent', 6, 3)->default(0);
            $table->decimal('employer_amount', 10, 2)->default(0);
            $table->decimal('employer_rate_percent', 6, 3)->default(0);
            $table->integer('sort_order')->default(0);
            $table->timestamps();

            $table->foreign('deduction_type_id')->references('id')->on('payroll_deduction_types')->cascadeOnDelete();
            $table->index(['deduction_type_id', 'min_salary'], 'payroll_deduction_brackets_type_min_idx');
        });

        // Which range a payslip line landed in, snapshotted like the rate and
        // the salary already are, so a reprint years later can still say why
        // the figure was what it was after the table has been revised.
        Schema::table('payslip_deductions', function (Blueprint $table) {
            $table->decimal('bracket_min', 10, 2)->nullable()->after('basis_amount');
            $table->decimal('bracket_max', 10, 2)->nullable()->after('bracket_min');
        });

        // A bracket type has no per-staff figure to hold — the table decides
        // from the salary — so the only thing a staff row can still say is
        // that this employee is off the deduction entirely.
        Schema::table('payroll_compensation_deductions', function (Blueprint $table) {
            $table->boolean('is_exempt')->default(false)->after('employer_rate_percent');
        });
    }

    public function down(): void
    {
        Schema::table('payroll_compensation_deductions', function (Blueprint $table) {
            $table->dropColumn('is_exempt');
        });

        Schema::table('payslip_deductions', function (Blueprint $table) {
            $table->dropColumn(['bracket_min', 'bracket_max']);
        });

        Schema::dropIfExists('payroll_deduction_brackets');
    }
};
