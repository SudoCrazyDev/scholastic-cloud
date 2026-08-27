<?php

namespace Tests\Feature;

use App\Models\ClassSection;
use App\Models\Institution;
use App\Models\SchoolFee;
use App\Models\SchoolFeeDefault;
use App\Models\Student;
use App\Models\StudentAdditionalFee;
use App\Models\StudentDiscount;
use App\Models\StudentInstitution;
use App\Models\StudentSection;
use App\Models\User;
use App\Models\UserInstitution;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * A payment taken as General / Other names no fee. The ledger balance takes it off all
 * the same, so if the per-fee breakdown leaves it where it lands, the Fees view and the
 * cashiering till bill the whole charge back to the student — a fee the money already
 * settled still reads Unpaid, and "Pay all balances" asks for it twice.
 *
 * The reported case: three general collections of 5,000, 5,000 and 1,000 against a
 * 21,800 bill. The ledger showed 10,800 owed; the till still listed all 21,800.
 */
class LedgerFeeBreakdownGeneralPaymentTest extends TestCase
{
    use RefreshDatabase;

    private const YEAR = '2026-2027';
    private const GRADE = 'Grade 7';

    private Institution $institution;
    private Student $student;
    private SchoolFee $tuition;
    private SchoolFee $registration;
    private SchoolFee $books;
    private SchoolFee $misc;

    protected function setUp(): void
    {
        parent::setUp();

        // Before the first due date, so no late fee joins the breakdown.
        Carbon::setTestNow('2026-05-11 08:00:00');

        $this->institution = Institution::factory()->create();
        $user = User::factory()->create([
            'token' => 'test-token',
            'token_expiry' => now()->addDay()->toDateTimeString(),
        ]);
        UserInstitution::factory()->create([
            'user_id' => $user->id,
            'institution_id' => $this->institution->id,
            'is_default' => true,
            'is_main' => true,
        ]);

        $this->student = Student::create([
            'first_name' => 'General',
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
            'grade_level' => self::GRADE,
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

        $this->tuition = $this->chargeStandardFee('Tuition', 5600);
        $this->registration = $this->chargeStandardFee('Registration', 1000);
        $this->books = $this->chargeStandardFee('Books/Modules', 5700);
        $this->misc = $this->chargeStandardFee('Miscellaneous', 9500);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function chargeStandardFee(string $name, float $amount): SchoolFee
    {
        $fee = SchoolFee::create([
            'institution_id' => $this->institution->id,
            'name' => $name,
            'is_active' => true,
        ]);
        SchoolFeeDefault::create([
            'school_fee_id' => $fee->id,
            'institution_id' => $this->institution->id,
            'grade_level' => self::GRADE,
            'academic_year' => self::YEAR,
            'amount' => $amount,
        ]);

        return $fee;
    }

    private function additionalFee(string $name, float $amount, string $billingType): StudentAdditionalFee
    {
        return StudentAdditionalFee::create([
            'institution_id' => $this->institution->id,
            'student_id' => $this->student->id,
            'academic_year' => self::YEAR,
            'name' => $name,
            'amount' => $amount,
            'billing_type' => $billingType,
        ]);
    }

    /** Posts a payment; a null fee id is the General / Other line of the till. */
    private function pay(float $amount, ?string $schoolFeeId = null, ?string $additionalFeeId = null): void
    {
        $this->withHeader('Authorization', 'Bearer test-token')
            ->postJson('/api/student-payments', [
                'student_id' => $this->student->id,
                'academic_year' => self::YEAR,
                'items' => [
                    [
                        'school_fee_id' => $schoolFeeId,
                        'additional_fee_id' => $additionalFeeId,
                        'amount' => $amount,
                    ],
                ],
            ])->assertCreated();
    }

    private function ledger(): array
    {
        return $this->withHeader('Authorization', 'Bearer test-token')
            ->getJson("/api/students/{$this->student->id}/ledger?academic_year=" . self::YEAR)
            ->assertOk()
            ->json('data');
    }

    private function breakdownFor(array $data, string $feeId): array
    {
        return collect($data['fee_breakdown'])->firstWhere('fee_id', $feeId);
    }

    /**
     * The reported case. 11,000 collected without naming a fee, shared across the four
     * charges in proportion to what each still owes, so the rows total the ledger balance
     * instead of the whole bill.
     */
    public function test_general_payments_are_shared_across_the_fees_that_still_owe(): void
    {
        $this->pay(5000);
        $this->pay(5000);
        $this->pay(1000);

        $data = $this->ledger();

        $this->assertEquals(10800.0, $data['totals']['balance']);

        $breakdown = collect($data['fee_breakdown']);
        $this->assertEquals(11000.0, $breakdown->sum('paid'));
        $this->assertEquals(11000.0, $breakdown->sum('general_applied'));
        $this->assertEquals(10800.0, $breakdown->sum('outstanding'));

        // 21,800 charged, 11,000 collected: every fee keeps 10,800/21,800 of its charge.
        $this->assertEquals(2774.31, $this->breakdownFor($data, $this->tuition->id)['outstanding']);
        $this->assertEquals(495.41, $this->breakdownFor($data, $this->registration->id)['outstanding']);
        $this->assertEquals(2823.86, $this->breakdownFor($data, $this->books->id)['outstanding']);
        $this->assertEquals(4706.42, $this->breakdownFor($data, $this->misc->id)['outstanding']);

        // Nothing is left over to report as collected-but-unapplied.
        $this->assertEquals(0.0, $data['unallocated_payments']);
    }

    /**
     * A fee settled by a receipt of its own is out of the spread: the general money goes
     * to what is actually still owed, and the settled row keeps reading Paid.
     */
    public function test_a_fully_paid_fee_takes_no_share(): void
    {
        $this->pay(1000, $this->registration->id);
        $this->pay(5600, $this->tuition->id);
        $this->pay(5000);

        $data = $this->ledger();

        $tuition = $this->breakdownFor($data, $this->tuition->id);
        $registration = $this->breakdownFor($data, $this->registration->id);
        $this->assertEquals(0.0, $tuition['outstanding']);
        $this->assertEquals(0.0, $tuition['general_applied']);
        $this->assertEquals(0.0, $registration['outstanding']);
        $this->assertEquals(0.0, $registration['general_applied']);

        // The 5,000 lands on Books/Modules and Miscellaneous, 5,700 / 15,200 and
        // 9,500 / 15,200 of what those two still owed.
        $this->assertEquals(1875.0, $this->breakdownFor($data, $this->books->id)['general_applied']);
        $this->assertEquals(3125.0, $this->breakdownFor($data, $this->misc->id)['general_applied']);

        $this->assertEquals(10200.0, $data['totals']['balance']);
        $this->assertEquals(10200.0, collect($data['fee_breakdown'])->sum('outstanding'));
    }

    /**
     * A discount already wrote part of the bill off, so the general money is spread over
     * what is left after it — not over the charge, or the rows would report collecting
     * more than the student owes.
     */
    public function test_the_spread_is_over_the_balance_left_after_discounts(): void
    {
        StudentDiscount::create([
            'institution_id' => $this->institution->id,
            'student_id' => $this->student->id,
            'school_fee_id' => $this->tuition->id,
            'academic_year' => self::YEAR,
            'discount_type' => 'fixed',
            'value' => 5600,
        ]);
        $this->pay(1000);

        $data = $this->ledger();

        $tuition = $this->breakdownFor($data, $this->tuition->id);
        $this->assertEquals(5600.0, $tuition['discount']);
        $this->assertEquals(0.0, $tuition['general_applied']);
        $this->assertEquals(0.0, $tuition['outstanding']);

        $this->assertEquals(15200.0, $data['totals']['balance']);
        $this->assertEquals(15200.0, collect($data['fee_breakdown'])->sum('outstanding'));
    }

    /**
     * Money past what the fees still owe has nowhere to sit: it stays reported as
     * unapplied — an advance the student is owed back — rather than driving a row
     * negative or dropping out of the reconciliation.
     */
    public function test_general_money_beyond_the_bill_stays_unapplied(): void
    {
        $this->pay(25000);

        $data = $this->ledger();

        $breakdown = collect($data['fee_breakdown']);
        $this->assertEquals(0.0, $breakdown->sum('outstanding'));
        $this->assertEquals(21800.0, $breakdown->sum('general_applied'));
        $this->assertEquals(3200.0, $data['unallocated_payments']);

        // Rows plus the unapplied remainder still come back to the ledger balance.
        $this->assertEquals(-3200.0, $data['totals']['balance']);
        $this->assertEquals(
            $data['totals']['balance'],
            round($breakdown->sum('outstanding') - $data['unallocated_payments'], 2)
        );
    }

    /**
     * A cash-basis fee is collected on its own, outside the schedule, and the schedule
     * already reads general money as plan principal. It must not quietly settle one, or
     * the Fees view and the `cash_basis` summary disagree about the same charge.
     */
    public function test_a_cash_basis_fee_is_left_out_of_the_spread(): void
    {
        $uniform = $this->additionalFee('Uniform', 2000, StudentAdditionalFee::BILLING_CASH);
        $fieldTrip = $this->additionalFee('Field Trip', 1000, StudentAdditionalFee::BILLING_INSTALLMENT);

        $this->pay(1000);

        $data = $this->ledger();

        $uniformRow = $this->breakdownFor($data, $uniform->id);
        $this->assertEquals(0.0, $uniformRow['general_applied']);
        $this->assertEquals(2000.0, $uniformRow['outstanding']);
        $this->assertEquals(2000.0, $data['cash_basis']['outstanding']);

        // The amortized one joins the principal, so it takes its share.
        $this->assertGreaterThan(0.0, $this->breakdownFor($data, $fieldTrip->id)['general_applied']);
        $this->assertEquals(1000.0, round(collect($data['fee_breakdown'])->sum('general_applied'), 2));
    }

    /** The shares are rounded to centavos, so they must total the collection exactly. */
    public function test_the_shares_total_the_collection_exactly(): void
    {
        $this->pay(3333.33);

        $breakdown = collect($this->ledger()['fee_breakdown']);

        $this->assertEquals(3333.33, $breakdown->sum('general_applied'));
        $this->assertEquals(18466.67, $breakdown->sum('outstanding'));
    }
}
