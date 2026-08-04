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
 * A `carry_over` plan rolls the unpaid balance forward and surcharges it again every
 * period, on top of the surcharge each period's own overdue principal earns. Earlier
 * surcharges are part of what gets carried, so the charge compounds.
 *
 * The scenario throughout is the one the schools described: 2,500 a month at 3%, due on
 * the 10th, nothing paid.
 *
 *   Jul 11  July's own grace elapses      3% of 2,500.00  =  75.00   July owes 2,575.00
 *   Aug  1  August opens, July unpaid     3% of 2,575.00  =  77.25   July owes 2,652.25
 *   Aug 10  August's own grace elapses    3% of 2,500.00  =  75.00   August owes 2,575.00
 *
 * so 5,152.25 is payable between the 1st and the 10th of August, and 5,227.25 after it.
 */
class CarryOverSurchargeTest extends TestCase
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

        // After August's due date: July has been carried once and August is overdue too.
        Carbon::setTestNow('2026-08-12 08:00:00');

        $this->institution = Institution::factory()->create();
        $this->user = User::factory()->create([
            'token' => 'test-token',
            // Well past the last date any of these tests travels to.
            'token_expiry' => now()->addYear()->toDateTimeString(),
        ]);
        UserInstitution::factory()->create([
            'user_id' => $this->user->id,
            'institution_id' => $this->institution->id,
            'is_default' => true,
            'is_main' => true,
        ]);

        $this->student = Student::create([
            'first_name' => 'Carry',
            'last_name' => 'Over',
            'gender' => 'female',
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
            'title' => 'Rizal',
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
        // 7,500 over three even installments: 2,500 a month.
        SchoolFeeDefault::create([
            'school_fee_id' => $this->tuitionFee->id,
            'institution_id' => $this->institution->id,
            'grade_level' => 'Grade 7',
            'academic_year' => self::YEAR,
            'amount' => 7500,
        ]);

        $this->plan = PaymentPlan::create([
            'institution_id' => $this->institution->id,
            'name' => 'Monthly',
            'surcharge_mode' => PaymentPlan::SURCHARGE_CARRY_OVER,
            'is_active' => true,
            'sort_order' => 1,
        ]);
        foreach ([7 => 'July', 8 => 'August', 9 => 'September'] as $month => $label) {
            PaymentPlanInstallment::create([
                'payment_plan_id' => $this->plan->id,
                'sequence' => $month - 6,
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

    /** What the student owes for the given periods: principal plus every surcharge on them. */
    private function payableThrough(array $data, int $sequence): float
    {
        return round(
            collect($data['installments'])
                ->filter(fn ($inst) => (int) $inst['sequence'] <= $sequence)
                ->sum(fn ($inst) => (float) $inst['amount'] + (float) $inst['late_fee_amount']),
            2
        );
    }

    private function surcharge(int $sequence, string $stage): ?StudentAdditionalFee
    {
        return StudentAdditionalFee::lateFees()
            ->where('installment_sequence', $sequence)
            ->where('late_fee_stage', $stage)
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

    private function setRate(int $sequence, float $percentage): void
    {
        PaymentPlanInstallment::where('payment_plan_id', $this->plan->id)
            ->where('sequence', $sequence)
            ->update(['late_fee_percentage' => $percentage]);
    }

    public function test_nothing_is_carried_into_the_first_period(): void
    {
        // Past July's due date but before August opens: only July's own surcharge exists,
        // because there is no earlier period for it to have carried anything from.
        Carbon::setTestNow('2026-07-15 08:00:00');

        $data = $this->ledger();

        $this->assertEquals(75.0, $data['totals']['late_fees']);
        $this->assertSame(1, StudentAdditionalFee::lateFees()->count());
        $this->assertNull($this->surcharge(1, StudentAdditionalFee::LATE_FEE_STAGE_CARRY_OVER));
        $this->assertEquals(2575.0, $this->payableThrough($data, 1));
    }

    public function test_the_unpaid_period_is_surcharged_again_when_the_next_one_opens(): void
    {
        // August has opened but its own due date has not passed.
        Carbon::setTestNow('2026-08-05 08:00:00');

        $data = $this->ledger();

        $carried = $this->surcharge(2, StudentAdditionalFee::LATE_FEE_STAGE_CARRY_OVER);
        $this->assertNotNull($carried, 'August should carry July forward.');
        // 2,500 of unpaid July principal plus the 75 July already earned.
        $this->assertEquals(2575.0, (float) $carried->base_amount);
        $this->assertEquals(77.25, (float) $carried->amount);
        $this->assertSame('2026-08-01', $carried->assessed_on->toDateString());

        $this->assertEquals(152.25, $data['totals']['late_fees']);
        $this->assertEquals(5152.25, $this->payableThrough($data, 2));

        // August's own principal is not surcharged until its due date passes.
        $this->assertNull($this->surcharge(2, StudentAdditionalFee::LATE_FEE_STAGE_INSTALLMENT));
    }

    public function test_the_period_is_also_surcharged_on_its_own_principal_once_it_falls_due(): void
    {
        $data = $this->ledger();

        $this->assertEquals(75.0, (float) $this->surcharge(1, 'installment')->amount);
        $this->assertEquals(77.25, (float) $this->surcharge(2, 'carry_over')->amount);
        $own = $this->surcharge(2, 'installment');
        $this->assertEquals(2500.0, (float) $own->base_amount);
        $this->assertEquals(75.0, (float) $own->amount);
        $this->assertSame('2026-08-10', $own->assessed_on->toDateString());

        $this->assertEquals(227.25, $data['totals']['late_fees']);
        $this->assertEquals(5227.25, $this->payableThrough($data, 2));

        // The schedule reports both of August's surcharges on the period that incurred them.
        $installments = collect($data['installments']);
        $july = $installments->firstWhere('sequence', 1);
        $august = $installments->firstWhere('sequence', 2);
        $this->assertEquals(2500.0, $august['amount'], 'The split still ignores surcharges.');
        $this->assertEquals(75.0, $july['late_fee_amount']);
        $this->assertEquals(152.25, $august['late_fee_amount']);
        $this->assertEqualsCanonicalizing(
            ['carry_over', 'installment'],
            collect($august['late_fee_charges'])->pluck('stage')->all()
        );
        $this->assertEquals(0.0, $installments->firstWhere('sequence', 3)['late_fee_amount']);
    }

    public function test_the_surcharge_compounds_while_the_account_stays_delinquent(): void
    {
        Carbon::setTestNow('2026-09-15 08:00:00');

        $data = $this->ledger();

        // September carries July and August, principal and surcharges alike:
        // 5,000 unpaid principal + 75 + 77.25 + 75 already charged = 5,227.25.
        $carried = $this->surcharge(3, 'carry_over');
        $this->assertEquals(5227.25, (float) $carried->base_amount);
        $this->assertEquals(156.82, (float) $carried->amount);

        $this->assertEquals(459.07, $data['totals']['late_fees']);
        $this->assertEquals(7959.07, $this->payableThrough($data, 3));
    }

    public function test_loading_month_by_month_lands_on_the_same_figures_as_one_late_load(): void
    {
        // Each load books only what had been incurred by then, so a school that opens the
        // ledger every month must not end up anywhere different from one that never did.
        Carbon::setTestNow('2026-07-15 08:00:00');
        $this->ledger();
        Carbon::setTestNow('2026-08-05 08:00:00');
        $this->ledger();
        Carbon::setTestNow('2026-08-12 08:00:00');
        $this->ledger();
        Carbon::setTestNow('2026-09-15 08:00:00');
        $incremental = $this->ledger();

        $this->assertEquals(459.07, $incremental['totals']['late_fees']);
        $this->assertEquals(7959.07, $this->payableThrough($incremental, 3));
        $this->assertSame(5, StudentAdditionalFee::lateFees()->count());
    }

    public function test_reloading_the_ledger_does_not_duplicate_a_surcharge(): void
    {
        $this->ledger();
        $this->ledger();
        $again = $this->ledger();

        $this->assertSame(3, StudentAdditionalFee::lateFees()->count());
        $this->assertEquals(227.25, $again['totals']['late_fees']);
    }

    public function test_settling_a_period_before_the_next_opens_leaves_nothing_to_carry(): void
    {
        // July's surcharge has to exist before it can be paid, so the ledger is opened
        // inside July first — exactly how a cashier would meet this account.
        Carbon::setTestNow('2026-07-15 08:00:00');
        $this->ledger();
        $julySurcharge = $this->surcharge(1, 'installment');

        $this->pay(2500, '2026-07-20');
        $this->pay(75, '2026-07-20', $julySurcharge);

        Carbon::setTestNow('2026-08-12 08:00:00');
        $data = $this->ledger();

        $this->assertNull(
            $this->surcharge(2, 'carry_over'),
            'July was settled before August opened, so August carried nothing.'
        );
        // August's own principal is still unpaid on the 10th, so that surcharge stands.
        $this->assertEquals(75.0, (float) $this->surcharge(2, 'installment')->amount);
        $this->assertEquals(150.0, $data['totals']['late_fees']);
    }

    public function test_a_partial_payment_shrinks_only_what_is_carried(): void
    {
        Carbon::setTestNow('2026-07-15 08:00:00');
        $this->ledger();
        $this->pay(1000, '2026-07-20');

        Carbon::setTestNow('2026-08-12 08:00:00');
        $data = $this->ledger();

        // 1,500 of July principal still unpaid on 1 August, plus its standing 75.
        $carried = $this->surcharge(2, 'carry_over');
        $this->assertEquals(1575.0, (float) $carried->base_amount);
        $this->assertEquals(47.25, (float) $carried->amount);

        // July was already late on the 11th; paying later does not undo that surcharge.
        $this->assertEquals(75.0, (float) $this->surcharge(1, 'installment')->amount);
        $this->assertEquals(197.25, $data['totals']['late_fees']);
    }

    public function test_a_backdated_payment_re_bases_what_was_carried(): void
    {
        // Booked first at the full amount, then finance keys in a receipt from July.
        $this->ledger();
        $this->assertEquals(77.25, (float) $this->surcharge(2, 'carry_over')->amount);

        $this->pay(1000, '2026-07-20');
        $data = $this->ledger();

        // The base is what was owed on 1 August, which that receipt has now changed.
        $carried = $this->surcharge(2, 'carry_over');
        $this->assertEquals(1575.0, (float) $carried->base_amount);
        $this->assertEquals(47.25, (float) $carried->amount);
        $this->assertEquals(197.25, $data['totals']['late_fees']);
    }

    public function test_a_waived_carried_surcharge_leaves_the_balance_it_would_have_compounded(): void
    {
        $this->ledger();
        $carried = $this->surcharge(2, 'carry_over');

        $this->withHeader('Authorization', 'Bearer test-token')
            ->deleteJson("/api/student-additional-fees/{$carried->id}", ['note' => 'Approved by finance head'])
            ->assertOk();

        Carbon::setTestNow('2026-09-15 08:00:00');
        $data = $this->ledger();

        // The waiver holds, and the forgiven 77.25 is no longer part of what September
        // carries: 5,000 principal + 75 + 75 = 5,150.
        $this->assertNull($this->surcharge(2, 'carry_over'));
        $this->assertEquals(5150.0, (float) $this->surcharge(3, 'carry_over')->base_amount);
        $this->assertEquals(154.5, (float) $this->surcharge(3, 'carry_over')->amount);
        $this->assertEquals(379.5, $data['totals']['late_fees']);
    }

    public function test_a_carried_surcharge_is_collectible_at_the_cashier(): void
    {
        $this->ledger();
        $carried = $this->surcharge(2, 'carry_over');

        $line = collect($this->ledger()['fee_breakdown'])->firstWhere('fee_id', $carried->id);
        $this->assertNotNull($line, 'The carried surcharge needs its own collectible line.');
        $this->assertSame('late_fee', $line['source']);
        $this->assertSame('carry_over', $line['late_fee_stage']);
        $this->assertEquals(77.25, $line['outstanding']);

        $this->pay(77.25, '2026-08-12', $carried);

        $data = $this->ledger();
        $settled = collect($data['fee_breakdown'])->firstWhere('fee_id', $carried->id);
        $this->assertEquals(77.25, $settled['paid']);
        $this->assertEquals(0.0, $settled['outstanding']);

        // Collecting a surcharge must not be mistaken for paying down the installments.
        $this->assertEquals(0.0, collect($data['installments'])->firstWhere('sequence', 1)['paid_amount']);
    }

    public function test_a_zero_rate_period_assesses_nothing_in_either_direction(): void
    {
        // A school that suspends the surcharge for one month sets that period to 0%.
        $this->setRate(2, 0);

        $data = $this->ledger();

        $this->assertNull($this->surcharge(2, 'carry_over'));
        $this->assertNull($this->surcharge(2, 'installment'));
        $this->assertEquals(75.0, $data['totals']['late_fees']);

        // September resumes, carrying both unpaid periods plus July's standing 75.
        Carbon::setTestNow('2026-09-15 08:00:00');
        $this->ledger();
        $this->assertEquals(5075.0, (float) $this->surcharge(3, 'carry_over')->base_amount);
    }

    public function test_the_carried_surcharge_shows_in_the_ledger_and_the_notice_of_account(): void
    {
        $ledger = $this->ledger();
        $noa = $this->noa();

        $entry = collect($ledger['entries'])->firstWhere('late_fee_stage', 'carry_over');
        $this->assertNotNull($entry, 'The carried surcharge belongs in the ledger.');
        $this->assertEquals(77.25, $entry['amount']);
        // Dated when the period opened, not when the row happened to be written.
        $this->assertSame('2026-08-01', $entry['date']);
        $this->assertStringContainsString('3% carried over', $entry['description']);
        $this->assertStringContainsString('Carried Surcharge', $entry['fee_name']);

        $this->assertEquals($ledger['totals']['balance'], $noa['totals']['balance']);
        $this->assertEquals(227.25, $noa['totals']['late_fees']);
        $this->assertSame(
            1,
            collect($noa['fees'])->where('late_fee_stage', 'carry_over')->count(),
            'The notice of account should itemize the carried surcharge.'
        );
    }

    public function test_the_notice_of_account_books_the_carried_surcharge_on_its_own(): void
    {
        $this->noa();

        $this->assertSame(3, StudentAdditionalFee::lateFees()->count());
        $this->assertEquals(227.25, $this->ledger()['totals']['late_fees']);
    }

    public function test_a_per_installment_plan_carries_nothing(): void
    {
        // The same schedule, the same dates, the default mode: one surcharge per period and
        // no compounding. This is what every existing plan does.
        $this->plan->update(['surcharge_mode' => PaymentPlan::SURCHARGE_PER_INSTALLMENT]);

        Carbon::setTestNow('2026-09-15 08:00:00');
        $data = $this->ledger();

        $this->assertSame(0, StudentAdditionalFee::lateFees()->whereNotNull('late_fee_stage')
            ->where('late_fee_stage', 'carry_over')->count());
        // 3% of each of the three overdue installments, and nothing more.
        $this->assertEquals(225.0, $data['totals']['late_fees']);
        $this->assertEquals(7725.0, $this->payableThrough($data, 3));
    }

    public function test_the_mode_round_trips_through_the_payment_plan_endpoints(): void
    {
        $created = $this->withHeader('Authorization', 'Bearer test-token')
            ->postJson('/api/payment-plans', [
                'name' => 'Monthly (Carry Over)',
                'surcharge_mode' => 'carry_over',
                'installments' => [
                    ['due_month' => 7, 'due_day' => 10, 'late_fee_percentage' => 3],
                    ['due_month' => 8, 'due_day' => 10, 'late_fee_percentage' => 3],
                ],
            ])
            ->assertCreated()
            ->json('data');

        $this->assertSame('carry_over', $created['surcharge_mode']);

        $updated = $this->withHeader('Authorization', 'Bearer test-token')
            ->putJson("/api/payment-plans/{$created['id']}", [
                'name' => 'Monthly (Carry Over)',
                'surcharge_mode' => 'per_installment',
                'installments' => [
                    ['due_month' => 7, 'due_day' => 10, 'late_fee_percentage' => 3],
                ],
            ])
            ->assertOk()
            ->json('data');

        $this->assertSame('per_installment', $updated['surcharge_mode']);

        $this->withHeader('Authorization', 'Bearer test-token')
            ->putJson("/api/payment-plans/{$created['id']}", [
                'name' => 'Monthly (Carry Over)',
                'surcharge_mode' => 'compounding',
                'installments' => [
                    ['due_month' => 7, 'due_day' => 10, 'late_fee_percentage' => 3],
                ],
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('surcharge_mode');
    }

    public function test_a_plan_defaults_to_the_per_installment_mode(): void
    {
        $plan = PaymentPlan::create([
            'institution_id' => $this->institution->id,
            'name' => 'Quarterly',
            'is_active' => true,
        ]);

        $this->assertSame(PaymentPlan::SURCHARGE_PER_INSTALLMENT, $plan->fresh()->surcharge_mode);
        $this->assertFalse($plan->fresh()->carriesOverSurcharge());
    }
}
