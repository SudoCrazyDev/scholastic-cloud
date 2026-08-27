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
use Tests\TestCase;

/**
 * The check Receipt Approvals runs before it posts: is this reference number already on a
 * live collection?
 *
 * Reuse is allowed — one bank transfer can settle two students' fees, and a receipt can be
 * split across postings — so this endpoint never refuses anything. What it has to do is
 * hand the reviewer enough to tell the legitimate case from the one they actually want to
 * catch: the same transfer uploaded twice. That means naming the collection, whose it is,
 * and the receipt image that was verified for it, because side by side with the image in
 * front of them that is what settles it.
 */
class PaymentIdentifierHoldersTest extends TestCase
{
    use RefreshDatabase;

    private Institution $institution;

    private Student $student;

    protected function setUp(): void
    {
        parent::setUp();

        $this->institution = Institution::factory()->create(['title' => 'Identifier Check School']);

        $this->student = Student::create([
            'lrn' => '123456789012',
            'first_name' => 'Paying',
            'last_name' => 'Student',
            'gender' => 'female',
            'birthdate' => '2010-01-01',
            'is_active' => true,
        ]);

        StudentInstitution::create([
            'student_id' => $this->student->id,
            'institution_id' => $this->institution->id,
            'is_active' => true,
        ]);
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
            'email' => strtolower(str_replace(' ', '-', $title)).'@identifiers.test',
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
     * A collection posted from an approved receipt upload, which is the case the screen
     * exists for: the holder has an image behind it.
     */
    private function postedFromUpload(
        string $referenceNumber,
        ?Institution $institution = null,
        ?Student $student = null
    ): PaymentTransaction {
        $institution ??= $this->institution;
        $student ??= $this->student;

        $transaction = PaymentTransaction::create([
            'institution_id' => $institution->id,
            'student_id' => $student->id,
            'academic_year' => '2026-2027',
            'payment_date' => '2026-08-01',
            'payment_method' => 'Online - Receipt Upload',
            'reference_number' => $referenceNumber,
            'or_number' => 'OR-9001',
            'receipt_number' => 'RCPT-'.$referenceNumber,
            'remarks' => 'Posted from verified online payment receipt (First Installment)',
            'total_amount' => 5000,
        ]);

        $payment = StudentPayment::create([
            'institution_id' => $institution->id,
            'student_id' => $student->id,
            'payment_transaction_id' => $transaction->id,
            'academic_year' => '2026-2027',
            'amount' => 5000,
            'payment_date' => '2026-08-01',
            'payment_method' => 'Online - Receipt Upload',
            'reference_number' => $referenceNumber,
            'receipt_number' => $transaction->receipt_number,
        ]);

        PaymentReceiptSubmission::create([
            'institution_id' => $institution->id,
            'student_id' => $student->id,
            'academic_year' => '2026-2027',
            'installment_sequence' => 1,
            'installment_label' => 'First Installment',
            'amount' => 5000,
            'file_path' => $institution->id.'/student/'.$student->id.'/payment-receipts/first.jpg',
            'file_name' => 'first.jpg',
            'mime_type' => 'image/jpeg',
            'status' => PaymentReceiptSubmission::STATUS_APPROVED,
            'student_payment_id' => $payment->id,
            'payment_transaction_id' => $transaction->id,
        ]);

        return $transaction;
    }

    public function test_a_reused_reference_number_names_the_collection_the_student_and_the_receipt(): void
    {
        $this->staffWithRole('Cashier', ['finance.manage'], 'cashier-token');
        $transaction = $this->postedFromUpload('BDO-778899');

        $response = $this->withHeader('Authorization', 'Bearer cashier-token')
            ->getJson('/api/payment-identifiers/holders?reference_number=BDO-778899')
            ->assertOk()
            ->assertJsonCount(1, 'data.reference_number')
            ->assertJsonPath('data.reference_number.0.kind', 'transaction')
            ->assertJsonPath('data.reference_number.0.id', $transaction->id)
            ->assertJsonPath('data.reference_number.0.receipt_number', $transaction->receipt_number)
            ->assertJsonPath('data.reference_number.0.or_number', 'OR-9001')
            ->assertJsonPath('data.reference_number.0.amount', 5000)
            ->assertJsonPath('data.reference_number.0.payment_date', '2026-08-01')
            ->assertJsonPath('data.reference_number.0.student.lrn', '123456789012')
            ->assertJsonPath('data.reference_number.0.student.first_name', 'Paying')
            ->assertJsonPath('data.reference_number.0.receipt_submission.file_name', 'first.jpg')
            ->assertJsonPath('data.reference_number.0.receipt_submission.installment_label', 'First Installment');

        // The image is the point: without a URL the reviewer has nothing to compare.
        $this->assertNotNull($response->json('data.reference_number.0.receipt_submission.url'));
    }

    /**
     * The ordinary case, and the shape the screen leans on: a field with no holder is
     * absent, so an empty object means "nothing is reused" with no per-field check.
     */
    public function test_an_unused_reference_number_reports_nothing(): void
    {
        $this->staffWithRole('Cashier', ['finance.manage'], 'cashier-token');
        $this->postedFromUpload('BDO-778899');

        $this->withHeader('Authorization', 'Bearer cashier-token')
            ->getJson('/api/payment-identifiers/holders?reference_number=GCASH-000111')
            ->assertOk()
            ->assertExactJson(['success' => true, 'data' => []]);
    }

    /**
     * Voiding is usually the reviewer catching their own keying mistake, and the number on
     * the entry they just took back is free again. Reporting it would send them looking for
     * a duplicate that no longer exists.
     */
    public function test_a_voided_collection_is_not_a_holder(): void
    {
        $this->staffWithRole('Cashier', ['finance.manage'], 'cashier-token');
        $transaction = $this->postedFromUpload('BDO-778899');
        $transaction->update(['voided_at' => now()]);

        $this->withHeader('Authorization', 'Bearer cashier-token')
            ->getJson('/api/payment-identifiers/holders?reference_number=BDO-778899')
            ->assertOk()
            ->assertExactJson(['success' => true, 'data' => []]);
    }

    public function test_another_schools_collection_is_not_reported(): void
    {
        $this->staffWithRole('Cashier', ['finance.manage'], 'cashier-token');

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
        $this->postedFromUpload('BDO-778899', $otherSchool, $otherStudent);

        $this->withHeader('Authorization', 'Bearer cashier-token')
            ->getJson('/api/payment-identifiers/holders?reference_number=BDO-778899')
            ->assertOk()
            ->assertExactJson(['success' => true, 'data' => []]);
    }

    /**
     * A standalone payment — the legacy single-fee path, with no transaction header — still
     * holds a number of its own, and still gets its uploaded receipt attached: those
     * approvals were only ever linked by `student_payment_id`.
     */
    public function test_a_standalone_payment_holds_its_number_and_keeps_its_receipt(): void
    {
        $this->staffWithRole('Cashier', ['finance.manage'], 'cashier-token');

        $payment = StudentPayment::create([
            'institution_id' => $this->institution->id,
            'student_id' => $this->student->id,
            'academic_year' => '2026-2027',
            'amount' => 1200,
            'payment_date' => '2026-07-15',
            'payment_method' => 'Online - Receipt Upload',
            'reference_number' => 'GCASH-555',
            'receipt_number' => 'RCPT-LEGACY',
        ]);

        PaymentReceiptSubmission::create([
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
            ->getJson('/api/payment-identifiers/holders?reference_number=GCASH-555')
            ->assertOk()
            ->assertJsonCount(1, 'data.reference_number')
            ->assertJsonPath('data.reference_number.0.kind', 'payment')
            ->assertJsonPath('data.reference_number.0.id', $payment->id)
            ->assertJsonPath('data.reference_number.0.amount', 1200)
            ->assertJsonPath('data.reference_number.0.receipt_submission.file_name', 'legacy.pdf');
    }

    /**
     * The collection being edited is not its own duplicate — otherwise re-saving an
     * approved receipt's details would report the receipt itself.
     */
    public function test_the_collection_being_edited_is_excluded(): void
    {
        $this->staffWithRole('Cashier', ['finance.manage'], 'cashier-token');
        $transaction = $this->postedFromUpload('BDO-778899');

        $this->withHeader('Authorization', 'Bearer cashier-token')
            ->getJson('/api/payment-identifiers/holders?reference_number=BDO-778899&except_transaction_id='.$transaction->id)
            ->assertOk()
            ->assertExactJson(['success' => true, 'data' => []]);
    }

    /**
     * The check reads; it does not post. A reviewer who can only look at Finance is still
     * allowed to ask, and a role with no Finance at all is not.
     */
    public function test_read_only_finance_may_check_and_a_role_without_finance_may_not(): void
    {
        $this->staffWithRole('Finance Viewer', ['finance.view'], 'viewer-token');
        $this->staffWithRole('Librarian', ['students.view'], 'librarian-token');
        $this->postedFromUpload('BDO-778899');

        $this->withHeader('Authorization', 'Bearer viewer-token')
            ->getJson('/api/payment-identifiers/holders?reference_number=BDO-778899')
            ->assertOk()
            ->assertJsonCount(1, 'data.reference_number');

        $this->withHeader('Authorization', 'Bearer librarian-token')
            ->getJson('/api/payment-identifiers/holders?reference_number=BDO-778899')
            ->assertForbidden();
    }
}
