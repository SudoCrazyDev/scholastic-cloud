<?php

namespace Tests\Feature;

use App\Models\Institution;
use App\Models\PayrollPeriod;
use App\Models\Payslip;
use App\Models\PayslipDay;
use App\Models\User;
use App\Services\PayrollService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * A class/work suspension the school declared unpaid is not a working day.
 *
 * The day earns nothing by policy — not because anybody was late or absent —
 * so it must drop out of both figures payroll calls "working days": the
 * `days_worked` count printed on the slip and the payroll sheet, and the
 * scheduled-days basis that percentage contributions are charged against.
 *
 * The punches are the part that is easy to get wrong. Staff often report
 * anyway on a suspended day (or the device is left running), and an unpaid day
 * with hours on it used to read back as a day worked while paying zero.
 */
class UnpaidSuspensionWorkingDaysTest extends TestCase
{
    use RefreshDatabase;

    /**
     * A ₱500/day payslip whose days are merged over a worked-in-full default.
     *
     * @param  array<int, array<string, mixed>>  $days
     */
    private function payslip(array $days, float $dailyRate = 500): Payslip
    {
        $institution = Institution::factory()->create();

        $period = PayrollPeriod::create([
            'institution_id' => $institution->id,
            'name' => 'August 2026',
            'date_from' => '2026-08-01',
            'date_to' => '2026-08-31',
            'status' => 'draft',
        ]);

        $payslip = Payslip::create([
            'institution_id' => $institution->id,
            'payroll_period_id' => $period->id,
            'user_id' => User::factory()->create()->id,
            'daily_rate' => $dailyRate,
            'hourly_rate' => $dailyRate / 8,
            'hours_per_day' => 8,
            'late_penalty_per_minute' => 2,
            'undertime_penalty_per_minute' => 2,
        ]);

        $date = 1;
        foreach ($days as $day) {
            $payslip->days()->create(array_merge([
                'work_date' => sprintf('2026-08-%02d', $date++),
                'required_hours' => 8,
                'hours_worked' => 8,
                'amount_earned' => $dailyRate,
                'pay_policy' => PayslipDay::PAY_NORMAL,
            ], $day));
        }

        app(PayrollService::class)->recomputeTotals($payslip);

        return $payslip->refresh();
    }

    public function test_an_unpaid_suspension_is_not_counted_as_a_day_worked(): void
    {
        $payslip = $this->payslip([
            [],
            ['pay_policy' => PayslipDay::PAY_NO_PAY, 'hours_worked' => 0, 'amount_earned' => 0],
            [],
        ]);

        $this->assertEquals(2, $payslip->days_worked);
    }

    public function test_punching_in_on_an_unpaid_suspension_still_does_not_make_it_a_working_day(): void
    {
        // The staff member came in and the device recorded a full eight hours,
        // but the school declared the day unpaid: it earns nothing, so it is
        // not one of the days the slip pays for.
        $payslip = $this->payslip([
            [],
            [
                'pay_policy' => PayslipDay::PAY_NO_PAY,
                'time_in' => '08:00:00',
                'time_out' => '17:00:00',
                'hours_worked' => 8,
                'amount_earned' => 0,
            ],
        ]);

        $this->assertEquals(1, $payslip->days_worked);
    }

    public function test_a_paid_suspension_is_still_a_day_worked_without_punches(): void
    {
        $payslip = $this->payslip([
            [],
            ['pay_policy' => PayslipDay::PAY_FULL_DAY, 'hours_worked' => 0, 'amount_earned' => 500],
        ]);

        $this->assertEquals(2, $payslip->days_worked);
    }

    public function test_an_unpaid_suspension_drops_out_of_the_basic_pay_basis(): void
    {
        // Three scheduled days, one of them suspended without pay: the salary
        // a percentage contribution is charged against is two days, not three.
        $payslip = $this->payslip([
            [],
            ['pay_policy' => PayslipDay::PAY_NO_PAY, 'hours_worked' => 0, 'amount_earned' => 0],
            [],
        ]);

        $this->assertEquals(1000.0, (float) $payslip->basic_pay);
    }

    public function test_an_absence_still_counts_toward_basic_pay(): void
    {
        // Unchanged behaviour, and the reason the exclusion is written against
        // the pay policy rather than the earnings: an absent day was still a
        // day of salary, so contributions are charged on it in full.
        $payslip = $this->payslip([
            [],
            ['hours_worked' => 0, 'amount_earned' => 0],
            [],
        ]);

        $this->assertEquals(1500.0, (float) $payslip->basic_pay);
        $this->assertEquals(2, $payslip->days_worked);
    }

    public function test_a_rest_day_marked_unpaid_changes_nothing(): void
    {
        // Rest days were already out of the basis; excluding them twice must
        // not double-count.
        $payslip = $this->payslip([
            [],
            [
                'is_rest_day' => true,
                'pay_policy' => PayslipDay::PAY_NO_PAY,
                'hours_worked' => 0,
                'amount_earned' => 0,
            ],
        ]);

        $this->assertEquals(500.0, (float) $payslip->basic_pay);
        $this->assertEquals(1, $payslip->days_worked);
    }
}
