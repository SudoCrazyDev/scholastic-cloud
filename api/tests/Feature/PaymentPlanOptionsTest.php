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
use App\Models\StudentAuth;
use App\Models\StudentInstitution;
use App\Models\StudentPayment;
use App\Models\StudentPaymentPlan;
use App\Models\StudentSection;
use App\Models\User;
use App\Models\UserInstitution;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * A family can see what every plan would cost them before committing to one.
 *
 * 23,700 for AY 2026-2027 against three plans — ten months, three terms, and a recalculated
 * ten months — with 7,900 already collected in July. The comparison is priced on the student's
 * own account, so it answers "what would I be billed from here", not "what does this plan look
 * like in general".
 *
 * The plans all carry a late fee percentage on purpose: comparing them must not book one.
 */
class PaymentPlanOptionsTest extends TestCase
{
    use RefreshDatabase;

    private const YEAR = '2026-2027';

    private Institution $institution;
    private Student $student;
    private SchoolFee $tuition;
    private PaymentPlan $monthly;
    private PaymentPlan $terms;
    private PaymentPlan $recalculated;

    protected function setUp(): void
    {
        parent::setUp();

        // August is open, July has closed: enough history for the comparison to matter.
        Carbon::setTestNow('2026-08-20 08:00:00');

        $this->institution = Institution::factory()->create();
        $user = User::factory()->create([
            'token' => 'test-token',
            'token_expiry' => now()->addYear()->toDateTimeString(),
        ]);
        UserInstitution::factory()->create([
            'user_id' => $user->id,
            'institution_id' => $this->institution->id,
            'is_default' => true,
            'is_main' => true,
        ]);

        $this->student = Student::create([
            'first_name' => 'Whatif',
            'last_name' => 'Payer',
            'gender' => 'female',
            'birthdate' => '2010-01-01',
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
            'grade_level' => 'Grade 10',
            'title' => 'Beta',
            'academic_year' => self::YEAR,
            'status' => 'active',
        ]);
        StudentSection::create([
            'student_id' => $this->student->id,
            'section_id' => $section->id,
            'academic_year' => self::YEAR,
            'is_active' => true,
        ]);

        $this->tuition = SchoolFee::create([
            'institution_id' => $this->institution->id,
            'name' => 'Tuition Fee',
            'is_active' => true,
        ]);
        SchoolFeeDefault::create([
            'school_fee_id' => $this->tuition->id,
            'institution_id' => $this->institution->id,
            'grade_level' => 'Grade 10',
            'academic_year' => self::YEAR,
            'amount' => 23700,
        ]);

        $this->monthly = $this->plan('Monthly', [7, 8, 9, 10, 11, 12, 1, 2, 3, 4], 1);
        $this->terms = $this->plan('Three Terms', [7, 11, 3], 2);
        $this->recalculated = $this->plan(
            '10 Months (Recalculated)',
            [7, 8, 9, 10, 11, 12, 1, 2, 3, 4],
            3,
            PaymentPlan::SCHEDULE_REAMORTIZING
        );

        StudentPaymentPlan::create([
            'institution_id' => $this->institution->id,
            'student_id' => $this->student->id,
            'academic_year' => self::YEAR,
            'payment_plan_id' => $this->monthly->id,
            'selected_at' => '2026-06-01 08:00:00',
        ]);

        StudentPayment::create([
            'institution_id' => $this->institution->id,
            'student_id' => $this->student->id,
            'school_fee_id' => $this->tuition->id,
            'academic_year' => self::YEAR,
            'amount' => 7900,
            'payment_date' => '2026-07-20',
            'payment_method' => 'cash',
            'receipt_number' => 'OPT-1',
            'received_by' => $user->id,
        ]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    /** @param  array<int, int>  $months */
    private function plan(
        string $name,
        array $months,
        int $sort,
        string $scheduleMode = PaymentPlan::SCHEDULE_FIXED
    ): PaymentPlan {
        $plan = PaymentPlan::create([
            'institution_id' => $this->institution->id,
            'name' => $name,
            'schedule_mode' => $scheduleMode,
            'is_active' => true,
            'sort_order' => $sort,
        ]);

        foreach ($months as $i => $month) {
            PaymentPlanInstallment::create([
                'payment_plan_id' => $plan->id,
                'sequence' => $i + 1,
                'due_month' => $month,
                'due_day' => 10,
                'grace_period_days' => 0,
                // Deliberate: comparing a plan must not assess this.
                'late_fee_percentage' => 5,
            ]);
        }

        return $plan;
    }

    private function fetchOptions(): array
    {
        return $this->withHeader('Authorization', 'Bearer test-token')
            ->getJson("/api/students/{$this->student->id}/payment-plan/options?academic_year=" . self::YEAR)
            ->assertOk()
            ->json('data');
    }

    private function optionFor(array $data, string $name): array
    {
        $option = collect($data['options'])->firstWhere('name', $name);
        $this->assertNotNull($option, "expected an option for {$name}");

        return $option;
    }

    public function test_it_prices_every_plan_against_the_student_s_own_account(): void
    {
        $data = $this->fetchOptions();

        $this->assertCount(3, $data['options']);
        $this->assertEquals(23700.0, $data['principal_charges']);
        $this->assertEquals(7900.0, $data['payments_total']);

        // Ten even months of 2,370, with the 7,900 filling the earliest.
        $monthly = $this->optionFor($data, 'Monthly');
        $this->assertSame(10, $monthly['installment_count']);
        $this->assertEqualsWithDelta(2370.0, $monthly['installments'][0]['amount'], 0.01);

        // Three terms of 7,900 — the first is settled outright by what was paid.
        $terms = $this->optionFor($data, 'Three Terms');
        $this->assertSame(3, $terms['installment_count']);
        $this->assertEqualsWithDelta(7900.0, $terms['installments'][0]['amount'], 0.01);
        $this->assertSame('paid', $terms['installments'][0]['status']);

        // Recalculated: July kept its 2,370, August is 15,800 over the nine months left.
        $recalculated = $this->optionFor($data, '10 Months (Recalculated)');
        $this->assertEqualsWithDelta(2370.0, $recalculated['installments'][0]['amount'], 0.01);
        $this->assertEqualsWithDelta(1755.56, $recalculated['installments'][1]['amount'], 0.01);

        // Whatever the shape, each plan still has to collect the same 15,800 balance.
        foreach ($data['options'] as $option) {
            $this->assertEqualsWithDelta(
                15800.0,
                $option['still_to_collect'],
                0.01,
                "{$option['name']} should still collect the outstanding balance"
            );
        }
    }

    public function test_it_reports_what_each_plan_asks_for_now(): void
    {
        $data = $this->fetchOptions();

        // August on the monthly plan; the first term still, on a term plan.
        $this->assertSame('August 2026', $this->optionFor($data, 'Monthly')['current_period']['label']);
        $this->assertSame('July 2026', $this->optionFor($data, 'Three Terms')['current_period']['label']);

        // The plan actually in force is flagged, so the comparison can mark it.
        $this->assertTrue($this->optionFor($data, 'Monthly')['is_selected']);
        $this->assertFalse($this->optionFor($data, 'Three Terms')['is_selected']);
        $this->assertSame($this->monthly->id, $data['selected_payment_plan_id']);
    }

    public function test_comparing_plans_changes_nothing(): void
    {
        $before = StudentPaymentPlan::where('student_id', $this->student->id)->first();

        $data = $this->fetchOptions();
        $this->fetchOptions();

        // No surcharge booked, even though every plan carries a 5% late fee and July is
        // long overdue. A plan being looked at must not leave charges on the account.
        $this->assertSame(0, StudentAdditionalFee::lateFees()->count());
        $this->assertSame(0, StudentAdditionalFee::count());
        $this->assertFalse($data['includes_surcharges'] ?? true);

        // And the student is still on the plan they were on.
        $after = StudentPaymentPlan::where('student_id', $this->student->id)->first();
        $this->assertSame($before->payment_plan_id, $after->payment_plan_id);
        $this->assertSame($before->updated_at->toDateTimeString(), $after->updated_at->toDateTimeString());
        $this->assertSame(1, StudentPaymentPlan::where('student_id', $this->student->id)->count());
    }

    public function test_a_student_may_compare_their_own_plans_but_not_another_s(): void
    {
        // A portal login for the student the comparison belongs to.
        StudentAuth::create([
            'student_id' => $this->student->id,
            'email' => 'whatif@portal.test',
            'password' => Hash::make('student-password'),
            'is_new' => false,
            'token' => 'own-portal-token',
            'token_expiry' => now()->addYear()->toDateTimeString(),
        ]);

        $this->withHeader('Authorization', 'Bearer own-portal-token')
            ->getJson("/api/students/{$this->student->id}/payment-plan/options?academic_year=" . self::YEAR)
            ->assertOk();

        // And a second student, who must not see the first one's figures.
        $other = Student::create([
            'first_name' => 'Someone',
            'last_name' => 'Else',
            'gender' => 'male',
            'birthdate' => '2010-01-01',
            'is_active' => true,
        ]);
        StudentInstitution::create([
            'student_id' => $other->id,
            'institution_id' => $this->institution->id,
            'is_active' => true,
            'academic_year' => self::YEAR,
        ]);
        StudentAuth::create([
            'student_id' => $other->id,
            'email' => 'someone-else@portal.test',
            'password' => Hash::make('student-password'),
            'is_new' => false,
            'token' => 'other-portal-token',
            'token_expiry' => now()->addYear()->toDateTimeString(),
        ]);

        $this->withHeader('Authorization', 'Bearer other-portal-token')
            ->getJson("/api/students/{$this->student->id}/payment-plan/options?academic_year=" . self::YEAR)
            ->assertStatus(403);
    }
}
