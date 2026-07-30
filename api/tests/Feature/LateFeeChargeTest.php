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
use App\Models\StudentPayment;
use App\Models\StudentPaymentPlan;
use App\Models\StudentSection;
use App\Models\User;
use App\Models\UserInstitution;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * Late fees on overdue payment-plan installments are booked as real charges, so they
 * survive settlement of the installment and can be collected at the cashier.
 */
class LateFeeChargeTest extends TestCase
{
    use RefreshDatabase;

    private const YEAR = '2026-2027';

    private User $user;
    private Institution $institution;
    private Student $student;
    private SchoolFee $tuitionFee;

    protected function setUp(): void
    {
        parent::setUp();

        // First installment is overdue on this date, the second is not.
        Carbon::setTestNow('2026-09-30 08:00:00');

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
            'first_name' => 'Late',
            'last_name' => 'Payer',
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
            'amount' => 10000,
        ]);

        $plan = PaymentPlan::create([
            'institution_id' => $this->institution->id,
            'name' => 'Semestral',
            'is_active' => true,
            'sort_order' => 1,
        ]);
        // Due 2026-08-01 (+15 days grace -> overdue after 2026-08-16) and 2026-10-01.
        PaymentPlanInstallment::create([
            'payment_plan_id' => $plan->id,
            'sequence' => 1,
            'label' => 'First Semester',
            'due_month' => 8,
            'due_day' => 1,
            'grace_period_days' => 15,
            'late_fee_percentage' => 3,
            'share_percentage' => 50,
        ]);
        PaymentPlanInstallment::create([
            'payment_plan_id' => $plan->id,
            'sequence' => 2,
            'label' => 'Second Semester',
            'due_month' => 10,
            'due_day' => 1,
            'grace_period_days' => 15,
            'late_fee_percentage' => 3,
            'share_percentage' => 50,
        ]);

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

    private function noa(): array
    {
        return $this->withHeader('Authorization', 'Bearer test-token')
            ->getJson("/api/students/{$this->student->id}/noa?academic_year=" . self::YEAR)
            ->assertOk()
            ->json('data');
    }

    public function test_overdue_installment_books_a_late_fee_charge(): void
    {
        $data = $this->ledger();

        // 10,000 split 50/50; 3% of the overdue 5,000 installment.
        $this->assertEquals(150.0, $data['totals']['late_fees']);
        $this->assertEquals(10150.0, $data['totals']['charges']);
        $this->assertEquals(10150.0, $data['totals']['balance']);

        $fee = StudentAdditionalFee::lateFees()->sole();
        $this->assertSame(1, (int) $fee->installment_sequence);
        $this->assertEquals(150.0, (float) $fee->amount);
        $this->assertEquals(5000.0, (float) $fee->base_amount);
        $this->assertEquals(3.0, (float) $fee->late_fee_percentage);

        $lateFeeEntry = collect($data['entries'])->firstWhere('source', 'late_fee');
        $this->assertNotNull($lateFeeEntry, 'The late fee should appear in the ledger.');
        $this->assertEquals(150.0, $lateFeeEntry['amount']);
        $this->assertSame('2026-08-16', $lateFeeEntry['date']);
        $this->assertStringContainsString('3% overdue', $lateFeeEntry['description']);

        // The schedule reports the charged amount, and the split ignores the late fee.
        $installments = collect($data['installments']);
        $this->assertEquals(5000.0, $installments->firstWhere('sequence', 1)['amount']);
        $this->assertEquals(150.0, $installments->firstWhere('sequence', 1)['late_fee_amount']);
        $this->assertTrue($installments->firstWhere('sequence', 1)['late_fee_applied']);
        $this->assertEquals(0.0, $installments->firstWhere('sequence', 2)['late_fee_amount']);
    }

    public function test_reloading_the_ledger_does_not_duplicate_the_charge(): void
    {
        $this->ledger();
        $this->ledger();
        $second = $this->ledger();

        $this->assertSame(1, StudentAdditionalFee::lateFees()->count());
        $this->assertEquals(150.0, $second['totals']['late_fees']);
    }

    public function test_late_fee_survives_payment_of_the_installment(): void
    {
        $this->ledger();

        $this->withHeader('Authorization', 'Bearer test-token')
            ->postJson('/api/student-payments', [
                'student_id' => $this->student->id,
                'academic_year' => self::YEAR,
                'amount' => 5000,
                'school_fee_id' => $this->tuitionFee->id,
            ])->assertCreated();

        $data = $this->ledger();

        $this->assertSame(1, StudentAdditionalFee::lateFees()->count());
        $this->assertEquals(150.0, $data['totals']['late_fees']);
        $this->assertEquals(5150.0, $data['totals']['balance']);

        $first = collect($data['installments'])->firstWhere('sequence', 1);
        $this->assertSame('paid', $first['status']);
        $this->assertEquals(150.0, $first['late_fee_amount'], 'Settling the installment must not erase the fee.');
    }

    public function test_late_fee_is_collectible_at_the_cashier(): void
    {
        $this->ledger();
        $lateFee = StudentAdditionalFee::lateFees()->sole();

        $breakdown = collect($this->ledger()['fee_breakdown'])->firstWhere('fee_id', $lateFee->id);
        $this->assertNotNull($breakdown, 'The late fee needs its own collectible line.');
        $this->assertSame('late_fee', $breakdown['source']);
        $this->assertEquals(150.0, $breakdown['outstanding']);

        $this->withHeader('Authorization', 'Bearer test-token')
            ->postJson('/api/student-payments', [
                'student_id' => $this->student->id,
                'academic_year' => self::YEAR,
                'items' => [
                    ['additional_fee_id' => $lateFee->id, 'amount' => 150],
                ],
            ])->assertCreated();

        $this->assertSame(
            $lateFee->id,
            StudentPayment::whereNotNull('student_additional_fee_id')->sole()->student_additional_fee_id
        );

        $data = $this->ledger();
        $settled = collect($data['fee_breakdown'])->firstWhere('fee_id', $lateFee->id);
        $this->assertEquals(150.0, $settled['paid']);
        $this->assertEquals(0.0, $settled['outstanding']);
        $this->assertEquals(10000.0, $data['totals']['balance']);

        // Collecting the fee must not be mistaken for paying down the installments.
        $this->assertEquals(0.0, collect($data['installments'])->firstWhere('sequence', 1)['paid_amount']);
    }

    public function test_notice_of_account_agrees_with_the_ledger(): void
    {
        $ledger = $this->ledger();
        $noa = $this->noa();

        $this->assertEquals($ledger['totals']['balance'], $noa['totals']['balance']);
        $this->assertEquals(150.0, $noa['totals']['late_fees']);

        $lateFeeLine = collect($noa['fees'])->firstWhere('source', 'late_fee');
        $this->assertNotNull($lateFeeLine, 'The notice of account should itemize the late fee.');
        $this->assertEquals(150.0, $lateFeeLine['amount']);
    }

    public function test_notice_of_account_books_the_charge_on_its_own(): void
    {
        $this->noa();

        $this->assertSame(1, StudentAdditionalFee::lateFees()->count());
        $this->assertEquals(150.0, $this->ledger()['totals']['late_fees']);
    }

    public function test_waiving_the_late_fee_removes_it_from_the_balance(): void
    {
        $this->ledger();
        $lateFee = StudentAdditionalFee::lateFees()->sole();

        $this->withHeader('Authorization', 'Bearer test-token')
            ->deleteJson("/api/student-additional-fees/{$lateFee->id}", [
                'note' => 'Approved by finance head',
            ])
            ->assertOk();

        $data = $this->ledger();
        $this->assertEquals(10000.0, $data['totals']['charges']);
        $this->assertEquals(10000.0, $data['totals']['balance']);
        $this->assertEmpty(collect($data['entries'])->where('source', 'late_fee'));

        // The installment is still overdue, so the waiver has to survive further loads.
        $this->assertEquals(0.0, $this->ledger()['totals']['late_fees']);
        $this->assertSame(0, StudentAdditionalFee::lateFees()->count());
        $this->assertSame(1, StudentAdditionalFee::lateFees()->withTrashed()->count());
    }

    public function test_waiving_a_late_fee_requires_a_reason(): void
    {
        $this->ledger();
        $lateFee = StudentAdditionalFee::lateFees()->sole();

        $this->withHeader('Authorization', 'Bearer test-token')
            ->deleteJson("/api/student-additional-fees/{$lateFee->id}")
            ->assertStatus(422)
            ->assertJsonValidationErrors('note');

        // Rejected outright: the charge is still standing.
        $this->assertSame(1, StudentAdditionalFee::lateFees()->count());
        $this->assertEquals(150.0, $this->ledger()['totals']['late_fees']);
    }

    public function test_waiving_records_who_did_it_and_why(): void
    {
        $this->ledger();
        $lateFee = StudentAdditionalFee::lateFees()->sole();

        $this->withHeader('Authorization', 'Bearer test-token')
            ->deleteJson("/api/student-additional-fees/{$lateFee->id}", [
                'note' => 'Family hardship — approved',
            ])
            ->assertOk();

        $waived = StudentAdditionalFee::withTrashed()->find($lateFee->id);
        $this->assertNotNull($waived->deleted_at);
        $this->assertSame('Family hardship — approved', $waived->waive_note);
        $this->assertSame($this->user->id, $waived->deleted_by);
    }

    public function test_a_waived_late_fee_can_be_restored(): void
    {
        $this->ledger();
        $lateFee = StudentAdditionalFee::lateFees()->sole();

        $this->withHeader('Authorization', 'Bearer test-token')
            ->deleteJson("/api/student-additional-fees/{$lateFee->id}", ['note' => 'Waived in error'])
            ->assertOk();
        $this->assertEquals(0.0, $this->ledger()['totals']['late_fees']);

        $this->withHeader('Authorization', 'Bearer test-token')
            ->postJson("/api/student-additional-fees/{$lateFee->id}/restore")
            ->assertOk();

        // Back on the balance at the amount originally booked, with the stamp cleared.
        $restored = StudentAdditionalFee::find($lateFee->id);
        $this->assertNotNull($restored);
        $this->assertNull($restored->deleted_at);
        $this->assertNull($restored->deleted_by);
        $this->assertNull($restored->waive_note);

        $data = $this->ledger();
        $this->assertEquals(150.0, $data['totals']['late_fees']);
        $this->assertEquals(10150.0, $data['totals']['balance']);
        $this->assertSame(1, StudentAdditionalFee::lateFees()->count());
    }

    public function test_restoring_a_fee_that_was_never_waived_is_rejected(): void
    {
        $this->ledger();
        $lateFee = StudentAdditionalFee::lateFees()->sole();

        $this->withHeader('Authorization', 'Bearer test-token')
            ->postJson("/api/student-additional-fees/{$lateFee->id}/restore")
            ->assertStatus(404);
    }

    public function test_waived_fees_are_listed_only_when_asked_for(): void
    {
        $this->ledger();
        $lateFee = StudentAdditionalFee::lateFees()->sole();

        $this->withHeader('Authorization', 'Bearer test-token')
            ->deleteJson("/api/student-additional-fees/{$lateFee->id}", ['note' => 'Waived in error'])
            ->assertOk();

        $hidden = $this->withHeader('Authorization', 'Bearer test-token')
            ->getJson('/api/student-additional-fees?student_id=' . $this->student->id
                . '&academic_year=' . self::YEAR)
            ->assertOk()
            ->json('data');
        $this->assertEmpty(collect($hidden)->where('source', 'late_fee'));

        $shown = $this->withHeader('Authorization', 'Bearer test-token')
            ->getJson('/api/student-additional-fees?student_id=' . $this->student->id
                . '&academic_year=' . self::YEAR . '&with_waived=1')
            ->assertOk()
            ->json('data');

        $row = collect($shown)->firstWhere('source', 'late_fee');
        $this->assertNotNull($row, 'The waived late fee should be listed with with_waived.');
        $this->assertNotNull($row['deleted_at']);
        $this->assertSame('Waived in error', $row['waive_note']);
    }

    public function test_no_late_fee_before_the_grace_window_elapses(): void
    {
        // Two days after the due date, still inside the 15-day grace window.
        Carbon::setTestNow('2026-08-03 08:00:00');

        $data = $this->ledger();

        $this->assertSame(0, StudentAdditionalFee::lateFees()->count());
        $this->assertEquals(0.0, $data['totals']['late_fees']);
        $this->assertEquals(10000.0, $data['totals']['balance']);
    }

    public function test_payment_line_cannot_target_both_fee_kinds(): void
    {
        $this->ledger();
        $lateFee = StudentAdditionalFee::lateFees()->sole();

        $this->withHeader('Authorization', 'Bearer test-token')
            ->postJson('/api/student-payments', [
                'student_id' => $this->student->id,
                'academic_year' => self::YEAR,
                'items' => [
                    [
                        'school_fee_id' => $this->tuitionFee->id,
                        'additional_fee_id' => $lateFee->id,
                        'amount' => 150,
                    ],
                ],
            ])->assertStatus(422);

        $this->assertSame(0, StudentPayment::count());
    }

    public function test_additional_fee_must_belong_to_the_student(): void
    {
        $other = Student::create([
            'first_name' => 'Other',
            'last_name' => 'Student',
            'gender' => 'female',
            'birthdate' => '2012-01-01',
            'is_active' => true,
        ]);
        StudentInstitution::create([
            'student_id' => $other->id,
            'institution_id' => $this->institution->id,
            'is_active' => true,
            'academic_year' => self::YEAR,
        ]);

        $foreignFee = StudentAdditionalFee::create([
            'institution_id' => $this->institution->id,
            'student_id' => $other->id,
            'academic_year' => self::YEAR,
            'name' => 'Late Fee — First Semester',
            'source' => StudentAdditionalFee::SOURCE_LATE_FEE,
            'installment_sequence' => 1,
            'late_fee_percentage' => 3,
            'base_amount' => 5000,
            'amount' => 150,
        ]);

        $this->withHeader('Authorization', 'Bearer test-token')
            ->postJson('/api/student-payments', [
                'student_id' => $this->student->id,
                'academic_year' => self::YEAR,
                'items' => [
                    ['additional_fee_id' => $foreignFee->id, 'amount' => 150],
                ],
            ])->assertStatus(404);

        $this->assertSame(0, StudentPayment::count());
    }
}
