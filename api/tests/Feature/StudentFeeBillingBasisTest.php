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
use App\Models\StudentFee;
use App\Models\StudentInstitution;
use App\Models\StudentPaymentPlan;
use App\Models\StudentSection;
use App\Models\User;
use App\Models\UserInstitution;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * An ad-hoc student fee declares how it is collected. A cash-basis fee is owed in full on
 * its own and never touches the installment schedule; an installment-basis fee joins the
 * payable the plan divides. Cash is the default, so a one-off field trip does not quietly
 * stretch across the school year.
 */
class StudentFeeBillingBasisTest extends TestCase
{
    use RefreshDatabase;

    private const YEAR = '2026-2027';

    private User $user;
    private Institution $institution;
    private Student $student;

    protected function setUp(): void
    {
        parent::setUp();

        // Inside the first installment's grace window, so no late fee muddies the totals.
        Carbon::setTestNow('2026-08-10 08:00:00');

        $this->institution = Institution::factory()->create();
        $this->user = User::factory()->create([
            'token' => 'test-token',
            'token_expiry' => now()->addDay()->toDateTimeString(),
        ]);
        UserInstitution::factory()->create([
            'user_id' => $this->user->id,
            'institution_id' => $this->institution->id,
            'is_default' => true,
            'is_main' => true,
        ]);

        $this->student = Student::create([
            'first_name' => 'Basis',
            'last_name' => 'Tester',
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

        $tuition = SchoolFee::create([
            'institution_id' => $this->institution->id,
            'name' => 'Tuition Fee',
            'is_active' => true,
        ]);
        SchoolFeeDefault::create([
            'school_fee_id' => $tuition->id,
            'institution_id' => $this->institution->id,
            'grade_level' => 'Grade 7',
            'academic_year' => self::YEAR,
            'amount' => 10000,
        ]);

        $plan = PaymentPlan::create([
            'institution_id' => $this->institution->id,
            'name' => 'Semestral',
            'is_active' => true,
            'sort_order' => 1,
        ]);
        foreach ([[1, 8], [2, 10]] as [$sequence, $month]) {
            PaymentPlanInstallment::create([
                'payment_plan_id' => $plan->id,
                'sequence' => $sequence,
                'label' => 'Semester ' . $sequence,
                'due_month' => $month,
                'due_day' => 1,
                'grace_period_days' => 15,
                'late_fee_percentage' => 3,
                'share_percentage' => 50,
            ]);
        }

        StudentPaymentPlan::create([
            'institution_id' => $this->institution->id,
            'student_id' => $this->student->id,
            'academic_year' => self::YEAR,
            'payment_plan_id' => $plan->id,
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

    private function chargeFee(string $billingType, float $amount = 1000): StudentAdditionalFee
    {
        return StudentAdditionalFee::create([
            'institution_id' => $this->institution->id,
            'student_id' => $this->student->id,
            'academic_year' => self::YEAR,
            'name' => 'Field Trip',
            'billing_type' => $billingType,
            'amount' => $amount,
        ]);
    }

    public function test_a_cash_basis_fee_stays_out_of_the_installment_split(): void
    {
        $this->chargeFee(StudentAdditionalFee::BILLING_CASH);

        $data = $this->ledger();

        // Still owed in full, just not amortized.
        $this->assertEquals(11000.0, $data['totals']['charges']);
        $this->assertEquals(11000.0, $data['totals']['balance']);
        $this->assertEquals(1000.0, $data['totals']['cash_fees']);
        $this->assertEquals(1000.0, $data['cash_basis']['charges']);
        $this->assertEquals(1000.0, $data['cash_basis']['outstanding']);
        $this->assertSame(1, $data['cash_basis']['fee_count']);

        $installments = collect($data['installments']);
        $this->assertEquals(5000.0, $installments->firstWhere('sequence', 1)['amount']);
        $this->assertEquals(5000.0, $installments->firstWhere('sequence', 2)['amount']);
    }

    public function test_an_installment_basis_fee_joins_the_split(): void
    {
        $this->chargeFee(StudentAdditionalFee::BILLING_INSTALLMENT);

        $data = $this->ledger();

        $this->assertEquals(11000.0, $data['totals']['charges']);
        $this->assertEquals(0.0, $data['totals']['cash_fees']);

        $installments = collect($data['installments']);
        $this->assertEquals(5500.0, $installments->firstWhere('sequence', 1)['amount']);
        $this->assertEquals(5500.0, $installments->firstWhere('sequence', 2)['amount']);
    }

    public function test_paying_a_cash_basis_fee_does_not_settle_an_installment(): void
    {
        $fee = $this->chargeFee(StudentAdditionalFee::BILLING_CASH);

        $this->withHeader('Authorization', 'Bearer test-token')
            ->postJson('/api/student-payments', [
                'student_id' => $this->student->id,
                'academic_year' => self::YEAR,
                'items' => [
                    ['additional_fee_id' => $fee->id, 'amount' => 1000],
                ],
            ])->assertCreated();

        $data = $this->ledger();

        $this->assertEquals(1000.0, $data['totals']['payments']);
        $this->assertEquals(1000.0, $data['cash_basis']['paid']);
        $this->assertEquals(0.0, $data['cash_basis']['outstanding']);

        // The tuition schedule is untouched — that money was owed elsewhere.
        $installments = collect($data['installments']);
        $this->assertEquals(0.0, $installments->firstWhere('sequence', 1)['paid_amount']);
        $this->assertSame('pending', $installments->firstWhere('sequence', 1)['status']);
        $this->assertEquals(10000.0, $data['totals']['balance']);
    }

    public function test_the_fee_breakdown_reports_each_basis(): void
    {
        $this->chargeFee(StudentAdditionalFee::BILLING_CASH);
        $this->chargeFee(StudentAdditionalFee::BILLING_INSTALLMENT, 500);

        $breakdown = collect($this->ledger()['fee_breakdown']);

        $this->assertSame(
            'installment',
            $breakdown->firstWhere('is_additional', false)['billing_type'],
            'A standard grade-level fee is plan principal.'
        );
        $this->assertEqualsCanonicalizing(
            ['cash', 'installment'],
            $breakdown->where('is_additional', true)->pluck('billing_type')->all()
        );
    }

    public function test_a_saved_student_fee_defaults_to_cash_and_a_charge_inherits_it(): void
    {
        $created = $this->withHeader('Authorization', 'Bearer test-token')
            ->postJson('/api/student-fees', [
                'name' => 'Laboratory Fee',
                'amount' => 750,
            ])->assertCreated()->json('data');

        $this->assertSame(StudentFee::BILLING_CASH, $created['billing_type']);

        $amortized = $this->withHeader('Authorization', 'Bearer test-token')
            ->postJson('/api/student-fees', [
                'name' => 'Computer Fee',
                'amount' => 1200,
                'billing_type' => StudentFee::BILLING_INSTALLMENT,
            ])->assertCreated()->json('data');

        // A charge raised from a saved fee takes that fee's basis without restating it.
        $charge = $this->withHeader('Authorization', 'Bearer test-token')
            ->postJson('/api/student-additional-fees', [
                'student_id' => $this->student->id,
                'student_fee_id' => $amortized['id'],
                'academic_year' => self::YEAR,
                'name' => $amortized['name'],
                'amount' => $amortized['amount'],
            ])->assertCreated()->json('data');

        $this->assertSame(StudentAdditionalFee::BILLING_INSTALLMENT, $charge['billing_type']);

        $installments = collect($this->ledger()['installments']);
        $this->assertEquals(5600.0, $installments->firstWhere('sequence', 1)['amount']);
    }

    public function test_a_hand_typed_charge_is_cash_basis(): void
    {
        $charge = $this->withHeader('Authorization', 'Bearer test-token')
            ->postJson('/api/student-additional-fees', [
                'student_id' => $this->student->id,
                'academic_year' => self::YEAR,
                'name' => 'Field Trip',
                'amount' => 300,
            ])->assertCreated()->json('data');

        $this->assertSame(StudentAdditionalFee::BILLING_CASH, $charge['billing_type']);

        $installments = collect($this->ledger()['installments']);
        $this->assertEquals(5000.0, $installments->firstWhere('sequence', 1)['amount']);
    }

    public function test_the_notice_of_account_agrees_with_the_ledger(): void
    {
        $this->chargeFee(StudentAdditionalFee::BILLING_CASH);
        $this->chargeFee(StudentAdditionalFee::BILLING_INSTALLMENT, 500);

        $ledger = $this->ledger();
        $noa = $this->withHeader('Authorization', 'Bearer test-token')
            ->getJson("/api/students/{$this->student->id}/noa?academic_year=" . self::YEAR)
            ->assertOk()
            ->json('data');

        $this->assertEquals($ledger['totals']['charges'], $noa['totals']['charges']);
        $this->assertEquals($ledger['totals']['balance'], $noa['totals']['balance']);
        $this->assertEquals($ledger['cash_basis']['charges'], $noa['cash_basis']['charges']);
        $this->assertEquals(
            collect($ledger['installments'])->pluck('amount')->all(),
            collect($noa['installments'])->pluck('amount')->all()
        );
    }
}
