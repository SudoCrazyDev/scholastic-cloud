<?php

namespace Tests\Feature;

use App\Models\Institution;
use App\Models\PaymentReceiptSubmission;
use App\Models\PaymentTransaction;
use App\Models\Role;
use App\Models\Student;
use App\Models\StudentInstitution;
use App\Models\StudentPayment;
use App\Models\User;
use App\Models\UserInstitution;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * The Duplicates tab on Receipt Approvals: approved receipts that ended up sharing a
 * reference number.
 *
 * The check that runs before an approval posts only catches a duplicate while the reviewer
 * is still holding it. This is the sweep afterwards, over money already on the books — the
 * ones posted anyway, keyed in later on the details form, or approved before there was a
 * check at all. It reports and never acts: taking a posting back is the void queue's job.
 */
class ReceiptDuplicateReferenceTest extends TestCase
{
    use RefreshDatabase;

    private Institution $institution;

    private Student $student;

    protected function setUp(): void
    {
        parent::setUp();

        $this->institution = Institution::factory()->create(['title' => 'Duplicate Sweep School']);
        $this->student = $this->studentNamed('Paying', 'Student', '123456789012');

        $this->staffWithRole('Cashier', ['finance.view', 'finance.manage'], 'cashier-token');
    }

    private function studentNamed(string $first, string $last, ?string $lrn = null): Student
    {
        $student = Student::create([
            'lrn' => $lrn,
            'first_name' => $first,
            'last_name' => $last,
            'gender' => 'female',
            'birthdate' => '2010-01-01',
            'is_active' => true,
        ]);

        StudentInstitution::create([
            'student_id' => $student->id,
            'institution_id' => $this->institution->id,
            'is_active' => true,
        ]);

        return $student;
    }

    /**
     * @param  array<string>  $permissions
     */
    private function staffWithRole(string $title, array $permissions, string $token): User
    {
        $role = Role::create([
            'institution_id' => $this->institution->id,
            'title' => $title,
            'slug' => Role::generateSlug($title, $this->institution->id),
        ]);
        $role->syncPermissions($permissions);

        $user = User::factory()->create([
            'email' => strtolower(str_replace(' ', '-', $title)).'@duplicates.test',
            'token' => $token,
            'token_expiry' => now()->addYear()->toDateTimeString(),
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

    /**
     * An approval as it lands: a transaction, its line, and the upload that was verified
     * for it. `approvedAt` orders the members of a group, oldest first.
     */
    private function approvedReceipt(
        string $referenceNumber,
        string $approvedAt,
        array $overrides = []
    ): PaymentReceiptSubmission {
        $institution = $overrides['institution'] ?? $this->institution;
        $student = $overrides['student'] ?? $this->student;
        $amount = $overrides['amount'] ?? 5000;
        $sequence = $overrides['installment_sequence'] ?? 1;
        $receiptNumber = $overrides['receipt_number'] ?? 'RCPT-'.Str::uuid();

        $transaction = PaymentTransaction::create([
            'institution_id' => $institution->id,
            'student_id' => $student->id,
            'academic_year' => '2026-2027',
            'payment_date' => '2026-08-01',
            'payment_method' => 'Online - Receipt Upload',
            'reference_number' => $referenceNumber,
            'receipt_number' => $receiptNumber,
            'total_amount' => $amount,
        ]);

        $payment = StudentPayment::create([
            'institution_id' => $institution->id,
            'student_id' => $student->id,
            'payment_transaction_id' => $transaction->id,
            'academic_year' => '2026-2027',
            'amount' => $amount,
            'payment_date' => '2026-08-01',
            'payment_method' => 'Online - Receipt Upload',
            'reference_number' => $referenceNumber,
            'receipt_number' => $receiptNumber,
        ]);

        $submission = PaymentReceiptSubmission::create([
            'institution_id' => $institution->id,
            'student_id' => $student->id,
            'academic_year' => '2026-2027',
            'installment_sequence' => $sequence,
            'installment_label' => 'Installment #'.$sequence,
            'amount' => $amount,
            'file_path' => $institution->id.'/student/'.$student->id.'/payment-receipts/'.$sequence.'.jpg',
            'file_name' => $sequence.'.jpg',
            'mime_type' => 'image/jpeg',
            'status' => $overrides['status'] ?? PaymentReceiptSubmission::STATUS_APPROVED,
            'student_payment_id' => $payment->id,
            'payment_transaction_id' => $transaction->id,
            'reviewed_at' => $approvedAt,
        ]);

        // The group is ordered by when the receipt arrived, so the test has to say when.
        $submission->created_at = $approvedAt;
        $submission->save();

        return $submission->refresh();
    }

    public function test_two_approved_receipts_on_one_reference_are_grouped_oldest_first(): void
    {
        $first = $this->approvedReceipt('BDO-778899', '2026-08-01 09:00:00');
        $second = $this->approvedReceipt('BDO-778899', '2026-08-03 14:00:00', [
            'installment_sequence' => 2,
        ]);

        $this->withHeader('Authorization', 'Bearer cashier-token')
            ->getJson('/api/payment-receipt-submissions/duplicates')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.reference_number', 'BDO-778899')
            ->assertJsonPath('data.0.count', 2)
            ->assertJsonPath('data.0.total_amount', 10000)
            ->assertJsonPath('data.0.student_count', 1)
            ->assertJsonCount(2, 'data.0.submissions')
            // Oldest first: the head of the list is the approval that got there first.
            ->assertJsonPath('data.0.submissions.0.id', $first->id)
            ->assertJsonPath('data.0.submissions.1.id', $second->id)
            // The image is what settles it, so each member has to carry its own.
            ->assertJsonPath('data.0.submissions.0.file_name', '1.jpg')
            ->assertJsonPath(
                'data.0.submissions.1.payment_transaction.reference_number',
                'BDO-778899'
            );
    }

    /**
     * A reference is read off an image by hand. Grouping on the raw string would miss
     * exactly the pairs that are hardest to spot by eye.
     */
    public function test_case_and_separators_do_not_hide_a_duplicate(): void
    {
        $this->approvedReceipt('BDO-778899', '2026-08-01 09:00:00');
        $this->approvedReceipt('bdo 778899', '2026-08-03 14:00:00', ['installment_sequence' => 2]);

        $this->withHeader('Authorization', 'Bearer cashier-token')
            ->getJson('/api/payment-receipt-submissions/duplicates')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.count', 2)
            // The number as posted stays on the row, so the reviewer sees they were typed
            // differently rather than being told two identical strings collided.
            ->assertJsonPath('data.0.submissions.1.payment_transaction.reference_number', 'bdo 778899');
    }

    /**
     * Siblings on one transfer is the legitimate case, and it is still reported — but the
     * shape that says so has to come back with it.
     */
    public function test_two_students_on_one_reference_are_reported_as_two_students(): void
    {
        $sibling = $this->studentNamed('Other', 'Student', '210987654321');

        $this->approvedReceipt('GCASH-555', '2026-08-01 09:00:00');
        $this->approvedReceipt('GCASH-555', '2026-08-01 09:05:00', ['student' => $sibling]);

        $this->withHeader('Authorization', 'Bearer cashier-token')
            ->getJson('/api/payment-receipt-submissions/duplicates')
            ->assertOk()
            ->assertJsonPath('data.0.student_count', 2);
    }

    public function test_a_reference_used_once_is_not_reported(): void
    {
        $this->approvedReceipt('BDO-778899', '2026-08-01 09:00:00');
        $this->approvedReceipt('GCASH-555', '2026-08-02 09:00:00', ['installment_sequence' => 2]);

        $this->withHeader('Authorization', 'Bearer cashier-token')
            ->getJson('/api/payment-receipt-submissions/duplicates')
            ->assertOk()
            ->assertExactJson(['success' => true, 'data' => []]);
    }

    /**
     * A receipt with no reference number on its posting has nothing to be duplicated by —
     * two of them are not a pair.
     */
    public function test_receipts_with_no_reference_number_are_not_a_group(): void
    {
        $this->approvedReceipt('', '2026-08-01 09:00:00');
        $this->approvedReceipt('', '2026-08-02 09:00:00', ['installment_sequence' => 2]);

        $this->withHeader('Authorization', 'Bearer cashier-token')
            ->getJson('/api/payment-receipt-submissions/duplicates')
            ->assertOk()
            ->assertExactJson(['success' => true, 'data' => []]);
    }

    /**
     * Voiding is the outcome this screen sends people to. Once it has happened the pair is
     * resolved, and leaving it on the list would send the next reviewer after it again.
     */
    public function test_a_voided_posting_leaves_the_group(): void
    {
        $this->approvedReceipt('BDO-778899', '2026-08-01 09:00:00');
        $second = $this->approvedReceipt('BDO-778899', '2026-08-03 14:00:00', [
            'installment_sequence' => 2,
        ]);

        PaymentTransaction::whereKey($second->payment_transaction_id)->update(['voided_at' => now()]);
        StudentPayment::where('payment_transaction_id', $second->payment_transaction_id)
            ->update(['voided_at' => now()]);

        $this->withHeader('Authorization', 'Bearer cashier-token')
            ->getJson('/api/payment-receipt-submissions/duplicates')
            ->assertOk()
            ->assertExactJson(['success' => true, 'data' => []]);
    }

    /**
     * A pending receipt has not moved a ledger yet — the pre-post check is what catches it,
     * and listing it here would report a duplicate the reviewer can still simply not make.
     */
    public function test_only_approved_receipts_are_swept(): void
    {
        $this->approvedReceipt('BDO-778899', '2026-08-01 09:00:00');
        $this->approvedReceipt('BDO-778899', '2026-08-03 14:00:00', [
            'installment_sequence' => 2,
            'status' => PaymentReceiptSubmission::STATUS_PENDING,
        ]);
        $this->approvedReceipt('BDO-778899', '2026-08-04 14:00:00', [
            'installment_sequence' => 3,
            'status' => PaymentReceiptSubmission::STATUS_REJECTED,
        ]);

        $this->withHeader('Authorization', 'Bearer cashier-token')
            ->getJson('/api/payment-receipt-submissions/duplicates')
            ->assertOk()
            ->assertExactJson(['success' => true, 'data' => []]);
    }

    public function test_another_schools_receipts_are_not_swept_in(): void
    {
        $otherSchool = Institution::factory()->create(['title' => 'Somebody Elses School']);
        $otherStudent = Student::create([
            'first_name' => 'Elsewhere',
            'last_name' => 'Student',
            'gender' => 'male',
            'birthdate' => '2010-01-01',
            'is_active' => true,
        ]);
        StudentInstitution::create([
            'student_id' => $otherStudent->id,
            'institution_id' => $otherSchool->id,
            'is_active' => true,
        ]);

        $this->approvedReceipt('BDO-778899', '2026-08-01 09:00:00');
        $this->approvedReceipt('BDO-778899', '2026-08-03 14:00:00', [
            'institution' => $otherSchool,
            'student' => $otherStudent,
            'installment_sequence' => 2,
        ]);

        $this->withHeader('Authorization', 'Bearer cashier-token')
            ->getJson('/api/payment-receipt-submissions/duplicates')
            ->assertOk()
            ->assertExactJson(['success' => true, 'data' => []]);
    }

    /**
     * A legacy approval has no transaction header — it was only ever linked by
     * `student_payment_id` — and its number lives on the payment itself.
     */
    public function test_a_legacy_standalone_approval_is_swept_with_the_rest(): void
    {
        $this->approvedReceipt('BDO-778899', '2026-08-01 09:00:00');

        $payment = StudentPayment::create([
            'institution_id' => $this->institution->id,
            'student_id' => $this->student->id,
            'academic_year' => '2026-2027',
            'amount' => 1200,
            'payment_date' => '2026-07-15',
            'payment_method' => 'Online - Receipt Upload',
            'reference_number' => 'BDO-778899',
            'receipt_number' => 'RCPT-LEGACY',
        ]);

        $legacy = PaymentReceiptSubmission::create([
            'institution_id' => $this->institution->id,
            'student_id' => $this->student->id,
            'academic_year' => '2026-2027',
            'installment_sequence' => 2,
            'installment_label' => 'Second Installment',
            'amount' => 1200,
            'file_path' => $this->institution->id.'/student/'.$this->student->id.'/payment-receipts/legacy.pdf',
            'file_name' => 'legacy.pdf',
            'mime_type' => 'application/pdf',
            'status' => PaymentReceiptSubmission::STATUS_APPROVED,
            'student_payment_id' => $payment->id,
        ]);

        $this->withHeader('Authorization', 'Bearer cashier-token')
            ->getJson('/api/payment-receipt-submissions/duplicates')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.count', 2)
            ->assertJsonPath('data.0.total_amount', 6200)
            ->assertJsonPath('data.0.submissions.1.id', $legacy->id);
    }

    public function test_a_student_cannot_sweep_the_institutions_books(): void
    {
        $studentUser = User::factory()->create([
            'email' => 'pupil@duplicates.test',
            'token' => 'student-token',
            'token_expiry' => now()->addYear()->toDateTimeString(),
        ]);
        $this->student->update(['user_id' => $studentUser->id]);

        $this->withHeader('Authorization', 'Bearer student-token')
            ->getJson('/api/payment-receipt-submissions/duplicates')
            ->assertForbidden();
    }
}
