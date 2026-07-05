<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Per-staff compensation settings: rates plus default contribution
        // amounts (employee + employer shares) copied onto each payslip.
        Schema::create('payroll_compensations', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('institution_id');
            $table->uuid('user_id');
            $table->string('designation')->nullable();
            $table->decimal('daily_rate', 10, 2)->default(0);
            // Null hourly rate = derived (daily_rate / hours_per_day).
            $table->decimal('hourly_rate', 10, 2)->nullable();
            $table->decimal('hours_per_day', 4, 2)->default(8);
            $table->decimal('sss_employee', 10, 2)->default(0);
            $table->decimal('pagibig_employee', 10, 2)->default(0);
            $table->decimal('philhealth_employee', 10, 2)->default(0);
            $table->decimal('sss_employer', 10, 2)->default(0);
            $table->decimal('pagibig_employer', 10, 2)->default(0);
            $table->decimal('philhealth_employer', 10, 2)->default(0);
            $table->uuid('created_by')->nullable();
            $table->timestamps();

            $table->foreign('institution_id')->references('id')->on('institutions')->cascadeOnDelete();
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
            $table->foreign('created_by')->references('id')->on('users')->nullOnDelete();
            $table->unique(['institution_id', 'user_id'], 'payroll_compensations_institution_user_unique');
        });

        Schema::create('payroll_periods', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('institution_id');
            $table->string('name');
            $table->date('date_from');
            $table->date('date_to');
            $table->string('status')->default('draft'); // draft|finalized
            $table->date('paid_on')->nullable();
            $table->uuid('created_by')->nullable();
            $table->timestamps();

            $table->foreign('institution_id')->references('id')->on('institutions')->cascadeOnDelete();
            $table->foreign('created_by')->references('id')->on('users')->nullOnDelete();
            $table->unique(['institution_id', 'name'], 'payroll_periods_institution_name_unique');
            $table->index(['institution_id', 'date_from'], 'payroll_periods_institution_from_idx');
        });

        // One payslip per staff per period. Rates and contribution amounts are
        // snapshots taken at generation time so later compensation edits do not
        // silently change an existing payroll run.
        Schema::create('payslips', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('institution_id');
            $table->uuid('payroll_period_id');
            $table->uuid('user_id');
            $table->string('designation')->nullable();
            $table->decimal('daily_rate', 10, 2)->default(0);
            $table->decimal('hourly_rate', 10, 2)->default(0);
            $table->decimal('hours_per_day', 4, 2)->default(8);
            $table->decimal('days_worked', 5, 2)->default(0);
            $table->decimal('hours_worked', 7, 2)->default(0);
            $table->decimal('gross_pay', 12, 2)->default(0); // Total salary earned
            $table->decimal('sss_employee', 10, 2)->default(0);
            $table->decimal('pagibig_employee', 10, 2)->default(0);
            $table->decimal('philhealth_employee', 10, 2)->default(0);
            $table->decimal('advance', 10, 2)->default(0);
            $table->decimal('other_deductions', 10, 2)->default(0);
            $table->string('other_deductions_note')->nullable();
            $table->decimal('sss_employer', 10, 2)->default(0);
            $table->decimal('pagibig_employer', 10, 2)->default(0);
            $table->decimal('philhealth_employer', 10, 2)->default(0);
            $table->decimal('total_deductions', 12, 2)->default(0);
            $table->decimal('net_pay', 12, 2)->default(0);
            $table->timestamps();

            $table->foreign('institution_id')->references('id')->on('institutions')->cascadeOnDelete();
            $table->foreign('payroll_period_id')->references('id')->on('payroll_periods')->cascadeOnDelete();
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
            $table->unique(['payroll_period_id', 'user_id'], 'payslips_period_user_unique');
            $table->index(['institution_id', 'payroll_period_id'], 'payslips_institution_period_idx');
        });

        // Daily breakdown backing the printed working-time record.
        Schema::create('payslip_days', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('payslip_id');
            $table->date('work_date');
            $table->time('time_in')->nullable();
            $table->time('time_out')->nullable();
            // Lunch break snapshot from the staff schedule; excluded from hours.
            $table->time('lunch_start')->nullable();
            $table->time('lunch_end')->nullable();
            $table->decimal('required_hours', 5, 2)->default(8);
            $table->decimal('hours_worked', 5, 2)->default(0);
            $table->decimal('amount_earned', 10, 2)->default(0);
            $table->boolean('is_holiday')->default(false);
            $table->boolean('is_rest_day')->default(false);
            $table->timestamps();

            $table->foreign('payslip_id')->references('id')->on('payslips')->cascadeOnDelete();
            $table->unique(['payslip_id', 'work_date'], 'payslip_days_payslip_date_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payslip_days');
        Schema::dropIfExists('payslips');
        Schema::dropIfExists('payroll_periods');
        Schema::dropIfExists('payroll_compensations');
    }
};
