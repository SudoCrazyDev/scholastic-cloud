<?php

namespace Tests\Feature;

use App\Models\Institution;
use App\Models\PayrollPeriod;
use App\Models\Payslip;
use App\Models\PayslipDay;
use App\Models\Role;
use App\Models\User;
use App\Models\UserInstitution;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The printed payroll sheet is the copy that leaves the system: staff sign it
 * on collection, so the row a staff member signs has to foot. Late and
 * undertime are taken out of the salary itself rather than off a deduction
 * line, so the sheet adds them back into TOTAL SALARY EARNED and itemizes them
 * under DEDUCTIONS — which only stays honest if the figure it charges is the
 * one the salary actually gave up.
 */
class PayrollSheetTest extends TestCase
{
    use RefreshDatabase;

    private Institution $institution;

    protected function setUp(): void
    {
        parent::setUp();

        $this->institution = Institution::factory()->create();
        $role = Role::factory()->create(['title' => 'Principal', 'slug' => 'principal']);

        $admin = User::factory()->create([
            'email' => 'principal@sheet.test',
            'token' => 'sheet-token',
            'token_expiry' => now()->addDay()->toDateTimeString(),
        ]);
        UserInstitution::factory()->create([
            'user_id' => $admin->id,
            'institution_id' => $this->institution->id,
            'role_id' => $role->id,
            'is_default' => true,
            'is_main' => true,
        ]);
    }

    private function api()
    {
        return $this->withHeader('Authorization', 'Bearer sheet-token');
    }

    private function period(): PayrollPeriod
    {
        return PayrollPeriod::create([
            'institution_id' => $this->institution->id,
            'name' => 'July 2026',
            'date_from' => '2026-07-01',
            'date_to' => '2026-07-31',
            'status' => 'draft',
        ]);
    }

    /**
     * @param  array<int, float>  $penalties  one penalty per working day
     */
    private function payslip(PayrollPeriod $period, array $name, float $dailyRate, array $penalties = []): Payslip
    {
        $staff = User::factory()->create([
            'email' => mb_strtolower($name['last'].'.'.$name['first']).'@sheet.test',
            'first_name' => $name['first'],
            'middle_name' => $name['middle'] ?? null,
            'last_name' => $name['last'],
            'ext_name' => $name['ext'] ?? null,
        ]);

        $payslip = Payslip::create([
            'institution_id' => $this->institution->id,
            'payroll_period_id' => $period->id,
            'user_id' => $staff->id,
            'daily_rate' => $dailyRate,
            'hourly_rate' => $dailyRate / 8,
            'hours_per_day' => 8,
            'days_worked' => count($penalties),
            'assumed_days' => 0,
            'hours_worked' => count($penalties) * 8,
        ]);

        $day = 1;
        foreach ($penalties as $penalty) {
            $payslip->days()->create([
                'work_date' => sprintf('2026-07-%02d', $day++),
                'required_hours' => 8,
                'hours_worked' => 8,
                'penalty_amount' => $penalty,
                // What pricing pays for the day: the rate less the penalty, and
                // never below zero.
                'amount_earned' => max(0, $dailyRate - $penalty),
                'pay_policy' => PayslipDay::PAY_NORMAL,
            ]);
        }

        $earned = (float) $payslip->days()->sum('amount_earned');
        $payslip->update([
            'basic_pay' => count($penalties) * $dailyRate,
            'gross_pay' => $earned,
            'penalty_total' => array_sum($penalties),
            'total_deductions' => 0,
            'net_pay' => $earned,
        ]);

        return $payslip->refresh();
    }

    public function test_the_sheet_prints_staff_surname_first_and_sorts_by_it(): void
    {
        $period = $this->period();
        $this->payslip($period, ['first' => 'Juan', 'middle' => 'Perez', 'last' => 'Dela Cruz'], 500, [0.0]);
        $this->payslip($period, ['first' => 'Ana', 'middle' => 'M', 'last' => 'Bautista'], 500, [0.0]);

        $rows = $this->api()->getJson("/api/payroll-periods/{$period->id}/sheet")
            ->assertOk()
            ->json('data.rows');

        // Surname first, middle name down to an initial — whether it is stored
        // as one ("M") or spelled out ("Perez") — and sorted on the surname, not
        // the given name that used to lead the column. Casing is the sheet's:
        // the PDF prints the whole column uppercase.
        $this->assertSame(['Bautista, Ana M.', 'Dela Cruz, Juan P.'], array_column($rows, 'staff_name'));
        $this->assertSame([1, 2], array_column($rows, 'no'));
    }

    public function test_a_staff_member_with_an_extension_keeps_it_on_the_surname(): void
    {
        $period = $this->period();
        $this->payslip($period, ['first' => 'Jose', 'middle' => 'Rizal', 'last' => 'Santos', 'ext' => 'Jr.'], 500, [0.0]);

        $rows = $this->api()->getJson("/api/payroll-periods/{$period->id}/sheet")
            ->assertOk()
            ->json('data.rows');

        $this->assertSame('Santos Jr., Jose R.', $rows[0]['staff_name']);
    }

    public function test_the_penalty_the_sheet_charges_leaves_the_row_footing(): void
    {
        $period = $this->period();
        // Two days: one ordinary penalty, and one so large that pricing clipped
        // it at the daily rate — the day cannot cost more than it paid.
        $payslip = $this->payslip($period, ['first' => 'Caryl', 'middle' => 'E', 'last' => 'Awa'], 500, [368.0, 900.0]);

        $row = $this->api()->getJson("/api/payroll-periods/{$period->id}/sheet")
            ->assertOk()
            ->json('data.rows.0');

        // penalty_total kept the raw 1,268 — the sheet charges the 868 the
        // salary actually gave up.
        $this->assertSame(1268.0, (float) $payslip->penalty_total);
        $this->assertSame(868.0, (float) $row['penalty_charged']);

        // What the sheet prints: salary before penalties, less every deduction
        // including them, is still the net pay on the payslip.
        $salaryEarned = (float) $row['gross_pay'] + (float) $row['penalty_charged'];
        $totalDeduction = (float) $row['total_deductions'] + (float) $row['penalty_charged'];
        $this->assertSame(1000.0, $salaryEarned);
        $this->assertSame((float) $row['net_pay'], $salaryEarned - $totalDeduction);
    }
}
