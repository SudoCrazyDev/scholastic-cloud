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
 * The ledger and the notice of account both bill a reamortizing plan from the balance.
 *
 * The worked example is the one the schools state it with: 23,700 for AY 2026-2027 —
 * 7,000 tuition, 1,000 registration, 15,700 miscellaneous — on a ten-month plan running
 * July to April, so 2,370 a month to start. The student pays 7,900 in July (settling
 * registration in full and 6,900 of the miscellaneous fee), and nothing after that.
 *
 * From August the plan asks for 15,800 ÷ 9; by December, 15,800 ÷ 5. The months in between
 * closed short, and what they did not collect is already inside December onwards — so they
 * ask for nothing themselves, and the schedule still adds up to the balance exactly.
 *
 * Nothing is surcharged: re-dividing the shortfall is the whole consequence of missing a
 * month on these plans.
 */
class ReamortizingLedgerTest extends TestCase
{
    use RefreshDatabase;

    private const YEAR = '2026-2027';

    private User $user;
    private Institution $institution;
    private Student $student;
    private SchoolFee $tuition;
    private SchoolFee $registration;
    private SchoolFee $miscellaneous;

    protected function setUp(): void
    {
        parent::setUp();

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
            'first_name' => 'Recast',
            'last_name' => 'Payer',
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

        foreach ([
            ['tuition', 'Tuition Fee', 7000],
            ['registration', 'Registration Fee', 1000],
            ['miscellaneous', 'Miscellaneous Fee', 15700],
        ] as [$property, $name, $amount]) {
            $fee = SchoolFee::create([
                'institution_id' => $this->institution->id,
                'name' => $name,
                'is_active' => true,
            ]);
            SchoolFeeDefault::create([
                'school_fee_id' => $fee->id,
                'institution_id' => $this->institution->id,
                'grade_level' => 'Grade 7',
                'academic_year' => self::YEAR,
                'amount' => $amount,
            ]);
            $this->{$property} = $fee;
        }

        // Ten months, July through April, due on the 10th. The late fee percentage is set
        // deliberately: a reamortizing plan must ignore it rather than quietly charge it.
        $plan = PaymentPlan::create([
            'institution_id' => $this->institution->id,
            'name' => '10 Months',
            'schedule_mode' => PaymentPlan::SCHEDULE_REAMORTIZING,
            'is_active' => true,
            'sort_order' => 1,
        ]);
        foreach ([7, 8, 9, 10, 11, 12, 1, 2, 3, 4] as $i => $month) {
            PaymentPlanInstallment::create([
                'payment_plan_id' => $plan->id,
                'sequence' => $i + 1,
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
            'payment_plan_id' => $plan->id,
            'selected_at' => '2026-06-01 08:00:00',
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

    private function notice(): array
    {
        return $this->withHeader('Authorization', 'Bearer test-token')
            ->getJson("/api/students/{$this->student->id}/noa?academic_year=" . self::YEAR)
            ->assertOk()
            ->json('data');
    }

    /** The July collection: registration in full, the rest against miscellaneous. */
    private function payJuly(): void
    {
        $this->withHeader('Authorization', 'Bearer test-token')
            ->postJson('/api/student-payments', [
                'student_id' => $this->student->id,
                'academic_year' => self::YEAR,
                'payment_date' => '2026-07-20',
                'items' => [
                    ['school_fee_id' => $this->registration->id, 'amount' => 1000],
                    ['school_fee_id' => $this->miscellaneous->id, 'amount' => 6900],
                ],
            ])
            ->assertCreated();
    }

    public function test_the_schedule_opens_at_charges_divided_by_the_months(): void
    {
        Carbon::setTestNow('2026-07-05 08:00:00');

        $installments = $this->ledger()['installments'];

        $this->assertCount(10, $installments);
        $this->assertEquals(23700.0, collect($installments)->sum('amount'));
        foreach ($installments as $installment) {
            $this->assertEqualsWithDelta(2370.0, $installment['amount'], 0.01);
        }
    }

    public function test_a_payment_lowers_the_months_after_it_and_not_its_own(): void
    {
        Carbon::setTestNow('2026-07-05 08:00:00');
        $this->payJuly();

        Carbon::setTestNow('2026-08-05 08:00:00');
        $installments = $this->ledger()['installments'];

        // July keeps the figure it was billed, and shows what actually arrived against it.
        $this->assertEqualsWithDelta(2370.0, $installments[0]['amount'], 0.01);
        $this->assertEqualsWithDelta(7900.0, $installments[0]['paid_amount'], 0.01);
        $this->assertSame('paid', $installments[0]['status']);

        // 15,800 over the nine months left.
        $this->assertEqualsWithDelta(1755.56, $installments[1]['amount'], 0.01);
        $this->assertEqualsWithDelta(
            15800.0,
            collect($installments)->slice(1)->sum('amount'),
            0.01
        );
    }

    public function test_months_that_pass_unpaid_reprice_the_rest_and_stop_asking(): void
    {
        Carbon::setTestNow('2026-07-05 08:00:00');
        $this->payJuly();

        Carbon::setTestNow('2026-12-05 08:00:00');
        $data = $this->ledger();
        $installments = $data['installments'];

        $this->assertEqualsWithDelta(1755.56, $installments[1]['amount'], 0.01);  // Aug — ÷ 9
        $this->assertEqualsWithDelta(1975.0, $installments[2]['amount'], 0.01);   // Sep — ÷ 8
        $this->assertEqualsWithDelta(2257.14, $installments[3]['amount'], 0.01);  // Oct — ÷ 7
        $this->assertEqualsWithDelta(2633.33, $installments[4]['amount'], 0.01);  // Nov — ÷ 6
        $this->assertEqualsWithDelta(3160.0, $installments[5]['amount'], 0.01);   // Dec — ÷ 5

        // August through November closed short and are carried, so they ask for nothing.
        foreach ([1, 2, 3, 4] as $index) {
            $this->assertTrue($installments[$index]['rolled_forward']);
            $this->assertEquals(0.0, $installments[$index]['outstanding_amount']);
            $this->assertFalse($installments[$index]['is_overdue']);
        }

        // What the schedule still asks for is exactly the balance, and it agrees with the
        // ledger's own figure rather than being a second reading of it.
        $this->assertEqualsWithDelta(
            15800.0,
            collect($installments)->sum('outstanding_amount'),
            0.01
        );
        $this->assertEquals(15800.0, $data['totals']['balance']);
    }

    public function test_nothing_is_surcharged_however_many_months_are_missed(): void
    {
        Carbon::setTestNow('2026-07-05 08:00:00');
        $this->payJuly();

        Carbon::setTestNow('2027-05-05 08:00:00');
        $data = $this->ledger();

        $this->assertEquals(0.0, $data['totals']['late_fees']);
        $this->assertSame(0, StudentAdditionalFee::lateFees()->count());
        $this->assertEquals(23700.0, $data['totals']['charges']);

        // The last month has nothing after it to carry the balance, so it holds it.
        $last = collect($data['installments'])->last();
        $this->assertFalse($last['rolled_forward']);
        $this->assertEqualsWithDelta(15800.0, $last['outstanding_amount'], 0.01);
    }

    public function test_the_notice_of_account_bills_the_same_figures(): void
    {
        Carbon::setTestNow('2026-07-05 08:00:00');
        $this->payJuly();

        Carbon::setTestNow('2026-12-05 08:00:00');
        $notice = $this->notice();

        $this->assertSame('reamortizing', $notice['payment_plan']['schedule_mode']);
        $this->assertEqualsWithDelta(3160.0, $notice['installments'][5]['amount'], 0.01);
        $this->assertEquals(0.0, $notice['totals']['late_fees']);
        $this->assertEquals(15800.0, $notice['totals']['balance']);
    }
}
