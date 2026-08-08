<?php

namespace Tests\Feature;

use App\Models\DefaultDiscount;
use App\Models\Institution;
use App\Models\PaymentPlan;
use App\Models\PaymentPlanInstallment;
use App\Models\PaymentTransaction;
use App\Models\Role;
use App\Models\SchoolFee;
use App\Models\SchoolFeeDefault;
use App\Models\Student;
use App\Models\StudentAdditionalFee;
use App\Models\StudentDiscount;
use App\Models\StudentInstitution;
use App\Models\StudentPayment;
use App\Models\StudentPaymentPlan;
use App\Models\User;
use App\Models\UserInstitution;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Clearing a year's Finance data.
 *
 * The cases that matter are the ones about what *survives*: the other academic
 * year, the three excluded areas, and any row that would have been silently
 * stranded by a CASCADE or SET NULL the operator never saw.
 */
class FinanceDataClearTest extends TestCase
{
    use RefreshDatabase;

    private const YEAR = '2026-2027';
    private const OTHER_YEAR = '2025-2026';

    private Institution $institution;
    private Student $student;
    private SchoolFee $tuition;

    protected function setUp(): void
    {
        parent::setUp();

        $this->institution = Institution::factory()->create();

        $this->student = Student::create([
            'first_name' => 'Clear',
            'last_name' => 'Test',
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
            'name' => 'Tuition Fee',
            'is_active' => true,
        ]);
    }

    private function makeUser(string $token, array $permissions, string $roleSlug = 'principal'): User
    {
        $role = Role::firstOrCreate(
            ['slug' => $roleSlug, 'institution_id' => $this->institution->id],
            ['title' => ucfirst($roleSlug)],
        );

        foreach ($permissions as $permission) {
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

    /** A payment of $amount for the given year, with its receipt header. */
    private function makePayment(string $year, float $amount, string $receipt): StudentPayment
    {
        $transaction = PaymentTransaction::create([
            'institution_id' => $this->institution->id,
            'student_id' => $this->student->id,
            'academic_year' => $year,
            'receipt_number' => $receipt,
            'total_amount' => $amount,
            'payment_date' => $year === self::YEAR ? '2026-08-01' : '2025-08-01',
        ]);

        return StudentPayment::create([
            'institution_id' => $this->institution->id,
            'student_id' => $this->student->id,
            'academic_year' => $year,
            'payment_transaction_id' => $transaction->id,
            'school_fee_id' => $this->tuition->id,
            'receipt_number' => $receipt,
            'amount' => $amount,
            'payment_date' => $year === self::YEAR ? '2026-08-01' : '2025-08-01',
        ]);
    }

    private function clear(string $token, array $groups, ?string $confirmation = null, string $year = self::YEAR)
    {
        return $this->withHeader('Authorization', "Bearer {$token}")
            ->postJson('/api/finance/data-clear', [
                'academic_year' => $year,
                'groups' => $groups,
                'confirmation' => $confirmation ?? $year,
            ]);
    }

    public function test_clearing_payments_removes_only_the_selected_year(): void
    {
        $this->makeUser('clear-token', ['finance.view', 'finance.manage', 'finance.clear-data']);

        $kept = $this->makePayment(self::OTHER_YEAR, 500, 'OR-OLD');
        $doomed = $this->makePayment(self::YEAR, 1000, 'OR-NEW');

        $response = $this->clear('clear-token', ['payments'])->assertOk();

        $this->assertSame(1, $response->json('data.deleted_counts.student_payments'));
        $this->assertSame(1, $response->json('data.deleted_counts.payment_transactions'));
        $this->assertDatabaseMissing('student_payments', ['id' => $doomed->id]);
        $this->assertDatabaseHas('student_payments', ['id' => $kept->id]);
        $this->assertDatabaseMissing('payment_transactions', ['receipt_number' => 'OR-NEW']);
        $this->assertDatabaseHas('payment_transactions', ['receipt_number' => 'OR-OLD']);
    }

    public function test_clearing_never_touches_payment_plans_or_disbursements(): void
    {
        $this->makeUser('clear-token', ['finance.view', 'finance.manage', 'finance.clear-data']);

        $plan = PaymentPlan::create([
            'institution_id' => $this->institution->id,
            'name' => 'Semestral',
            'is_active' => true,
            'sort_order' => 1,
        ]);
        PaymentPlanInstallment::create([
            'payment_plan_id' => $plan->id,
            'sequence' => 1,
            'label' => 'First',
            'due_month' => 8,
            'due_day' => 1,
            'share_percentage' => 100,
        ]);
        StudentPaymentPlan::create([
            'institution_id' => $this->institution->id,
            'student_id' => $this->student->id,
            'academic_year' => self::YEAR,
            'payment_plan_id' => $plan->id,
            'selected_at' => now(),
        ]);

        $this->makePayment(self::YEAR, 1000, 'OR-1');

        // Every group at once — the most destructive request the API accepts.
        $this->clear('clear-token', \App\Support\FinanceDataGroups::keys())->assertOk();

        $this->assertDatabaseHas('payment_plans', ['id' => $plan->id]);
        $this->assertDatabaseHas('payment_plan_installments', ['payment_plan_id' => $plan->id]);
        $this->assertDatabaseHas('student_payment_plans', [
            'student_id' => $this->student->id,
            'academic_year' => self::YEAR,
        ]);
    }

    public function test_waived_late_fees_are_cleared_too(): void
    {
        $this->makeUser('clear-token', ['finance.view', 'finance.manage', 'finance.clear-data']);

        $waived = StudentAdditionalFee::create([
            'institution_id' => $this->institution->id,
            'student_id' => $this->student->id,
            'academic_year' => self::YEAR,
            'name' => 'Late Fee (First)',
            'amount' => 300,
            'source' => 'late_fee',
            'installment_sequence' => 1,
        ]);
        // Waiving soft-deletes. The row still holds the slot in the unique index
        // that stops LateFeeService re-charging it, so a clear that leaves it
        // behind hands the year a charge nobody can see.
        $waived->delete();

        $this->clear('clear-token', ['additional_fees'])->assertOk();

        $this->assertSame(0, \DB::table('student_additional_fees')->where('id', $waived->id)->count());
    }

    public function test_clearing_the_fee_catalog_is_refused_while_another_year_uses_it(): void
    {
        $this->makeUser('clear-token', ['finance.view', 'finance.manage', 'finance.clear-data']);

        // A payment in a year the operator did not select. Deleting school_fees
        // would SET NULL its school_fee_id and silently turn a tuition receipt
        // into a "General / Other" line.
        $kept = $this->makePayment(self::OTHER_YEAR, 500, 'OR-OLD');

        $response = $this->clear('clear-token', ['school_fee_catalog'])->assertStatus(422);

        $this->assertStringContainsString('cannot be cleared yet', $response->json('message'));
        $this->assertDatabaseHas('school_fees', ['id' => $this->tuition->id]);
        $this->assertDatabaseHas('student_payments', [
            'id' => $kept->id,
            'school_fee_id' => $this->tuition->id,
        ]);
    }

    public function test_clearing_the_fee_catalog_succeeds_once_nothing_else_references_it(): void
    {
        $this->makeUser('clear-token', ['finance.view', 'finance.manage', 'finance.clear-data']);

        SchoolFeeDefault::create([
            'school_fee_id' => $this->tuition->id,
            'institution_id' => $this->institution->id,
            'grade_level' => 'Grade 7',
            'academic_year' => self::YEAR,
            'amount' => 10000,
        ]);
        $this->makePayment(self::YEAR, 1000, 'OR-1');

        // The referencing rows are all in the selected year and are all being
        // cleared in the same run, so the catalog may go with them.
        $this->clear('clear-token', ['payments', 'fee_amounts', 'school_fee_catalog'])->assertOk();

        $this->assertDatabaseMissing('school_fees', ['id' => $this->tuition->id]);
        $this->assertDatabaseCount('school_fee_defaults', 0);
        $this->assertDatabaseCount('student_payments', 0);
    }

    public function test_a_catalog_group_ignores_the_year_and_says_so(): void
    {
        $this->makeUser('clear-token', ['finance.view', 'finance.manage', 'finance.clear-data']);

        DefaultDiscount::create([
            'institution_id' => $this->institution->id,
            'name' => 'Sibling 10%',
            'discount_type' => 'percentage',
            'value' => 10,
        ]);

        $preview = $this->withHeader('Authorization', 'Bearer clear-token')
            ->postJson('/api/finance/data-clear/preview', [
                'academic_year' => self::YEAR,
                'groups' => ['discount_templates'],
            ])->assertOk();

        $this->assertSame('catalog', $preview->json('data.groups.0.scope'));
        $this->assertSame(1, $preview->json('data.total'));
    }

    public function test_the_confirmation_must_match_the_academic_year(): void
    {
        $this->makeUser('clear-token', ['finance.view', 'finance.manage', 'finance.clear-data']);

        $payment = $this->makePayment(self::YEAR, 1000, 'OR-1');

        $this->clear('clear-token', ['payments'], 'yes')->assertStatus(422);

        $this->assertDatabaseHas('student_payments', ['id' => $payment->id]);
    }

    public function test_finance_manage_alone_cannot_clear_data(): void
    {
        // The cashier role: runs the POS all day, must not be able to delete
        // what it recorded.
        $this->makeUser('cashier-token', ['finance.view', 'finance.manage'], 'finance');

        $payment = $this->makePayment(self::YEAR, 1000, 'OR-1');

        $this->clear('cashier-token', ['payments'])->assertStatus(403);

        $this->assertDatabaseHas('student_payments', ['id' => $payment->id]);
    }

    public function test_a_clear_is_recorded_in_the_audit_log(): void
    {
        $user = $this->makeUser('clear-token', ['finance.view', 'finance.manage', 'finance.clear-data']);

        $this->makePayment(self::YEAR, 1000, 'OR-1');
        StudentDiscount::create([
            'institution_id' => $this->institution->id,
            'student_id' => $this->student->id,
            'academic_year' => self::YEAR,
            'discount_type' => 'fixed',
            'value' => 200,
        ]);

        $this->clear('clear-token', ['payments', 'applied_discounts'])->assertOk();

        $log = \DB::table('finance_data_clear_logs')->first();

        $this->assertNotNull($log);
        $this->assertSame(self::YEAR, $log->academic_year);
        $this->assertSame($user->id, $log->cleared_by);
        $this->assertEqualsCanonicalizing(
            ['payments', 'applied_discounts'],
            json_decode($log->groups, true),
        );

        $counts = json_decode($log->deleted_counts, true);
        $this->assertSame(1, $counts['student_payments']);
        $this->assertSame(1, $counts['student_discounts']);
        $this->assertSame(1, $counts['payment_transactions']);

        // And the history endpoint reads it back with labels.
        $history = $this->withHeader('Authorization', 'Bearer clear-token')
            ->getJson('/api/finance/data-clear/history')->assertOk();

        $this->assertContains('Payments & Receipts', $history->json('data.0.group_labels'));
    }

    public function test_another_institutions_finance_data_is_untouched(): void
    {
        $this->makeUser('clear-token', ['finance.view', 'finance.manage', 'finance.clear-data']);

        $other = Institution::factory()->create();
        $otherFee = SchoolFee::create([
            'institution_id' => $other->id,
            'name' => 'Tuition Fee',
            'is_active' => true,
        ]);

        $this->clear('clear-token', ['school_fee_catalog'])->assertOk();

        $this->assertDatabaseHas('school_fees', ['id' => $otherFee->id]);
        $this->assertDatabaseMissing('school_fees', ['id' => $this->tuition->id]);
    }
}
