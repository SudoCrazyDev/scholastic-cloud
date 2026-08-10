<?php

namespace Tests\Feature;

use App\Models\ClassSection;
use App\Models\GradeLevelDiscount;
use App\Models\GradeLevelDiscountStudentVoid;
use App\Models\Institution;
use App\Models\Role;
use App\Models\SchoolFee;
use App\Models\SchoolFeeDefault;
use App\Models\Student;
use App\Models\StudentAdditionalFee;
use App\Models\StudentDiscount;
use App\Models\StudentInstitution;
use App\Models\StudentPayment;
use App\Models\StudentSection;
use App\Models\User;
use App\Models\UserInstitution;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The Finance dashboard's per-student listing.
 *
 * What matters here is that a row says the same thing the student's own ledger says —
 * charges, discounts, what was carried in from an earlier year — and that the list is
 * ordered the way a cashier reads it: by grade level, alphabetically within the grade.
 */
class FinanceDashboardStudentsTest extends TestCase
{
    use RefreshDatabase;

    private const YEAR = '2026-2027';
    private const PRIOR_YEAR = '2025-2026';

    private Institution $institution;
    private SchoolFee $tuition;
    private SchoolFee $miscellaneous;

    protected function setUp(): void
    {
        parent::setUp();

        $this->institution = Institution::factory()->create();

        $this->tuition = SchoolFee::create([
            'institution_id' => $this->institution->id,
            'name' => 'Tuition Fee',
            'is_active' => true,
        ]);
        $this->miscellaneous = SchoolFee::create([
            'institution_id' => $this->institution->id,
            'name' => 'Miscellaneous Fee',
            'is_active' => true,
        ]);
    }

    private function makeUser(string $token): User
    {
        $role = Role::firstOrCreate(
            ['slug' => 'principal', 'institution_id' => $this->institution->id],
            ['title' => 'Principal'],
        );

        // finance.view as well, so a test can hold a row up against the ledger it came from.
        foreach (['finance-reports.view', 'finance.view'] as $permission) {
            \DB::table('role_permissions')->insertOrIgnore([
                'role_id' => $role->id,
                'permission' => $permission,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        $user = User::factory()->create([
            'token' => $token,
            'token_expiry' => now()->addDay()->toDateTimeString(),
        ]);
        UserInstitution::factory()->create([
            'user_id' => $user->id,
            'institution_id' => $this->institution->id,
            'role_id' => $role->id,
            'is_default' => true,
            'is_main' => true,
        ]);

        return $user;
    }

    private function makeSection(string $gradeLevel, string $title): ClassSection
    {
        return ClassSection::create([
            'institution_id' => $this->institution->id,
            'grade_level' => $gradeLevel,
            'title' => $title,
            'academic_year' => self::YEAR,
        ]);
    }

    private function enrol(
        ClassSection $section,
        string $firstName,
        string $lastName,
        ?string $middleName = null,
        string $year = self::YEAR
    ): Student {
        $student = Student::create([
            'first_name' => $firstName,
            'middle_name' => $middleName,
            'last_name' => $lastName,
            'gender' => 'female',
            'birthdate' => '2013-05-04',
            'is_active' => true,
        ]);
        StudentInstitution::create([
            'student_id' => $student->id,
            'institution_id' => $this->institution->id,
            'is_active' => true,
            'academic_year' => $year,
        ]);
        StudentSection::create([
            'student_id' => $student->id,
            'section_id' => $section->id,
            'academic_year' => $year,
            'is_active' => true,
        ]);

        return $student;
    }

    private function setFeeAmount(SchoolFee $fee, string $gradeLevel, float $amount, string $year = self::YEAR): void
    {
        SchoolFeeDefault::create([
            'institution_id' => $this->institution->id,
            'school_fee_id' => $fee->id,
            'grade_level' => $gradeLevel,
            'academic_year' => $year,
            'amount' => $amount,
        ]);
    }

    private int $receiptCounter = 0;

    private function pay(Student $student, float $amount, string $year = self::YEAR, array $attributes = []): StudentPayment
    {
        $this->receiptCounter++;

        return StudentPayment::create(array_merge([
            'institution_id' => $this->institution->id,
            'student_id' => $student->id,
            'academic_year' => $year,
            'school_fee_id' => $this->tuition->id,
            'receipt_number' => 'RCPT-' . $this->receiptCounter,
            'amount' => $amount,
            'payment_date' => $year === self::YEAR ? '2026-08-01' : '2025-08-01',
        ], $attributes));
    }

    private function fetch(string $token, array $params = [])
    {
        return $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson('/api/finance/dashboard/students?' . http_build_query(array_merge(
                ['academic_year' => self::YEAR],
                $params
            )));
    }

    public function test_lists_students_by_grade_level_then_alphabetically(): void
    {
        $this->makeUser('list-token');

        $grade10 = $this->makeSection('Grade 10', 'Rizal');
        $grade2 = $this->makeSection('Grade 2', 'Sampaguita');
        $kinder = $this->makeSection('Kinder 2', 'Bright Stars');

        $this->enrol($grade10, 'Ana', 'Reyes');
        $this->enrol($grade2, 'Bea', 'Santos');
        $this->enrol($grade2, 'Carlo', 'Aquino');
        $this->enrol($kinder, 'Dina', 'Lopez');

        $response = $this->fetch('list-token')->assertOk();

        $rows = collect($response->json('data.students'));
        $this->assertSame(
            ['Kinder 2', 'Grade 2', 'Grade 2', 'Grade 10'],
            $rows->pluck('grade_level')->all(),
            'Grade levels must read in school order, not alphabetically.'
        );
        $this->assertSame(
            ['Lopez', 'Aquino', 'Santos', 'Reyes'],
            $rows->pluck('last_name')->all(),
            'Students must be alphabetical within their grade level.'
        );

        // The filter dropdowns are built from the year, in the same order.
        $this->assertSame(
            ['Kinder 2', 'Grade 2', 'Grade 10'],
            $response->json('data.grade_levels')
        );
        $this->assertSame(
            ['Bright Stars', 'Sampaguita', 'Rizal'],
            collect($response->json('data.sections'))->pluck('title')->all()
        );
    }

    public function test_name_is_listed_as_last_name_comma_first_name_middle_initial(): void
    {
        $this->makeUser('name-token');
        $section = $this->makeSection('Grade 3', 'Mabini');
        $this->enrol($section, 'Juan', 'Dela Cruz', 'Panganiban');

        $response = $this->fetch('name-token')->assertOk();

        $this->assertSame('Dela Cruz, Juan P.', $response->json('data.students.0.display_name'));
    }

    public function test_payable_and_remaining_balance_match_the_ledger(): void
    {
        $this->makeUser('totals-token');
        $section = $this->makeSection('Grade 5', 'Bonifacio');
        $student = $this->enrol($section, 'Maria', 'Cruz');

        $this->setFeeAmount($this->tuition, 'Grade 5', 20000);
        $this->setFeeAmount($this->miscellaneous, 'Grade 5', 5000);

        // A charge for this student alone, on top of the grade's standard fees.
        StudentAdditionalFee::create([
            'institution_id' => $this->institution->id,
            'student_id' => $student->id,
            'academic_year' => self::YEAR,
            'name' => 'Laboratory Fee',
            'billing_type' => StudentAdditionalFee::BILLING_CASH,
            'source' => StudentAdditionalFee::SOURCE_MANUAL,
            'amount' => 1500,
        ]);

        // 10% off tuition, and a flat discount against the whole bill.
        StudentDiscount::create([
            'institution_id' => $this->institution->id,
            'student_id' => $student->id,
            'school_fee_id' => $this->tuition->id,
            'academic_year' => self::YEAR,
            'discount_type' => 'percentage',
            'value' => 10,
        ]);
        StudentDiscount::create([
            'institution_id' => $this->institution->id,
            'student_id' => $student->id,
            'academic_year' => self::YEAR,
            'discount_type' => 'fixed',
            'value' => 500,
        ]);

        $this->pay($student, 8000);
        // A voided payment settles nothing, so it must not reduce the balance.
        $this->pay($student, 3000, self::YEAR, [
            'voided_at' => now(),
            'void_note' => 'wrong student',
        ]);

        $row = $this->fetch('totals-token')->assertOk()->json('data.students.0');

        // The grade's fees and the student's own are reported apart, and still add back up.
        $this->assertEquals(25000, $row['school_fees']);  // 20000 + 5000
        $this->assertEquals(1500, $row['student_fees']);  // Laboratory Fee
        $this->assertEquals(26500, $row['charges']);
        $this->assertEquals(2500, $row['discounts']);     // 2000 + 500

        // Total payable, disassembled: every discount comes off the school-fee side, the
        // student-fee side is its charges as billed, and the parts are the total.
        $this->assertEquals(22500, $row['school_fees_payable']);  // 25000 - 2500
        $this->assertEquals(1500, $row['student_fees_payable']);
        $this->assertEquals(0, $row['balance_forward']);
        $this->assertEquals(24000, $row['total_payable']);
        $this->assertEquals(
            $row['total_payable'],
            $row['school_fees_payable'] + $row['student_fees_payable'] + $row['balance_forward']
        );

        $this->assertEquals(8000, $row['total_paid']);
        $this->assertEquals(16000, $row['remaining_balance']);
        $this->assertEquals(1, $row['other_fee_count']);

        // The student's own ledger has to agree, or the cashier is reading two numbers.
        $ledger = $this->withHeader('Authorization', 'Bearer totals-token')
            ->getJson("/api/students/{$student->id}/ledger?academic_year=" . self::YEAR)
            ->assertOk()
            ->json('data.totals');

        $this->assertEquals($row['charges'], $ledger['charges']);
        $this->assertEquals($row['discounts'], $ledger['discounts']);
        $this->assertEquals($row['remaining_balance'], $ledger['balance']);
    }

    public function test_unpaid_earlier_year_is_carried_into_the_payable(): void
    {
        $this->makeUser('carry-token');

        $priorSection = ClassSection::create([
            'institution_id' => $this->institution->id,
            'grade_level' => 'Grade 4',
            'title' => 'Luna',
            'academic_year' => self::PRIOR_YEAR,
        ]);
        $section = $this->makeSection('Grade 5', 'Bonifacio');

        $student = $this->enrol($section, 'Pedro', 'Torres');
        StudentSection::create([
            'student_id' => $student->id,
            'section_id' => $priorSection->id,
            'academic_year' => self::PRIOR_YEAR,
            'is_active' => false,
        ]);

        $this->setFeeAmount($this->tuition, 'Grade 5', 10000);
        $this->setFeeAmount($this->tuition, 'Grade 4', 8000, self::PRIOR_YEAR);
        $this->pay($student, 6000, self::PRIOR_YEAR);

        $row = $this->fetch('carry-token')->assertOk()->json('data.students.0');

        $this->assertEquals(2000, $row['balance_forward']);
        $this->assertEquals(12000, $row['total_payable']);
        $this->assertEquals(12000, $row['remaining_balance']);
        // What was carried in is its own part of the payable, not folded into either fee side.
        $this->assertEquals(10000, $row['school_fees_payable']);
        $this->assertEquals(0, $row['student_fees_payable']);
    }

    public function test_grade_level_discount_applies_unless_voided_for_the_student(): void
    {
        $this->makeUser('grade-discount-token');
        $section = $this->makeSection('Grade 6', 'Del Pilar');
        $shared = $this->enrol($section, 'Alma', 'Bautista');
        $exempt = $this->enrol($section, 'Bruno', 'Castro');

        $this->setFeeAmount($this->tuition, 'Grade 6', 15000);

        $discount = GradeLevelDiscount::create([
            'institution_id' => $this->institution->id,
            'school_fee_id' => $this->tuition->id,
            'grade_level' => 'Grade 6',
            'academic_year' => self::YEAR,
            'discount_type' => 'fixed',
            'value' => 1000,
        ]);
        GradeLevelDiscountStudentVoid::create([
            'institution_id' => $this->institution->id,
            'student_id' => $exempt->id,
            'grade_level_discount_id' => $discount->id,
            'academic_year' => self::YEAR,
            'voided_at' => now(),
            'void_note' => 'not eligible',
        ]);

        $rows = collect($this->fetch('grade-discount-token')->assertOk()->json('data.students'))
            ->keyBy('id');

        $this->assertEquals(1000, $rows[$shared->id]['discounts']);
        $this->assertEquals(14000, $rows[$shared->id]['total_payable']);
        $this->assertEquals(14000, $rows[$shared->id]['school_fees_payable']);
        $this->assertEquals(0, $rows[$exempt->id]['discounts']);
        $this->assertEquals(15000, $rows[$exempt->id]['total_payable']);
        $this->assertEquals(15000, $rows[$exempt->id]['school_fees_payable']);
    }

    public function test_filters_narrow_the_list_without_narrowing_the_filter_options(): void
    {
        $this->makeUser('filter-token');

        $grade1A = $this->makeSection('Grade 1', 'Aguinaldo');
        $grade1B = $this->makeSection('Grade 1', 'Burgos');
        $grade2 = $this->makeSection('Grade 2', 'Sampaguita');

        $this->enrol($grade1A, 'Ana', 'Reyes');
        $this->enrol($grade1B, 'Bea', 'Santos');
        $this->enrol($grade2, 'Carlo', 'Aquino');

        $byGrade = $this->fetch('filter-token', ['grade_level' => 'Grade 1'])->assertOk();
        $this->assertSame(['Reyes', 'Santos'], collect($byGrade->json('data.students'))->pluck('last_name')->all());
        // Filtering to one grade must still offer the others.
        $this->assertSame(['Grade 1', 'Grade 2'], $byGrade->json('data.grade_levels'));
        $this->assertCount(3, $byGrade->json('data.sections'));

        $bySection = $this->fetch('filter-token', ['section_id' => $grade1B->id])->assertOk();
        $this->assertSame(['Santos'], collect($bySection->json('data.students'))->pluck('last_name')->all());
    }

    /**
     * A late fee only exists once something books it, and only a ledger/NOA load does that.
     * So the listing legitimately does not know about a surcharge that has just fallen due —
     * and once opening the student books it, the next listing has to pick it up. The UI relies
     * on exactly this: it refetches the list when a ledger reports fees the row lacked.
     */
    public function test_a_late_fee_reaches_the_list_once_a_ledger_load_has_booked_it(): void
    {
        $this->makeUser('late-fee-token');
        $section = $this->makeSection('Grade 9', 'Lapu-Lapu');
        $student = $this->enrol($section, 'Rita', 'Navarro');

        $this->setFeeAmount($this->tuition, 'Grade 9', 10000);

        // One installment, the whole bill, due long before "now" with no grace left.
        $plan = \App\Models\PaymentPlan::create([
            'institution_id' => $this->institution->id,
            'name' => 'Full within June',
            'advance_payment_mode' => \App\Models\PaymentPlan::ADVANCE_EQUAL_SPLIT,
            'surcharge_mode' => \App\Models\PaymentPlan::SURCHARGE_PER_INSTALLMENT,
            'is_active' => true,
        ]);
        \App\Models\PaymentPlanInstallment::create([
            'payment_plan_id' => $plan->id,
            'sequence' => 1,
            'label' => 'June',
            'due_month' => 6,
            'due_day' => 15,
            'grace_period_days' => 0,
            'late_fee_percentage' => 2,
            'share_percentage' => 100,
        ]);
        \App\Models\StudentPaymentPlan::create([
            'institution_id' => $this->institution->id,
            'student_id' => $student->id,
            'academic_year' => self::YEAR,
            'payment_plan_id' => $plan->id,
        ]);

        // Nothing has loaded this student's ledger yet, so no surcharge has been charged.
        $before = $this->fetch('late-fee-token')->assertOk()->json('data.students.0');
        $this->assertEquals(0, $before['student_fees']);
        $this->assertEquals(0, $before['other_fee_count']);
        $this->assertEquals(10000, $before['total_payable']);

        // Opening the student is what books it — 2% of the overdue 10,000.
        $ledger = $this->withHeader('Authorization', 'Bearer late-fee-token')
            ->getJson("/api/students/{$student->id}/ledger?academic_year=" . self::YEAR)
            ->assertOk();
        $this->assertEquals(200, $ledger->json('data.totals.late_fees'));

        // …and now the list agrees, which is what makes the refetch on open self-healing.
        $after = $this->fetch('late-fee-token')->assertOk()->json('data.students.0');
        $this->assertEquals(200, $after['student_fees']);
        $this->assertEquals(200, $after['student_fees_payable']);
        $this->assertEquals(1, $after['other_fee_count']);
        $this->assertEquals(10200, $after['total_payable']);
        $this->assertEquals(
            $ledger->json('data.totals.balance'),
            $after['remaining_balance'],
            'Once the surcharge is booked the row and the ledger must agree.'
        );
    }

    public function test_students_not_enrolled_for_the_year_are_left_out(): void
    {
        $this->makeUser('roster-token');

        $priorSection = ClassSection::create([
            'institution_id' => $this->institution->id,
            'grade_level' => 'Grade 8',
            'title' => 'Graduated',
            'academic_year' => self::PRIOR_YEAR,
        ]);
        $this->enrol($priorSection, 'Gone', 'Lastyear', null, self::PRIOR_YEAR);

        $response = $this->fetch('roster-token')->assertOk();

        $this->assertSame([], $response->json('data.students'));
        $this->assertSame([], $response->json('data.grade_levels'));
    }
}
