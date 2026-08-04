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
 * Moving a student to a different payment plan re-assesses the year's surcharges under
 * the plan that now applies.
 *
 * A surcharge is a materialized row keyed by installment sequence and stage, and it used
 * to outlive the plan that produced it: the rows the old schedule had already booked
 * occupied every slot the new one needed, so the new plan's surcharge was never charged
 * and the old plan's rate kept showing. The rows are stamped with their plan now, and the
 * ones the change made obsolete are dropped so the new schedule can assess its own.
 *
 * Two plans throughout, both over 7,500 of tuition in AY 2026-2027:
 *
 *   Monthly    3% — July / August / September, due on the 10th, no grace
 *   Quarterly  5% — July / October, due on the 15th, no grace
 */
class PaymentPlanChangeSurchargeTest extends TestCase
{
    use RefreshDatabase;

    private const YEAR = '2026-2027';

    private User $user;
    private Institution $institution;
    private Student $student;
    private SchoolFee $tuitionFee;
    private PaymentPlan $monthly;
    private PaymentPlan $quarterly;

    protected function setUp(): void
    {
        parent::setUp();

        // Past August's due date: under Monthly, July and August are both overdue.
        Carbon::setTestNow('2026-08-12 08:00:00');

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
            'first_name' => 'Plan',
            'last_name' => 'Switcher',
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
        SchoolFeeDefault::create([
            'school_fee_id' => $this->tuitionFee->id,
            'institution_id' => $this->institution->id,
            'grade_level' => 'Grade 7',
            'academic_year' => self::YEAR,
            'amount' => 7500,
        ]);

        // 2,500 a month at 3%.
        $this->monthly = PaymentPlan::create([
            'institution_id' => $this->institution->id,
            'name' => 'Monthly',
            'is_active' => true,
            'sort_order' => 1,
        ]);
        foreach ([7 => 'July', 8 => 'August', 9 => 'September'] as $month => $label) {
            PaymentPlanInstallment::create([
                'payment_plan_id' => $this->monthly->id,
                'sequence' => $month - 6,
                'label' => $label,
                'due_month' => $month,
                'due_day' => 10,
                'grace_period_days' => 0,
                'late_fee_percentage' => 3,
            ]);
        }

        // 3,750 a term at 5%, and only the first term has fallen due by 12 August.
        $this->quarterly = PaymentPlan::create([
            'institution_id' => $this->institution->id,
            'name' => 'Quarterly',
            'is_active' => true,
            'sort_order' => 2,
        ]);
        foreach ([[1, 'First Term', 7], [2, 'Second Term', 10]] as [$sequence, $label, $month]) {
            PaymentPlanInstallment::create([
                'payment_plan_id' => $this->quarterly->id,
                'sequence' => $sequence,
                'label' => $label,
                'due_month' => $month,
                'due_day' => 15,
                'grace_period_days' => 0,
                'late_fee_percentage' => 5,
            ]);
        }

        StudentPaymentPlan::create([
            'institution_id' => $this->institution->id,
            'student_id' => $this->student->id,
            'academic_year' => self::YEAR,
            'payment_plan_id' => $this->monthly->id,
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

    /** Move the student to another plan the way the finance office does. */
    private function switchTo(PaymentPlan $plan): void
    {
        $this->withHeader('Authorization', 'Bearer test-token')
            ->postJson("/api/students/{$this->student->id}/payment-plan", [
                'academic_year' => self::YEAR,
                'payment_plan_id' => $plan->id,
                'note' => 'Parent requested a term-based schedule',
            ])
            ->assertOk();
    }

    private function surcharge(int $sequence, string $stage = 'installment'): ?StudentAdditionalFee
    {
        return StudentAdditionalFee::lateFees()
            ->where('installment_sequence', $sequence)
            ->where('late_fee_stage', $stage)
            ->first();
    }

    private function pay(float $amount, string $date, ?StudentAdditionalFee $fee = null): void
    {
        $this->withHeader('Authorization', 'Bearer test-token')
            ->postJson('/api/student-payments', [
                'student_id' => $this->student->id,
                'academic_year' => self::YEAR,
                'payment_date' => $date,
                'items' => [
                    $fee
                        ? ['additional_fee_id' => $fee->id, 'amount' => $amount]
                        : ['school_fee_id' => $this->tuitionFee->id, 'amount' => $amount],
                ],
            ])
            ->assertCreated();
    }

    public function test_the_new_plan_assesses_its_own_surcharge_after_a_change(): void
    {
        // Two monthly surcharges stand: 3% of 2,500 for July and for August.
        $before = $this->ledger();
        $this->assertEquals(150.0, $before['totals']['late_fees']);

        $this->switchTo($this->quarterly);
        $after = $this->ledger();

        // Only the first term has fallen due, and it is surcharged at the quarterly
        // plan's own rate on its own amount: 5% of 3,750.
        $this->assertEquals(187.5, $after['totals']['late_fees']);

        $firstTerm = $this->surcharge(1);
        $this->assertNotNull($firstTerm, 'The new plan should have charged its first term.');
        $this->assertEquals(5.0, (float) $firstTerm->late_fee_percentage);
        $this->assertEquals(3750.0, (float) $firstTerm->base_amount);
        $this->assertEquals(187.5, (float) $firstTerm->amount);
        $this->assertSame('2026-07-15', $firstTerm->assessed_on->toDateString());

        // The second term is not due until October, so it earns nothing yet.
        $this->assertNull($this->surcharge(2));
        $this->assertSame(1, StudentAdditionalFee::lateFees()->count());
    }

    public function test_the_schedule_reports_the_new_plan_surcharge_on_its_installments(): void
    {
        $this->ledger();
        $this->switchTo($this->quarterly);

        $installments = collect($this->ledger()['installments']);

        $this->assertCount(2, $installments, 'The schedule follows the new plan.');
        $firstTerm = $installments->firstWhere('sequence', 1);
        $this->assertEquals(3750.0, $firstTerm['amount']);
        $this->assertEquals(187.5, $firstTerm['late_fee_amount']);
        $this->assertEquals(5.0, $firstTerm['late_fee_percentage']);
        $this->assertTrue($firstTerm['late_fee_applied']);
        $this->assertEquals(0.0, $installments->firstWhere('sequence', 2)['late_fee_amount']);
    }

    public function test_a_surcharge_already_collected_survives_the_change(): void
    {
        $this->ledger();
        $july = $this->surcharge(1);
        $this->pay(75, '2026-08-11', $july);

        $this->switchTo($this->quarterly);
        $data = $this->ledger();

        // Money was received against July's surcharge, so that charge stands as it was
        // collected — the new plan cannot reprice what has already been settled.
        $this->assertNotNull($july->fresh(), 'A collected surcharge must not be discarded.');
        $this->assertEquals(75.0, (float) $july->fresh()->amount);
        $this->assertEquals(3.0, (float) $july->fresh()->late_fee_percentage);

        // August's was uncollected, so it goes; the first term is not charged again on
        // top of the row that already occupies its slot.
        $this->assertNull(
            StudentAdditionalFee::lateFees()->where('installment_sequence', 2)->first(),
            'The uncollected surcharge belonged to the old schedule.'
        );
        $this->assertEquals(75.0, $data['totals']['late_fees']);
    }

    public function test_switching_back_re_assesses_under_the_original_plan(): void
    {
        $this->ledger();
        $this->switchTo($this->quarterly);
        $this->ledger();

        $this->switchTo($this->monthly);
        $data = $this->ledger();

        // July and August overdue again, at the monthly rate on the monthly amounts.
        $this->assertEquals(150.0, $data['totals']['late_fees']);
        $this->assertEquals(75.0, (float) $this->surcharge(1)->amount);
        $this->assertEquals(75.0, (float) $this->surcharge(2)->amount);
        $this->assertSame(2, StudentAdditionalFee::lateFees()->count());
    }

    public function test_a_carry_over_plan_starts_compounding_from_the_change(): void
    {
        $this->ledger();

        // The same monthly schedule, now carrying the balance forward.
        $carrying = PaymentPlan::create([
            'institution_id' => $this->institution->id,
            'name' => 'Monthly (Carry Over)',
            'surcharge_mode' => PaymentPlan::SURCHARGE_CARRY_OVER,
            'is_active' => true,
            'sort_order' => 3,
        ]);
        foreach ([7 => 'July', 8 => 'August', 9 => 'September'] as $month => $label) {
            PaymentPlanInstallment::create([
                'payment_plan_id' => $carrying->id,
                'sequence' => $month - 6,
                'label' => $label,
                'due_month' => $month,
                'due_day' => 10,
                'grace_period_days' => 0,
                'late_fee_percentage' => 3,
            ]);
        }

        $this->switchTo($carrying);
        $data = $this->ledger();

        // Reassessed from scratch under the new mode: 75 for July, 77.25 carried into
        // August, 75 for August's own principal.
        $this->assertEquals(77.25, (float) $this->surcharge(2, 'carry_over')->amount);
        $this->assertEquals(227.25, $data['totals']['late_fees']);
    }

    public function test_a_waived_surcharge_is_not_carried_over_to_the_new_plan(): void
    {
        $this->ledger();
        $august = $this->surcharge(2);

        $this->withHeader('Authorization', 'Bearer test-token')
            ->deleteJson("/api/student-additional-fees/{$august->id}", ['note' => 'Approved by finance head'])
            ->assertOk();

        $this->switchTo($this->quarterly);
        $data = $this->ledger();

        // The waiver forgave a charge on a schedule the student is no longer on. It does
        // not suppress the new plan's own surcharge, which nobody has waived.
        $this->assertEquals(187.5, $data['totals']['late_fees']);
        $this->assertEquals(187.5, (float) $this->surcharge(1)->amount);
    }

    public function test_re_saving_the_same_plan_leaves_the_surcharges_alone(): void
    {
        $this->ledger();
        $july = $this->surcharge(1);

        $this->switchTo($this->monthly);
        $data = $this->ledger();

        $this->assertSame($july->id, $this->surcharge(1)->id, 'Nothing changed, so nothing is re-charged.');
        $this->assertEquals(150.0, $data['totals']['late_fees']);
        $this->assertSame(2, StudentAdditionalFee::lateFees()->count());
    }
}
