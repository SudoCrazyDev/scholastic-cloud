<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

return new class extends Migration
{
    /**
     * Seed the legacy "Monthly" (10 installments, Aug–May) and "Quarterly"
     * (4 installments, Aug/Nov/Feb/May) plans for every institution, then point
     * existing student selections at them so no student loses their current plan.
     */
    public function up(): void
    {
        $now = Carbon::now();

        // due_day 31 is clamped to each month's last day by PaymentPlanService,
        // reproducing the legacy ->endOfMonth() behaviour. Null labels render as "F Y".
        $monthlyMonths = [8, 9, 10, 11, 12, 1, 2, 3, 4, 5];
        $quarterly = [
            ['month' => 8, 'label' => 'Quarter 1'],
            ['month' => 11, 'label' => 'Quarter 2'],
            ['month' => 2, 'label' => 'Quarter 3'],
            ['month' => 5, 'label' => 'Quarter 4'],
        ];

        $institutions = DB::table('institutions')->pluck('id');

        foreach ($institutions as $institutionId) {
            $planIds = [];

            foreach (['monthly', 'quarterly'] as $index => $type) {
                $name = $type === 'monthly' ? 'Monthly' : 'Quarterly';

                $existing = DB::table('payment_plans')
                    ->where('institution_id', $institutionId)
                    ->where('name', $name)
                    ->value('id');

                if ($existing) {
                    $planIds[$type] = $existing;

                    continue;
                }

                $planId = (string) Str::uuid();
                $planIds[$type] = $planId;

                DB::table('payment_plans')->insert([
                    'id' => $planId,
                    'institution_id' => $institutionId,
                    'name' => $name,
                    'description' => $type === 'monthly'
                        ? 'Pay net fees in 10 monthly installments from August to May.'
                        : 'Pay net fees in 4 quarterly installments aligned to grading periods.',
                    'is_active' => true,
                    'sort_order' => $index,
                    'created_by' => null,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);

                $rows = [];
                if ($type === 'monthly') {
                    foreach ($monthlyMonths as $i => $month) {
                        $rows[] = [
                            'id' => (string) Str::uuid(),
                            'payment_plan_id' => $planId,
                            'sequence' => $i + 1,
                            'label' => null,
                            'due_month' => $month,
                            'due_day' => 31,
                            'share_percentage' => null,
                            'created_at' => $now,
                            'updated_at' => $now,
                        ];
                    }
                } else {
                    foreach ($quarterly as $i => $q) {
                        $rows[] = [
                            'id' => (string) Str::uuid(),
                            'payment_plan_id' => $planId,
                            'sequence' => $i + 1,
                            'label' => $q['label'],
                            'due_month' => $q['month'],
                            'due_day' => 31,
                            'share_percentage' => null,
                            'created_at' => $now,
                            'updated_at' => $now,
                        ];
                    }
                }

                DB::table('payment_plan_installments')->insert($rows);
            }

            // Link existing student selections to the matching seeded plan.
            foreach (['monthly', 'quarterly'] as $type) {
                DB::table('student_payment_plans')
                    ->where('institution_id', $institutionId)
                    ->where('plan_type', $type)
                    ->whereNull('payment_plan_id')
                    ->update(['payment_plan_id' => $planIds[$type]]);
            }
        }

        // Seed an initial history entry for each existing selection so the audit
        // trail starts from what students already chose.
        $selections = DB::table('student_payment_plans')->whereNotNull('payment_plan_id')->get();
        foreach ($selections as $selection) {
            $exists = DB::table('student_payment_plan_changes')
                ->where('student_id', $selection->student_id)
                ->where('academic_year', $selection->academic_year)
                ->exists();
            if ($exists) {
                continue;
            }

            DB::table('student_payment_plan_changes')->insert([
                'id' => (string) Str::uuid(),
                'institution_id' => $selection->institution_id,
                'student_id' => $selection->student_id,
                'academic_year' => $selection->academic_year,
                'payment_plan_id' => $selection->payment_plan_id,
                'previous_payment_plan_id' => null,
                'changed_at' => $selection->selected_at ?? $selection->created_at ?? $now,
                'changed_by' => $selection->selected_by,
                'changed_by_student' => $selection->selected_by_student ?? false,
                'note' => 'Initial selection (migrated)',
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }

    public function down(): void
    {
        // Unlink first so the FK does not block plan deletion.
        DB::table('student_payment_plans')->update(['payment_plan_id' => null]);
        DB::table('student_payment_plan_changes')->where('note', 'Initial selection (migrated)')->delete();
        DB::table('payment_plans')->whereIn('name', ['Monthly', 'Quarterly'])->delete();
    }
};
