<?php

namespace Tests\Feature;

use App\Models\ClassSection;
use App\Models\Institution;
use App\Models\PaymentPlan;
use App\Models\PaymentPlanInstallment;
use App\Models\SchoolFee;
use App\Models\SchoolFeeDefault;
use App\Models\Student;
use App\Models\StudentAdditionalFee;
use App\Models\StudentInstitution;
use App\Models\StudentPaymentPlan;
use App\Models\StudentSection;
use App\Models\User;
use App\Models\UserInstitution;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * A `running_total` plan surcharges exactly like `per_installment` — once per installment,
 * on its own amount, nothing compounding — but bills each period with the unpaid balance
 * behind it folded in, so the schedule states the arrears as one figure to settle.
 *
 * The scenario throughout is the one the schools described: 1,000 a month at 3%, due on the
 * 10th, June through September.
 *
 *   Jun 11  June's grace elapses     3% of 1,000  =  30   June owes 1,030
 *   Jul 11  July's grace elapses     3% of 1,000  =  30   July owes 1,030
 *   Aug 11  August's grace elapses   3% of 1,000  =  30   August owes 1,030
 *   Sep 10  September falls due      not yet incurred     September owes 1,000
 *
 * so on 5 September the schedule asks 1,030 through June, 2,060 through July, 3,090 through
 * August and 4,090 through September. Settle June and it drops out, leaving September at
 * 3,060 — the figure the schools quote.
 */
class RunningTotalSurchargeTest extends TestCase
{
    use RefreshDatabase;

    private const YEAR = '2026-2027';

    private User $user;
    private Institution $institution;
    private Student $student;
    private SchoolFee $tuitionFee;
    private PaymentPlan $plan;

    protected function setUp(): void
    {
        parent::setUp();

        // Past August's due date but before September's: three periods are overdue and the
        // fourth is owed but not yet surcharged.
        Carbon::setTestNow('2026-09-05 08:00:00');

        $this->institution = Institution::factory()->create();
        $this->user = User::factory()->create([
            'token' => 'test-token',
            'token_expiry' => now()->addYear()->toDateTimeString(),
        ]);
        UserInstitution::factory()->create([
            'user_id' => $this->user->id,
            'institution_id' => $this->institution->id,
            'is_default' => true,
            'is_main' => true,
        ]);

        $this->student = Student::create([
            'first_name' => 'Running',
            'last_name' => 'Total',
            'gender' => 'male',
            'birthdate' => '2012-01-01',
            'is_active' => true,
        ]);
        StudentInstitution::create([
            'student_id' => $this->student->id,
            'institution_id' => $this->institution->id,
            'is_active' => true,
            'academic_year' => self::YEAR,
        ]);

        $section = ClassSection::create([
            'institution_id' => $this->institution->id,
            'grade_level' => 'Grade 7',
            'title' => 'Bonifacio',
            'academic_year' => self::YEAR,
            'status' => 'active',
        ]);
        StudentSection::create([
            'student_id' => $this->student->id,
            'section_id' => $section->id,
            'academic_year' => self::YEAR,
            'is_active' => true,
        ]);

        $this->tuitionFee = SchoolFee::create([
            'institution_id' => $this->institution->id,
            'name' => 'Tuition Fee',
            'is_active' => true,
        ]);
        // 4,000 over four even installments: 1,000 a month.
        SchoolFeeDefault::create([
            'school_fee_id' => $this->tuitionFee->id,
            'institution_id' => $this->institution->id,
            'grade_level' => 'Grade 7',
            'academic_year' => self::YEAR,
            'amount' => 4000,
        ]);

        $this->plan = PaymentPlan::create([
            'institution_id' => $this->institution->id,
            'name' => 'Monthly',
            'surcharge_mode' => PaymentPlan::SURCHARGE_RUNNING_TOTAL,
            'is_active' => true,
            'sort_order' => 1,
        ]);
        foreach ([6 => 'June', 7 => 'July', 8 => 'August', 9 => 'September'] as $month => $label) {
            PaymentPlanInstallment::create([
                'payment_plan_id' => $this->plan->id,
                'sequence' => $month - 5,
                'label' => $label,
                'due_month' => $month,
                'due_day' => 10,
                'grace_period_days' => 0,
                'late_fee_percentage' => 3,
            ]);
        }

        StudentPaymentPlan::create([
            'institution_id' => $this->institution->id,
            'student_id' => $this->student->id,
            'academic_year' => self::YEAR,
            'payment_plan_id' => $this->plan->id,
            'selected_at' => now(),
        ]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function ledger(): array
    {
        return $this->withHeader('Authorization', 'Bearer test-token')
            ->getJson("/api/students/{$this->student->id}/ledger?academic_year=" . self::YEAR)
            ->assertOk()
            ->json('data');
    }

    private function noa(): array
    {
        return $this->withHeader('Authorization', 'Bearer test-token')
            ->getJson("/api/students/{$this->student->id}/noa?academic_year=" . self::YEAR)
            ->assertOk()
            ->json('data');
    }

    private function period(array $data, int $sequence): array
    {
        return collect($data['installments'])->firstWhere('sequence', $sequence);
    }

    /** The running figures the schedule bills, sequence 1 first. */
    private function runningTotals(array $data): array
    {
        return collect($data['installments'])
            ->sortBy('sequence')
            ->map(fn ($inst) => round((float) $inst['running_total_due'], 2))
            ->values()
            ->all();
    }

    private function surcharge(int $sequence): ?StudentAdditionalFee
    {
        return StudentAdditionalFee::lateFees()
            ->where('installment_sequence', $sequence)
            ->where('late_fee_stage', StudentAdditionalFee::LATE_FEE_STAGE_INSTALLMENT)
            ->first();
    }

    private function pay(float $amount, string $date, ?StudentAdditionalFee $fee = null): void
    {
        $payload = [
            'student_id' => $this->student->id,
            'academic_year' => self::YEAR,
            'payment_date' => $date,
            'items' => [
                $fee
                    ? ['additional_fee_id' => $fee->id, 'amount' => $amount]
                    : ['school_fee_id' => $this->tuitionFee->id, 'amount' => $amount],
            ],
        ];

        $this->withHeader('Authorization', 'Bearer test-token')
            ->postJson('/api/student-payments', $payload)
            ->assertCreated();
    }

    public function test_each_period_is_billed_with_the_unpaid_balance_behind_it(): void
    {
        $data = $this->ledger();

        $this->assertEquals([1030.0, 2060.0, 3090.0, 4090.0], $this->runningTotals($data));
    }

    public function test_the_periods_own_figures_are_still_reported_alongside_the_total(): void
    {
        $data = $this->ledger();

        // The split itself never sees a surcharge, so the period's own amount is untouched
        // by the roll-up and the payer can still read what the month itself costs.
        foreach ([1, 2, 3, 4] as $sequence) {
            $this->assertEquals(1000.0, $this->period($data, $sequence)['amount']);
        }

        $this->assertEquals(1030.0, $this->period($data, 1)['outstanding_amount']);
        // September is owed but not yet surcharged, so it contributes principal alone.
        $this->assertEquals(0.0, $this->period($data, 4)['late_fee_amount']);
        $this->assertEquals(1000.0, $this->period($data, 4)['outstanding_amount']);
    }

    public function test_nothing_compounds_and_no_period_is_surcharged_twice(): void
    {
        $data = $this->ledger();

        // One row per overdue period, each on its own 1,000 — never on an earlier surcharge.
        $this->assertSame(3, StudentAdditionalFee::lateFees()->count());
        $this->assertEquals(90.0, $data['totals']['late_fees']);
        foreach ([1, 2, 3] as $sequence) {
            $fee = $this->surcharge($sequence);
            $this->assertEquals(1000.0, (float) $fee->base_amount);
            $this->assertEquals(30.0, (float) $fee->amount);
        }
        $this->assertNull($this->surcharge(4));
        $this->assertSame(
            0,
            StudentAdditionalFee::lateFees()
                ->where('late_fee_stage', StudentAdditionalFee::LATE_FEE_STAGE_CARRY_OVER)
                ->count(),
            'A running total must never carry a balance forward to surcharge it again.'
        );
    }

    public function test_a_settled_period_drops_out_of_the_running_total(): void
    {
        // June is cleared in full — principal and the surcharge it already earned — while
        // July and August are left standing. This is the school's own example: September
        // asks 3,060 before its own due date has passed.
        Carbon::setTestNow('2026-06-15 08:00:00');
        $this->ledger();
        $this->pay(1000, '2026-06-15');
        $this->pay(30, '2026-06-15', $this->surcharge(1));

        Carbon::setTestNow('2026-09-05 08:00:00');
        $data = $this->ledger();

        $this->assertEquals([0.0, 1030.0, 2060.0, 3060.0], $this->runningTotals($data));
        $this->assertEquals(0.0, $this->period($data, 1)['outstanding_amount']);
        // Paying late is still surcharged: June's own 30 stands even though it is settled.
        $this->assertEquals(30.0, $this->period($data, 1)['late_fee_amount']);
    }

    public function test_a_part_paid_period_carries_only_what_it_still_owes(): void
    {
        $this->pay(400, '2026-06-20');

        $data = $this->ledger();

        // 600 of June's principal plus the full 30 it was surcharged before anything landed.
        $this->assertEquals(630.0, $this->period($data, 1)['outstanding_amount']);
        $this->assertEquals([630.0, 1660.0, 2690.0, 3690.0], $this->runningTotals($data));
    }

    public function test_the_notice_of_account_states_the_same_running_total(): void
    {
        $ledger = $this->ledger();
        $noa = $this->noa();

        $this->assertEquals($this->runningTotals($ledger), $this->runningTotals($noa));
        $this->assertEquals(4090.0, $this->period($noa, 4)['running_total_due']);
    }

    public function test_switching_the_mode_re_presents_the_year_without_re_pricing_it(): void
    {
        $before = $this->ledger();
        $booked = StudentAdditionalFee::lateFees()
            ->orderBy('installment_sequence')
            ->get()
            ->map(fn ($fee) => [$fee->id, (float) $fee->amount])
            ->all();

        $this->plan->update(['surcharge_mode' => PaymentPlan::SURCHARGE_PER_INSTALLMENT]);
        $after = $this->ledger();

        $this->assertEquals(
            $booked,
            StudentAdditionalFee::lateFees()
                ->orderBy('installment_sequence')
                ->get()
                ->map(fn ($fee) => [$fee->id, (float) $fee->amount])
                ->all(),
            'Only the presentation differs, so the surcharge rows must be untouched.'
        );
        $this->assertEquals($before['totals']['late_fees'], $after['totals']['late_fees']);

        // The running figure is reported on every plan; a per-installment plan simply does
        // not present it as the amount due.
        $this->assertEquals($this->runningTotals($before), $this->runningTotals($after));
        $this->assertSame('per_installment', $after['payment_plan']['surcharge_mode']);
    }

    public function test_the_mode_round_trips_through_the_payment_plan_endpoints(): void
    {
        $created = $this->withHeader('Authorization', 'Bearer test-token')
            ->postJson('/api/payment-plans', [
                'name' => 'Monthly (Running Total)',
                'surcharge_mode' => 'running_total',
                'installments' => [
                    ['due_month' => 6, 'due_day' => 10, 'late_fee_percentage' => 3],
                    ['due_month' => 7, 'due_day' => 10, 'late_fee_percentage' => 3],
                ],
            ])
            ->assertCreated()
            ->json('data');

        $this->assertSame('running_total', $created['surcharge_mode']);

        $updated = $this->withHeader('Authorization', 'Bearer test-token')
            ->putJson("/api/payment-plans/{$created['id']}", [
                'name' => 'Monthly (Running Total)',
                'surcharge_mode' => 'per_installment',
                'installments' => [
                    ['due_month' => 6, 'due_day' => 10, 'late_fee_percentage' => 3],
                ],
            ])
            ->assertOk()
            ->json('data');

        $this->assertSame('per_installment', $updated['surcharge_mode']);
    }
}
