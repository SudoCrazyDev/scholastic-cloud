<?php

namespace Tests\Unit;

use App\Models\PaymentPlan;
use App\Models\PaymentPlanInstallment;
use App\Models\StudentPaymentPlan;
use App\Services\PaymentPlanService;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * A reamortizing plan re-divides the balance every time a period opens.
 *
 * The worked example throughout is the one the schools state it with: 23,700 for the year
 * (7,000 tuition, 1,000 registration, 15,700 miscellaneous) on a ten-month plan running
 * July 2026 to April 2027, so 2,370 a month to begin with. The student pays 7,900 in July.
 * From August the plan asks for 15,800 ÷ 9; if nothing more is paid, December asks for
 * 15,800 ÷ 5.
 *
 * Nothing here touches the database — the schedule is a pure function of the plan's
 * templates, the year's net charges and the dates money arrived on.
 */
class ReamortizingPaymentPlanTest extends TestCase
{
    private const YEAR = '2026-2027';
    private const CHARGES = 23700.0;

    private PaymentPlanService $service;

    protected function setUp(): void
    {
        parent::setUp();
        $this->service = new PaymentPlanService();
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    /** July 2026 through April 2027, due on the 10th of each month. */
    private function plan(string $scheduleMode = PaymentPlan::SCHEDULE_REAMORTIZING): StudentPaymentPlan
    {
        $months = [7, 8, 9, 10, 11, 12, 1, 2, 3, 4];

        $templates = collect($months)->values()->map(fn ($month, $i) => new PaymentPlanInstallment([
            'sequence' => $i + 1,
            'due_month' => $month,
            'due_day' => 10,
            'grace_period_days' => 0,
            'late_fee_percentage' => 3,
        ]));

        $definition = new PaymentPlan([
            'name' => '10 Months',
            'schedule_mode' => $scheduleMode,
            'advance_payment_mode' => PaymentPlan::ADVANCE_EQUAL_SPLIT,
            'surcharge_mode' => PaymentPlan::SURCHARGE_PER_INSTALLMENT,
        ]);
        $definition->setRelation('installments', $templates);

        $selection = new StudentPaymentPlan(['academic_year' => self::YEAR]);
        $selection->setRelation('paymentPlan', $definition);

        return $selection;
    }

    /**
     * @param  array<int, array{0: string, 1: float}>  $payments  [date, amount]
     * @param  array<int, array{0: string, 1: float}>  $discounts  [date granted, amount]
     */
    private function build(
        array $payments,
        ?StudentPaymentPlan $plan = null,
        array $discounts = []
    ): array {
        $rows = array_map(
            fn ($payment) => ['payment_date' => $payment[0], 'amount' => $payment[1]],
            $payments
        );
        $adjustments = array_map(
            fn ($discount) => ['date' => $discount[0], 'charge' => 0.0, 'discount' => $discount[1]],
            $discounts
        );

        return $this->service->buildInstallments(
            $plan ?? $this->plan(),
            self::YEAR,
            self::CHARGES,
            array_sum(array_column($adjustments, 'discount')),
            array_sum(array_column($rows, 'amount')),
            $rows,
            $adjustments
        );
    }

    public function test_it_divides_evenly_before_anything_is_paid(): void
    {
        Carbon::setTestNow('2026-07-05 09:00:00');

        $installments = $this->build([]);

        $this->assertCount(10, $installments);
        foreach ($installments as $installment) {
            $this->assertEqualsWithDelta(2370.0, $installment['amount'], 0.01);
        }
    }

    public function test_a_payment_reprices_the_periods_after_it_but_not_its_own(): void
    {
        Carbon::setTestNow('2026-08-05 09:00:00');

        // 1,000 registration + 6,900 miscellaneous, collected mid-July.
        $installments = $this->build([['2026-07-20', 7900.0]]);

        // July was priced on 1 July, when nothing had been paid, and stays there. The money
        // that arrived inside it is shown against it — it is why August is lower.
        $this->assertEqualsWithDelta(2370.0, $installments[0]['amount'], 0.01);
        $this->assertEqualsWithDelta(7900.0, $installments[0]['paid_amount'], 0.01);
        $this->assertSame('paid', $installments[0]['status']);
        $this->assertFalse($installments[0]['rolled_forward']);

        // 15,800 over the nine months left.
        $this->assertEqualsWithDelta(1755.56, $installments[1]['amount'], 0.01);
        $this->assertEqualsWithDelta(0.0, $installments[1]['paid_amount'], 0.01);

        // Months that have not opened yet are level at the same figure: paying what is asked
        // keeps it there. Individual rows differ by a centavo where the division does not
        // land clean, and the last takes the residue.
        foreach (array_slice($installments, 1) as $installment) {
            $this->assertEqualsWithDelta(1755.56, $installment['amount'], 0.01);
        }

        $this->assertEqualsWithDelta(
            15800.0,
            array_sum(array_column(array_slice($installments, 1), 'amount')),
            0.01
        );
    }

    public function test_months_that_pass_unpaid_reprice_the_rest_of_the_schedule(): void
    {
        Carbon::setTestNow('2026-12-05 09:00:00');

        // Nothing collected since July: August through November all closed short.
        $installments = $this->build([['2026-07-20', 7900.0]]);

        // Each period was priced from the balance the day it opened — unchanged at 15,800
        // throughout, over a shrinking number of months.
        $this->assertEqualsWithDelta(2370.0, $installments[0]['amount'], 0.01);   // Jul — 23,700 ÷ 10
        $this->assertEqualsWithDelta(1755.56, $installments[1]['amount'], 0.01);  // Aug — 15,800 ÷ 9
        $this->assertEqualsWithDelta(1975.0, $installments[2]['amount'], 0.01);   // Sep — 15,800 ÷ 8
        $this->assertEqualsWithDelta(2257.14, $installments[3]['amount'], 0.01);  // Oct — 15,800 ÷ 7
        $this->assertEqualsWithDelta(2633.33, $installments[4]['amount'], 0.01);  // Nov — 15,800 ÷ 6
        $this->assertEqualsWithDelta(3160.0, $installments[5]['amount'], 0.01);   // Dec — 15,800 ÷ 5

        // January onward is level at December's figure.
        foreach (array_slice($installments, 5) as $installment) {
            $this->assertEqualsWithDelta(3160.0, $installment['amount'], 0.01);
        }

        // A period that closed short was re-divided into the ones after it, so it is history
        // rather than a bill and must not be collected twice.
        foreach ([1, 2, 3, 4] as $index) {
            $this->assertTrue($installments[$index]['rolled_forward'], "period {$index} should roll forward");
            $this->assertEqualsWithDelta(0.0, $installments[$index]['outstanding_amount'], 0.01);
        }
        $this->assertFalse($installments[5]['rolled_forward']);
    }

    public function test_what_the_schedule_still_asks_for_is_exactly_the_balance(): void
    {
        Carbon::setTestNow('2026-12-05 09:00:00');

        $installments = $this->service->withRunningTotals($this->build([['2026-07-20', 7900.0]]));

        $this->assertEqualsWithDelta(
            15800.0,
            array_sum(array_column($installments, 'outstanding_amount')),
            0.01
        );
        $this->assertEqualsWithDelta(15800.0, end($installments)['running_total_due'], 0.01);
    }

    public function test_paying_what_is_asked_holds_the_figure_level(): void
    {
        Carbon::setTestNow('2027-01-05 09:00:00');

        $installments = $this->build([
            ['2026-07-20', 7900.0],
            ['2026-12-08', 3160.0],
        ]);

        // December was billed 3,160 and settled; January asks for 3,160 again.
        $this->assertEqualsWithDelta(3160.0, $installments[5]['amount'], 0.01);
        $this->assertSame('paid', $installments[5]['status']);
        $this->assertEqualsWithDelta(3160.0, $installments[6]['amount'], 0.01);
    }

    public function test_the_last_period_holds_the_balance_rather_than_rolling_it_forward(): void
    {
        // Past the end of the schedule with everything unpaid: there is nothing after April
        // to absorb what it did not collect, so it keeps it.
        Carbon::setTestNow('2027-05-05 09:00:00');

        $installments = $this->service->withRunningTotals($this->build([]));
        $last = end($installments);

        $this->assertFalse($last['rolled_forward']);
        $this->assertEqualsWithDelta(23700.0, $last['amount'], 0.01);
        $this->assertEqualsWithDelta(23700.0, $last['outstanding_amount'], 0.01);
    }

    public function test_money_paid_before_the_schedule_opens_lowers_every_period(): void
    {
        Carbon::setTestNow('2026-07-05 09:00:00');

        $plan = $this->plan();
        $installments = $this->build([['2026-06-15', 5000.0]], $plan);

        // 18,700 over ten months, and none of it attributed as paying July — it lowered the
        // bill rather than settling it.
        $this->assertEqualsWithDelta(1870.0, $installments[0]['amount'], 0.01);
        $this->assertEqualsWithDelta(0.0, $installments[0]['paid_amount'], 0.01);

        // Reported separately so the schedule and the year's charges still reconcile.
        $downpayment = $this->service->resolveDownpayment(
            $plan,
            self::YEAR,
            self::CHARGES,
            0.0,
            [['payment_date' => '2026-06-15', 'amount' => 5000.0]]
        );
        $this->assertEqualsWithDelta(5000.0, $downpayment['amount'], 0.01);
        $this->assertSame('2026-07-01', $downpayment['boundary']);
    }

    public function test_a_discount_granted_mid_year_leaves_the_months_already_billed_alone(): void
    {
        Carbon::setTestNow('2027-01-15 09:00:00');

        // 3,700 scholarship awarded on 1 November, against the same 7,900 paid in July.
        $installments = $this->build(
            [['2026-07-20', 7900.0]],
            null,
            [['2026-11-01', 3700.0]]
        );

        // July through October were billed before the scholarship existed and keep their
        // figures — reprinting one of those notices must not produce a different number.
        $this->assertEqualsWithDelta(2370.0, $installments[0]['amount'], 0.01);   // Jul
        $this->assertEqualsWithDelta(1755.56, $installments[1]['amount'], 0.01);  // Aug
        $this->assertEqualsWithDelta(1975.0, $installments[2]['amount'], 0.01);   // Sep
        $this->assertEqualsWithDelta(2257.14, $installments[3]['amount'], 0.01);  // Oct
        foreach ([0, 1, 2, 3] as $index) {
            $this->assertEqualsWithDelta(0.0, $installments[$index]['discount_amount'], 0.01);
        }

        // November opened after it was granted, so it is the first to feel it: the balance is
        // now 20,000 - 7,900 = 12,100, over the six months left.
        $this->assertEqualsWithDelta(2016.67, $installments[4]['amount'], 0.01);
        $this->assertGreaterThan(0.0, $installments[4]['discount_amount']);

        // And what is still to be collected is the discounted balance, not the original.
        $this->assertEqualsWithDelta(
            12100.0,
            array_sum(array_column($this->service->withRunningTotals($installments), 'outstanding_amount')),
            0.01
        );
    }

    public function test_a_discount_granted_before_the_schedule_opens_lowers_every_month(): void
    {
        Carbon::setTestNow('2026-08-25 09:00:00');

        $installments = $this->build(
            [['2026-07-20', 7900.0]],
            null,
            [['2026-06-20', 3700.0]]
        );

        // 20,000 over ten months from the start, then 12,100 over the nine that remain.
        $this->assertEqualsWithDelta(2000.0, $installments[0]['amount'], 0.01);
        $this->assertEqualsWithDelta(1344.44, $installments[1]['amount'], 0.01);
        $this->assertEqualsWithDelta(
            12100.0,
            array_sum(array_column($this->service->withRunningTotals($installments), 'outstanding_amount')),
            0.01
        );
    }

    public function test_a_fixed_plan_is_untouched(): void
    {
        Carbon::setTestNow('2026-12-05 09:00:00');

        $installments = $this->build(
            [['2026-07-20', 7900.0]],
            $this->plan(PaymentPlan::SCHEDULE_FIXED)
        );

        // Still 2,370 a month throughout, with the payment settling the earliest periods.
        foreach ($installments as $installment) {
            $this->assertEqualsWithDelta(2370.0, $installment['amount'], 0.01);
            $this->assertArrayNotHasKey('rolled_forward', $installment);
        }
        // 7,900 fills the first three periods and part of the fourth.
        $this->assertSame('paid', $installments[2]['status']);
        $this->assertSame('partial', $installments[3]['status']);
        $this->assertEqualsWithDelta(790.0, $installments[3]['paid_amount'], 0.01);
    }
}
