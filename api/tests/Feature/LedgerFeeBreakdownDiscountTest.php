<?php

namespace Tests\Feature;

use App\Models\ClassSection;
use App\Models\GradeLevelDiscount;
use App\Models\GradeLevelDiscountStudentVoid;
use App\Models\Institution;
use App\Models\SchoolFee;
use App\Models\SchoolFeeDefault;
use App\Models\Student;
use App\Models\StudentDiscount;
use App\Models\StudentInstitution;
use App\Models\StudentSection;
use App\Models\User;
use App\Models\UserInstitution;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * The Fees view reads `fee_breakdown`, the ledger balance reads `totals`. The two are
 * the same money seen per fee and in aggregate, so a discount honoured by one must be
 * honoured by the other — otherwise a fee the school has already written down keeps
 * showing outstanding that nobody owes.
 */
class LedgerFeeBreakdownDiscountTest extends TestCase
{
    use RefreshDatabase;

    private const YEAR = '2026-2027';
    private const GRADE = 'Grade 7';

    private Institution $institution;
    private Student $student;
    private SchoolFee $tuition;
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
            'first_name' => 'Ledger',
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

        $this->tuition = $this->chargeStandardFee('Tuition', 8000);
        $this->misc = $this->chargeStandardFee('Miscellaneous', 22600);
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

    private function discount(float $value, ?string $schoolFeeId = null): StudentDiscount
    {
        return StudentDiscount::create([
            'institution_id' => $this->institution->id,
            'student_id' => $this->student->id,
            'school_fee_id' => $schoolFeeId,
            'academic_year' => self::YEAR,
            'discount_type' => 'fixed',
            'value' => $value,
        ]);
    }

    private function pay(string $schoolFeeId, float $amount): void
    {
        $this->withHeader('Authorization', 'Bearer test-token')
            ->postJson('/api/student-payments', [
                'student_id' => $this->student->id,
                'academic_year' => self::YEAR,
                'items' => [
                    ['school_fee_id' => $schoolFeeId, 'amount' => $amount],
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
     * The reported case: a whole-bill discount the cashier already netted out when
     * collecting. It has no fee of its own, so before it was allocated the paid-down
     * fee still reported its value as outstanding.
     *
     * The cashier took Tuition's whole ₱8,000 charge and put the rest on Miscellaneous,
     * so the discount is what is left of Miscellaneous — spreading it over the charges
     * instead would write ₱470.59 off a Tuition that a payment had already settled and
     * leave Miscellaneous reading Partial on a bill that is paid.
     */
    public function test_a_whole_bill_discount_lands_on_what_each_fee_still_owes(): void
    {
        $this->discount(1800);
        $this->pay($this->tuition->id, 8000);
        $this->pay($this->misc->id, 20800);

        $data = $this->ledger();

        $this->assertEquals(0.0, $data['totals']['balance']);

        $breakdown = collect($data['fee_breakdown']);
        $this->assertEquals(1800.0, $breakdown->sum('discount'));
        $this->assertEquals(0.0, $breakdown->sum('outstanding'));

        // Every row settled, not two rows off by Tuition's proportional share.
        $this->assertEquals(0.0, $this->breakdownFor($data, $this->tuition->id)['discount']);
        $this->assertEquals(0.0, $this->breakdownFor($data, $this->tuition->id)['outstanding']);
        $this->assertEquals(1800.0, $this->breakdownFor($data, $this->misc->id)['discount']);
        $this->assertEquals(0.0, $this->breakdownFor($data, $this->misc->id)['outstanding']);
    }

    /**
     * Nothing collected yet, so every fee owes its whole charge and the discount is
     * shared out in proportion to them: 8,000 / 30,600 and 22,600 / 30,600.
     */
    public function test_an_uncollected_bill_shares_the_discount_by_charge(): void
    {
        $this->discount(1800);

        $data = $this->ledger();

        $this->assertEquals(470.59, $this->breakdownFor($data, $this->tuition->id)['discount']);
        $this->assertEquals(1329.41, $this->breakdownFor($data, $this->misc->id)['discount']);
        $this->assertEquals(1800.0, collect($data['fee_breakdown'])->sum('discount'));
    }

    /**
     * A discount larger than the bill still owes has to go somewhere: the remainder sits
     * on charge that was already collected, so the rows read overpaid by exactly what the
     * student is owed back rather than swallowing part of the discount.
     */
    public function test_a_discount_beyond_the_unpaid_balance_spills_onto_collected_charge(): void
    {
        $this->discount(1800);
        $this->pay($this->tuition->id, 8000);
        $this->pay($this->misc->id, 22000);

        $data = $this->ledger();

        // ₱30,000 collected against a ₱28,800 payable: ₱1,200 over.
        $this->assertEquals(-1200.0, $data['totals']['balance']);

        $breakdown = collect($data['fee_breakdown']);
        $this->assertEquals(1800.0, $breakdown->sum('discount'));
        $this->assertEquals(-1200.0, $breakdown->sum('outstanding'));

        // Miscellaneous absorbs its remaining ₱600 first; the ₱1,200 left over is shared
        // across the collected charge, 8,000 / 30,000 and 22,000 / 30,000.
        $this->assertEquals(320.0, $this->breakdownFor($data, $this->tuition->id)['discount']);
        $this->assertEquals(1480.0, $this->breakdownFor($data, $this->misc->id)['discount']);
    }

    /**
     * The shares are rounded to centavos, so they must be reconciled against the
     * discount rather than left to drift — a stray centavo is a fee that never reads
     * as fully paid.
     */
    public function test_the_shares_total_the_discount_exactly(): void
    {
        $this->discount(1000.01);

        $breakdown = collect($this->ledger()['fee_breakdown']);

        $this->assertEquals(1000.01, $breakdown->sum('discount'));
    }

    /**
     * A discount naming a fee belongs to that fee alone; only the unassigned remainder
     * gets spread, and it may not push a written-down fee below zero.
     */
    public function test_a_fee_specific_discount_stays_on_its_fee(): void
    {
        $this->discount(8000, $this->tuition->id);
        $this->discount(1800);

        $data = $this->ledger();

        // Tuition is already fully discounted, so it has no room to absorb a share.
        $this->assertEquals(8000.0, $this->breakdownFor($data, $this->tuition->id)['discount']);
        $this->assertEquals(0.0, $this->breakdownFor($data, $this->tuition->id)['outstanding']);
        $this->assertEquals(1800.0, $this->breakdownFor($data, $this->misc->id)['discount']);

        $this->assertEquals(9800.0, $data['totals']['discounts']);
        $this->assertEquals(9800.0, collect($data['fee_breakdown'])->sum('discount'));
    }

    public function test_a_voided_discount_is_not_spread(): void
    {
        $this->discount(1800);
        $this->discount(500)->update(['voided_at' => now()]);

        $breakdown = collect($this->ledger()['fee_breakdown']);

        $this->assertEquals(1800.0, $breakdown->sum('discount'));
    }

    /**
     * A grade-level discount voided for one student is dropped from that student's
     * totals; the per-fee breakdown has to drop it too.
     */
    public function test_a_grade_discount_voided_for_this_student_leaves_the_breakdown(): void
    {
        $gradeDiscount = GradeLevelDiscount::create([
            'institution_id' => $this->institution->id,
            'school_fee_id' => $this->tuition->id,
            'grade_level' => self::GRADE,
            'academic_year' => self::YEAR,
            'discount_type' => 'fixed',
            'value' => 500,
        ]);

        $data = $this->ledger();
        $this->assertEquals(500.0, $this->breakdownFor($data, $this->tuition->id)['discount']);
        $this->assertEquals(7500.0, $this->breakdownFor($data, $this->tuition->id)['outstanding']);

        GradeLevelDiscountStudentVoid::create([
            'institution_id' => $this->institution->id,
            'student_id' => $this->student->id,
            'grade_level_discount_id' => $gradeDiscount->id,
            'academic_year' => self::YEAR,
            'voided_at' => now(),
            'void_note' => 'Not eligible',
        ]);

        $data = $this->ledger();

        $this->assertEquals(0.0, $data['totals']['discounts']);
        $this->assertEquals(0.0, $this->breakdownFor($data, $this->tuition->id)['discount']);
        $this->assertEquals(8000.0, $this->breakdownFor($data, $this->tuition->id)['outstanding']);
    }
}
