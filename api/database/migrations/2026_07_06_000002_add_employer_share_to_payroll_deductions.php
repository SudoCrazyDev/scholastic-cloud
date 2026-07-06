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
        // A deduction type can also carry an employer counterpart
        // (e.g. the employer's share of SSS/Pag-IBIG/PhilHealth).
        Schema::table('payroll_deduction_types', function (Blueprint $table) {
            $table->boolean('has_employer_share')->default(false)->after('default_amount');
            $table->decimal('default_employer_amount', 10, 2)->default(0)->after('has_employer_share');
        });

        Schema::table('payroll_compensation_deductions', function (Blueprint $table) {
            $table->decimal('employer_amount', 10, 2)->default(0)->after('amount');
        });

        Schema::table('payslip_deductions', function (Blueprint $table) {
            $table->decimal('employer_amount', 10, 2)->default(0)->after('amount');
        });

        $this->convertFixedEmployerColumns();

        Schema::table('payroll_compensations', function (Blueprint $table) {
            $table->dropColumn(['sss_employer', 'pagibig_employer', 'philhealth_employer']);
        });

        Schema::table('payslips', function (Blueprint $table) {
            $table->dropColumn(['sss_employer', 'pagibig_employer', 'philhealth_employer']);
        });
    }

    /**
     * Move the fixed employer-share columns into the dynamic deduction rows.
     */
    private function convertFixedEmployerColumns(): void
    {
        $now = now();
        $map = [
            'sss_employer' => 'SSS',
            'pagibig_employer' => 'Pag-IBIG',
            'philhealth_employer' => 'PhilHealth',
        ];

        // institution_id -> name -> type id (created on demand)
        $typeIds = [];
        foreach (DB::table('payroll_deduction_types')->get() as $type) {
            $typeIds[$type->institution_id][$type->name] = $type->id;
        }

        $resolveType = function (string $institutionId, string $name) use (&$typeIds, $now): string {
            if (isset($typeIds[$institutionId][$name])) {
                return $typeIds[$institutionId][$name];
            }
            $id = (string) Str::orderedUuid();
            DB::table('payroll_deduction_types')->insert([
                'id' => $id,
                'institution_id' => $institutionId,
                'name' => $name,
                'default_amount' => 0,
                'has_employer_share' => true,
                'default_employer_amount' => 0,
                'is_active' => true,
                'sort_order' => 0,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
            $typeIds[$institutionId][$name] = $id;

            return $id;
        };

        foreach (DB::table('payroll_compensations')->get() as $compensation) {
            foreach ($map as $column => $name) {
                if ((float) $compensation->$column <= 0) {
                    continue;
                }
                $typeId = $resolveType($compensation->institution_id, $name);
                DB::table('payroll_deduction_types')->where('id', $typeId)->update(['has_employer_share' => true]);

                $existing = DB::table('payroll_compensation_deductions')
                    ->where('payroll_compensation_id', $compensation->id)
                    ->where('deduction_type_id', $typeId)
                    ->first();

                if ($existing) {
                    DB::table('payroll_compensation_deductions')
                        ->where('id', $existing->id)
                        ->update(['employer_amount' => $compensation->$column, 'updated_at' => $now]);
                } else {
                    DB::table('payroll_compensation_deductions')->insert([
                        'id' => (string) Str::orderedUuid(),
                        'payroll_compensation_id' => $compensation->id,
                        'deduction_type_id' => $typeId,
                        'amount' => 0,
                        'employer_amount' => $compensation->$column,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ]);
                }
            }
        }

        foreach (DB::table('payslips')->get() as $payslip) {
            foreach ($map as $column => $name) {
                if ((float) $payslip->$column <= 0) {
                    continue;
                }
                $typeId = $resolveType($payslip->institution_id, $name);
                DB::table('payroll_deduction_types')->where('id', $typeId)->update(['has_employer_share' => true]);

                $existing = DB::table('payslip_deductions')
                    ->where('payslip_id', $payslip->id)
                    ->where('deduction_type_id', $typeId)
                    ->first();

                if ($existing) {
                    DB::table('payslip_deductions')
                        ->where('id', $existing->id)
                        ->update(['employer_amount' => $payslip->$column, 'updated_at' => $now]);
                } else {
                    DB::table('payslip_deductions')->insert([
                        'id' => (string) Str::orderedUuid(),
                        'payslip_id' => $payslip->id,
                        'deduction_type_id' => $typeId,
                        'name' => $name,
                        'amount' => 0,
                        'employer_amount' => $payslip->$column,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ]);
                }
            }
        }
    }

    public function down(): void
    {
        Schema::table('payroll_compensations', function (Blueprint $table) {
            $table->decimal('sss_employer', 10, 2)->default(0);
            $table->decimal('pagibig_employer', 10, 2)->default(0);
            $table->decimal('philhealth_employer', 10, 2)->default(0);
        });

        Schema::table('payslips', function (Blueprint $table) {
            $table->decimal('sss_employer', 10, 2)->default(0);
            $table->decimal('pagibig_employer', 10, 2)->default(0);
            $table->decimal('philhealth_employer', 10, 2)->default(0);
        });

        Schema::table('payslip_deductions', function (Blueprint $table) {
            $table->dropColumn('employer_amount');
        });

        Schema::table('payroll_compensation_deductions', function (Blueprint $table) {
            $table->dropColumn('employer_amount');
        });

        Schema::table('payroll_deduction_types', function (Blueprint $table) {
            $table->dropColumn(['has_employer_share', 'default_employer_amount']);
        });
    }
};
