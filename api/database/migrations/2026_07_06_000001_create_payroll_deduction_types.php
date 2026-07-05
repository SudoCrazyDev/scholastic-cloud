<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

return new class extends Migration
{
    public function up(): void
    {
        // Institution-defined deduction catalog (SSS, Pag-IBIG, Cash Advance, ...).
        Schema::create('payroll_deduction_types', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('institution_id');
            $table->string('name');
            $table->decimal('default_amount', 10, 2)->default(0);
            $table->boolean('is_active')->default(true);
            $table->integer('sort_order')->default(0);
            $table->uuid('created_by')->nullable();
            $table->timestamps();

            $table->foreign('institution_id')->references('id')->on('institutions')->cascadeOnDelete();
            $table->foreign('created_by')->references('id')->on('users')->nullOnDelete();
            $table->unique(['institution_id', 'name'], 'payroll_deduction_types_institution_name_unique');
        });

        // Per-staff default amount for a deduction type, copied onto new payslips.
        Schema::create('payroll_compensation_deductions', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('payroll_compensation_id');
            $table->uuid('deduction_type_id');
            $table->decimal('amount', 10, 2)->default(0);
            $table->timestamps();

            $table->foreign('payroll_compensation_id')->references('id')->on('payroll_compensations')->cascadeOnDelete();
            $table->foreign('deduction_type_id')->references('id')->on('payroll_deduction_types')->cascadeOnDelete();
            $table->unique(['payroll_compensation_id', 'deduction_type_id'], 'pcd_compensation_type_unique');
        });

        // Deduction lines of a payslip. The name is a snapshot so deleting a
        // type later never rewrites payroll history.
        Schema::create('payslip_deductions', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('payslip_id');
            $table->uuid('deduction_type_id')->nullable();
            $table->string('name');
            $table->decimal('amount', 10, 2)->default(0);
            $table->timestamps();

            $table->foreign('payslip_id')->references('id')->on('payslips')->cascadeOnDelete();
            $table->foreign('deduction_type_id')->references('id')->on('payroll_deduction_types')->nullOnDelete();
            $table->index('payslip_id', 'payslip_deductions_payslip_idx');
        });

        $this->convertFixedColumns();

        Schema::table('payroll_compensations', function (Blueprint $table) {
            $table->dropColumn(['sss_employee', 'pagibig_employee', 'philhealth_employee']);
        });

        Schema::table('payslips', function (Blueprint $table) {
            $table->dropColumn([
                'sss_employee',
                'pagibig_employee',
                'philhealth_employee',
                'advance',
                'other_deductions',
                'other_deductions_note',
            ]);
        });
    }

    /**
     * Turn the old fixed deduction columns into catalog types + rows so
     * already-entered rates and generated payslips survive the upgrade.
     */
    private function convertFixedColumns(): void
    {
        $now = now();

        $institutionIds = DB::table('payroll_compensations')->distinct()->pluck('institution_id')
            ->merge(DB::table('payslips')->distinct()->pluck('institution_id'))
            ->unique()
            ->values();

        $typeIds = [];
        foreach ($institutionIds as $institutionId) {
            foreach (['SSS', 'Pag-IBIG', 'PhilHealth', 'Cash Advance'] as $index => $name) {
                $id = (string) Str::orderedUuid();
                DB::table('payroll_deduction_types')->insert([
                    'id' => $id,
                    'institution_id' => $institutionId,
                    'name' => $name,
                    'default_amount' => 0,
                    'is_active' => true,
                    'sort_order' => $index,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
                $typeIds[$institutionId][$name] = $id;
            }
        }

        $columnMap = [
            'sss_employee' => 'SSS',
            'pagibig_employee' => 'Pag-IBIG',
            'philhealth_employee' => 'PhilHealth',
        ];

        foreach (DB::table('payroll_compensations')->get() as $compensation) {
            foreach ($columnMap as $column => $name) {
                if ((float) $compensation->$column <= 0) {
                    continue;
                }
                DB::table('payroll_compensation_deductions')->insert([
                    'id' => (string) Str::orderedUuid(),
                    'payroll_compensation_id' => $compensation->id,
                    'deduction_type_id' => $typeIds[$compensation->institution_id][$name],
                    'amount' => $compensation->$column,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            }
        }

        $payslipMap = $columnMap + ['advance' => 'Cash Advance'];
        foreach (DB::table('payslips')->get() as $payslip) {
            foreach ($payslipMap as $column => $name) {
                if ((float) $payslip->$column <= 0) {
                    continue;
                }
                DB::table('payslip_deductions')->insert([
                    'id' => (string) Str::orderedUuid(),
                    'payslip_id' => $payslip->id,
                    'deduction_type_id' => $typeIds[$payslip->institution_id][$name],
                    'name' => $name,
                    'amount' => $payslip->$column,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            }
            if ((float) $payslip->other_deductions > 0) {
                DB::table('payslip_deductions')->insert([
                    'id' => (string) Str::orderedUuid(),
                    'payslip_id' => $payslip->id,
                    'deduction_type_id' => null,
                    'name' => $payslip->other_deductions_note ?: 'Others',
                    'amount' => $payslip->other_deductions,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            }
        }
    }

    public function down(): void
    {
        Schema::table('payroll_compensations', function (Blueprint $table) {
            $table->decimal('sss_employee', 10, 2)->default(0);
            $table->decimal('pagibig_employee', 10, 2)->default(0);
            $table->decimal('philhealth_employee', 10, 2)->default(0);
        });

        Schema::table('payslips', function (Blueprint $table) {
            $table->decimal('sss_employee', 10, 2)->default(0);
            $table->decimal('pagibig_employee', 10, 2)->default(0);
            $table->decimal('philhealth_employee', 10, 2)->default(0);
            $table->decimal('advance', 10, 2)->default(0);
            $table->decimal('other_deductions', 10, 2)->default(0);
            $table->string('other_deductions_note')->nullable();
        });

        Schema::dropIfExists('payslip_deductions');
        Schema::dropIfExists('payroll_compensation_deductions');
        Schema::dropIfExists('payroll_deduction_types');
    }
};
