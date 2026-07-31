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
 * A pay slip is what the staff member takes home, so it has to say why the pay
 * is short. Late, undertime and absences never come off a deduction line — they
 * are taken out of the salary itself — so the slip adds them back into TOTAL
 * SALARY EARNED and itemizes them under DEDUCTIONS. That only stays honest if
 * the figures it charges are the ones the salary actually gave up, and if no day
 * is charged twice.
 */
class PayslipAttendanceChargesTest extends TestCase
{
    use RefreshDatabase;

    private Institution $institution;

    protected function setUp(): void
    {
        parent::setUp();

        $this->institution = Institution::factory()->create();
        $role = Role::factory()->create(['title' => 'Principal', 'slug' => 'principal']);

        $admin = User::factory()->create([
            'email' => 'principal@slip.test',
            'token' => 'slip-token',
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
        return $this->withHeader('Authorization', 'Bearer slip-token');
    }

    /**
     * A payslip on a ₱500 day at ₱2/minute for both late and undertime.
     *
     * @param  array<int, array<string, mixed>>  $days  day rows, merged over a worked-in-full default
     */
    private function payslip(array $days, float $dailyRate = 500): Payslip
    {
        $period = PayrollPeriod::create([
            'institution_id' => $this->institution->id,
            'name' => 'July 2026',
            'date_from' => '2026-07-01',
            'date_to' => '2026-07-31',
            'status' => 'draft',
        ]);

        $staff = User::factory()->create(['first_name' => 'Juan', 'last_name' => 'Dela Cruz']);

        $payslip = Payslip::create([
            'institution_id' => $this->institution->id,
            'payroll_period_id' => $period->id,
            'user_id' => $staff->id,
            'daily_rate' => $dailyRate,
            'hourly_rate' => $dailyRate / 8,
            'hours_per_day' => 8,
            'late_penalty_per_minute' => 2,
            'undertime_penalty_per_minute' => 2,
        ]);

        $date = 1;
        foreach ($days as $day) {
            $payslip->days()->create(array_merge([
                'work_date' => sprintf('2026-07-%02d', $date++),
                'required_hours' => 8,
                'hours_worked' => 8,
                'late_minutes' => 0,
                'undertime_minutes' => 0,
                'penalty_amount' => 0,
                'amount_earned' => $dailyRate,
                'pay_policy' => PayslipDay::PAY_NORMAL,
            ], $day));
        }

        $earned = (float) $payslip->days()->sum('amount_earned');
        $payslip->update([
            'gross_pay' => $earned,
            'late_minutes' => (int) $payslip->days()->sum('late_minutes'),
            'undertime_minutes' => (int) $payslip->days()->sum('undertime_minutes'),
            'penalty_total' => (float) $payslip->days()->sum('penalty_amount'),
            'total_deductions' => 0,
            'net_pay' => $earned,
        ]);

        return $payslip->refresh();
    }

    private function charges(Payslip $payslip): array
    {
        return $this->api()->getJson("/api/payslips/{$payslip->id}")
            ->assertOk()
            ->json('data.attendance_charges');
    }

    public function test_late_and_undertime_are_charged_separately(): void
    {
        // 30 minutes late and 15 short, both at ₱2/minute.
        $payslip = $this->payslip([
            ['late_minutes' => 30, 'penalty_amount' => 60, 'amount_earned' => 440],
            ['undertime_minutes' => 15, 'penalty_amount' => 30, 'amount_earned' => 470],
        ]);

        $charges = $this->charges($payslip);

        $this->assertSame(60.0, (float) $charges['late']);
        $this->assertSame(30.0, (float) $charges['undertime']);
    }

    public function test_a_penalty_clipped_at_the_daily_rate_is_shared_between_the_two_sides(): void
    {
        // 200 minutes late and 100 short prices at ₱600 on a ₱500 day, so
        // pricing clipped the day at 500. Two thirds of the charge was the late
        // arrival, one third the early out.
        $payslip = $this->payslip([
            ['late_minutes' => 200, 'undertime_minutes' => 100, 'penalty_amount' => 600, 'amount_earned' => 0],
        ]);

        $charges = $this->charges($payslip);

        $this->assertSame(333.33, (float) $charges['late']);
        $this->assertSame(166.67, (float) $charges['undertime']);

        // The day earned nothing, but it was already charged as a penalty —
        // charging it again as an absence would take the day twice.
        $this->assertSame(0, (int) $charges['absent_days']);
        $this->assertSame(0.0, (float) $charges['absences']);
    }

    public function test_a_day_that_earned_nothing_is_charged_as_an_absence(): void
    {
        $payslip = $this->payslip([
            ['hours_worked' => 0, 'amount_earned' => 0],
            // A single punch payroll cannot bracket a day with: no hours, no
            // penalty, nothing paid.
            ['hours_worked' => 0, 'amount_earned' => 0],
        ]);

        $charges = $this->charges($payslip);

        $this->assertSame(2, (int) $charges['absent_days']);
        $this->assertSame(1000.0, (float) $charges['absences']);
    }

    public function test_days_nobody_is_paid_for_working_are_not_absences(): void
    {
        $payslip = $this->payslip([
            ['is_rest_day' => true, 'hours_worked' => 0, 'amount_earned' => 0],
            ['is_holiday' => true, 'hours_worked' => 0, 'amount_earned' => 0],
            // Approved official business: no punches, paid in full anyway.
            ['pay_policy' => PayslipDay::PAY_FULL_DAY, 'hours_worked' => 0, 'amount_earned' => 500],
            // Generated before the day had the chance to record a punch.
            ['assumed_time_in' => true, 'assumed_time_out' => true, 'hours_worked' => 0, 'amount_earned' => 0],
        ]);

        $charges = $this->charges($payslip);

        $this->assertSame(0, (int) $charges['absent_days']);
        $this->assertSame(0.0, (float) $charges['absences']);
    }

    public function test_the_printed_slip_still_foots(): void
    {
        $payslip = $this->payslip([
            ['late_minutes' => 30, 'penalty_amount' => 60, 'amount_earned' => 440],
            ['undertime_minutes' => 15, 'penalty_amount' => 30, 'amount_earned' => 470],
            ['hours_worked' => 0, 'amount_earned' => 0],
        ]);
        $payslip->deductions()->create(['name' => 'S.S.S.', 'amount' => 250]);
        $payslip->update(['total_deductions' => 250, 'net_pay' => (float) $payslip->gross_pay - 250]);

        $slip = $this->api()->getJson("/api/payslips/{$payslip->id}")
            ->assertOk()
            ->json('data');

        $attendance = (float) $slip['attendance_charges']['late']
            + (float) $slip['attendance_charges']['undertime']
            + (float) $slip['attendance_charges']['absences'];

        // What the slip prints: the salary before the attendance charges, less
        // every deduction including them, is the net pay on the payslip.
        $salaryEarned = (float) $slip['gross_pay'] + $attendance;
        $totalDeductions = (float) $slip['total_deductions'] + $attendance;

        $this->assertSame(1500.0, $salaryEarned);
        $this->assertSame((float) $slip['net_pay'], $salaryEarned - $totalDeductions);
    }
}
