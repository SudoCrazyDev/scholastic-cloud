<?php

namespace Tests\Feature;

use App\Models\Institution;
use App\Models\SchoolFee;
use App\Models\Student;
use App\Models\StudentAdditionalFee;
use App\Models\StudentInstitution;
use App\Models\User;
use App\Models\UserInstitution;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * A payment settles either a school fee or a student fee, and the collection report
 * only ever read the school fee. Everything collected against a student fee — an
 * ad-hoc charge from the ledger, a late fee — was therefore filed under
 * "General / Other", which named neither what was paid nor how much of the day's
 * takings it accounted for. Student fees now get their own breakdown.
 */
class CollectionReportStudentFeeTest extends TestCase
{
    use RefreshDatabase;

    private const YEAR = '2026-2027';
    private const PAID_ON = '2026-08-04';

    private Institution $institution;
    private Student $student;
    private SchoolFee $tuition;

    protected function setUp(): void
    {
        parent::setUp();

        Carbon::setTestNow(self::PAID_ON . ' 09:00:00');

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
            'first_name' => 'Collection',
            'last_name' => 'Tester',
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

        $this->tuition = SchoolFee::create([
            'institution_id' => $this->institution->id,
            'name' => 'Tuition',
            'is_active' => true,
        ]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function studentFee(string $name, float $amount): StudentAdditionalFee
    {
        return StudentAdditionalFee::create([
            'institution_id' => $this->institution->id,
            'student_id' => $this->student->id,
            'academic_year' => self::YEAR,
            'name' => $name,
            'amount' => $amount,
            'billing_type' => StudentAdditionalFee::BILLING_CASH,
            'source' => StudentAdditionalFee::SOURCE_MANUAL,
        ]);
    }

    private function pay(array $item): void
    {
        $this->withHeader('Authorization', 'Bearer test-token')
            ->postJson('/api/student-payments', [
                'student_id' => $this->student->id,
                'academic_year' => self::YEAR,
                'payment_date' => self::PAID_ON,
                'payment_method' => 'CASH',
                'items' => [$item],
            ])->assertCreated();
    }

    private function report(): array
    {
        return $this->withHeader('Authorization', 'Bearer test-token')
            ->getJson('/api/finance/collections/report?start_date=' . self::PAID_ON . '&end_date=' . self::PAID_ON)
            ->assertOk()
            ->json('data');
    }

    private function row(array $rows, string $label): ?array
    {
        return collect($rows)->firstWhere('label', $label);
    }

    /**
     * The reported gap: a student fee is named in its own breakdown rather than
     * swept into the school-fee table's catch-all row.
     */
    public function test_a_student_fee_is_reported_under_its_own_name(): void
    {
        $this->pay(['school_fee_id' => $this->tuition->id, 'amount' => 1000]);
        $this->pay(['additional_fee_id' => $this->studentFee('Field Trip', 500)->id, 'amount' => 500]);

        $data = $this->report();

        $this->assertEquals(1500.0, $data['summary']['total_collected']);

        $fieldTrip = $this->row($data['by_student_fee'], 'Field Trip');
        $this->assertNotNull($fieldTrip);
        $this->assertEquals(500.0, $fieldTrip['amount']);
        $this->assertEquals(1, $fieldTrip['entries']);

        // The school-fee table keeps its own money and nothing more: no
        // "General / Other" row standing in for the student fee.
        $this->assertEquals(1000.0, $this->row($data['by_fee'], 'Tuition')['amount']);
        $this->assertNull($this->row($data['by_fee'], 'General / Other'));
    }

    /**
     * The two fee breakdowns partition the takings, so an entry counted in one is
     * never counted in the other — otherwise the tables would overstate the day.
     */
    public function test_the_two_fee_breakdowns_add_up_to_what_was_collected(): void
    {
        $this->pay(['school_fee_id' => $this->tuition->id, 'amount' => 1000]);
        $this->pay(['additional_fee_id' => $this->studentFee('Field Trip', 500)->id, 'amount' => 500]);
        $this->pay(['additional_fee_id' => $this->studentFee('Late Fee', 250)->id, 'amount' => 250]);
        // Neither fee named — the genuine "General / Other" case.
        $this->pay(['amount' => 300]);

        $data = $this->report();

        $schoolFeeTotal = collect($data['by_fee'])->sum('amount');
        $studentFeeTotal = collect($data['by_student_fee'])->sum('amount');

        $this->assertEquals(1300.0, $schoolFeeTotal);
        $this->assertEquals(750.0, $studentFeeTotal);
        $this->assertEquals(
            $data['summary']['total_collected'],
            $schoolFeeTotal + $studentFeeTotal
        );

        $this->assertEquals(300.0, $this->row($data['by_fee'], 'General / Other')['amount']);
        $this->assertEquals(2, count($data['by_student_fee']));
    }

    /**
     * Two students charged the same fee are one line, the way the school thinks of
     * it — "how much did the field trip bring in today".
     */
    public function test_the_same_fee_charged_twice_is_one_line(): void
    {
        $this->pay(['additional_fee_id' => $this->studentFee('Field Trip', 500)->id, 'amount' => 500]);
        $this->pay(['additional_fee_id' => $this->studentFee('Field Trip', 500)->id, 'amount' => 200]);

        $data = $this->report();

        $this->assertCount(1, $data['by_student_fee']);
        $this->assertEquals(700.0, $this->row($data['by_student_fee'], 'Field Trip')['amount']);
        $this->assertEquals(2, $this->row($data['by_student_fee'], 'Field Trip')['entries']);
    }

    /**
     * Waiving a fee soft-deletes it while the money already taken against it stays
     * on the books, so the name has to outlive the charge or the report would lose
     * track of collections it still has to account for.
     */
    public function test_a_waived_fee_still_names_the_money_taken_against_it(): void
    {
        $fee = $this->studentFee('Field Trip', 500);
        $this->pay(['additional_fee_id' => $fee->id, 'amount' => 500]);
        $fee->delete();

        $data = $this->report();

        $this->assertEquals(500.0, $data['summary']['total_collected']);
        $this->assertEquals(500.0, $this->row($data['by_student_fee'], 'Field Trip')['amount']);
    }

    /**
     * A voided entry is excluded from the report everywhere else; the new breakdown
     * has to honour that too.
     */
    public function test_a_voided_student_fee_payment_is_left_out(): void
    {
        $this->pay(['additional_fee_id' => $this->studentFee('Field Trip', 500)->id, 'amount' => 500]);
        \App\Models\StudentPayment::query()->update(['voided_at' => now()]);

        $data = $this->report();

        $this->assertEquals(0.0, $data['summary']['total_collected']);
        $this->assertSame([], $data['by_student_fee']);
    }
}
