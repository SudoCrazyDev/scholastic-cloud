<?php

namespace Tests\Feature;

use App\Models\Institution;
use App\Models\PaymentReceiptSubmission;
use App\Models\Role;
use App\Models\Student;
use App\Models\StudentAuth;
use App\Models\StudentInstitution;
use App\Models\StudentPayment;
use App\Models\User;
use App\Models\UserInstitution;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Who gets to see and act on the receipts students upload.
 *
 * The queue used to be gated on four built-in role slugs while the route it
 * hangs off was gated on the Finance permission. A school that runs its money
 * screens from its own role — the role builder exists so it can — was let
 * through the door and then refused by the controller, and because the screen
 * shows a denial as "no pending receipt submissions", an uploaded receipt
 * looked like it had never been sent. These tests pin the queue to the
 * permission, and pin the refusal to a role that genuinely has no Finance.
 */
class ReceiptApprovalQueueTest extends TestCase
{
    use RefreshDatabase;

    private Institution $institution;

    private Student $student;

    private PaymentReceiptSubmission $submission;

    protected function setUp(): void
    {
        parent::setUp();

        $this->institution = Institution::factory()->create(['title' => 'Receipt Queue School']);

        $this->student = Student::create([
            'first_name' => 'Uploading',
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

        $this->submission = PaymentReceiptSubmission::create([
            'institution_id' => $this->institution->id,
            'student_id' => $this->student->id,
            'academic_year' => '2026-2027',
            'installment_sequence' => 1,
            'installment_label' => 'First Installment',
            'file_path' => $this->institution->id.'/student/'.$this->student->id.'/payment-receipts/proof.jpg',
            'file_name' => 'proof.jpg',
            'mime_type' => 'image/jpeg',
            'status' => PaymentReceiptSubmission::STATUS_PENDING,
        ]);
    }

    /**
     * A role the school built itself, holding exactly what it ticked for
     * Finance — the shape the hardcoded slug list could never match.
     *
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
            'email' => strtolower(str_replace(' ', '-', $title)).'@receipts.test',
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

    public function test_a_schools_own_finance_role_sees_the_pending_receipt(): void
    {
        $this->staffWithRole('Cashier', ['finance.manage'], 'cashier-token');

        $this->withHeader('Authorization', 'Bearer cashier-token')
            ->getJson('/api/payment-receipt-submissions?status=pending')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $this->submission->id)
            ->assertJsonPath('data.0.status', 'pending');
    }

    /**
     * The shape this actually broke in, at Maranatha.
     *
     * Their built-in administrator role carries the slug
     * `institution-administrator-1` — generateSlug()'s collision suffix, left
     * behind by however the role was first created. It holds every finance
     * permission there is, and the hardcoded list still refused it, because the
     * list matched on the spelling of the slug rather than on what the role can
     * do. Two receipts sat unreviewed behind that, one of them for nine days.
     */
    public function test_a_suffixed_administrator_slug_still_reaches_the_queue(): void
    {
        $role = Role::factory()->create([
            'title' => 'Institution Administrator',
            'slug' => 'institution-administrator-1',
            'is_system' => true,
        ]);
        // SystemRolePermissions does not know the suffixed slug, so nothing is
        // seeded onto it — the permissions come from the role builder, exactly
        // as they do in production.
        $role->syncPermissions(['finance.manage', 'finance.void-immediately']);

        $admin = User::factory()->create([
            'email' => 'suffixed-admin@receipts.test',
            'token' => 'suffixed-admin-token',
            'token_expiry' => now()->addYear()->toDateTimeString(),
        ]);
        UserInstitution::factory()->create([
            'user_id' => $admin->id,
            'institution_id' => $this->institution->id,
            'role_id' => $role->id,
            'is_default' => true,
            'is_main' => true,
        ]);

        $this->withHeader('Authorization', 'Bearer suffixed-admin-token')
            ->getJson('/api/payment-receipt-submissions?status=pending')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $this->submission->id);

        $this->withHeader('Authorization', 'Bearer suffixed-admin-token')
            ->postJson('/api/payment-receipt-submissions/'.$this->submission->id.'/approve', [
                'amount' => 3500,
            ])
            ->assertOk();
    }

    public function test_a_read_only_finance_role_sees_the_queue_but_cannot_approve(): void
    {
        $this->staffWithRole('Finance Viewer', ['finance.view'], 'viewer-token');

        $this->withHeader('Authorization', 'Bearer viewer-token')
            ->getJson('/api/payment-receipt-submissions?status=pending')
            ->assertOk()
            ->assertJsonCount(1, 'data');

        $this->withHeader('Authorization', 'Bearer viewer-token')
            ->postJson('/api/payment-receipt-submissions/'.$this->submission->id.'/approve', [
                'amount' => 5000,
            ])
            ->assertForbidden();

        $this->assertSame(
            PaymentReceiptSubmission::STATUS_PENDING,
            $this->submission->fresh()->status
        );
    }

    public function test_a_role_without_finance_is_refused_the_queue(): void
    {
        $this->staffWithRole('Librarian', ['students.view'], 'librarian-token');

        $this->withHeader('Authorization', 'Bearer librarian-token')
            ->getJson('/api/payment-receipt-submissions?status=pending')
            ->assertForbidden();
    }

    public function test_approving_from_a_schools_own_finance_role_posts_the_payment(): void
    {
        $reviewer = $this->staffWithRole('Cashier', ['finance.manage'], 'cashier-token');

        $this->withHeader('Authorization', 'Bearer cashier-token')
            ->postJson('/api/payment-receipt-submissions/'.$this->submission->id.'/approve', [
                'amount' => 5000,
            ])
            ->assertOk()
            ->assertJsonPath('data.status', 'approved');

        $submission = $this->submission->fresh();
        $this->assertSame('approved', $submission->status);
        $this->assertSame($reviewer->id, $submission->reviewed_by);

        $payment = StudentPayment::find($submission->student_payment_id);
        $this->assertNotNull($payment);
        $this->assertSame($this->student->id, $payment->student_id);
        $this->assertSame('5000.00', (string) $payment->amount);
        $this->assertSame('2026-2027', $payment->academic_year);
    }

    /**
     * The whole reported flow, end to end: a student signed into the portal
     * uploads proof of payment, and the school's administrator opens Receipt
     * Approvals. The two halves resolve the institution by different routes —
     * the student's active enrolment, the administrator's default institution —
     * and the queue only works if they agree.
     */
    public function test_a_portal_upload_reaches_the_administrators_queue(): void
    {
        Storage::fake('r2');

        StudentAuth::create([
            'student_id' => $this->student->id,
            'email' => 'uploader@receipts.test',
            'password' => Hash::make('student-password'),
            'is_new' => false,
            'token' => 'portal-uploader',
            'token_expiry' => now()->addYear()->toDateTimeString(),
        ]);

        $adminRole = Role::factory()->create([
            'title' => 'Institution Administrator',
            'slug' => 'institution-administrator',
        ]);
        $admin = User::factory()->create([
            'email' => 'admin@receipts.test',
            'token' => 'admin-token',
            'token_expiry' => now()->addYear()->toDateTimeString(),
        ]);
        UserInstitution::factory()->create([
            'user_id' => $admin->id,
            'institution_id' => $this->institution->id,
            'role_id' => $adminRole->id,
            'is_default' => true,
            'is_main' => true,
        ]);

        $this->withHeader('Authorization', 'Bearer portal-uploader')
            ->postJson('/api/payment-receipt-submissions', [
                'academic_year' => '2026-2027',
                'installment_sequence' => 2,
                'installment_label' => 'Second Installment',
                // create() rather than image(): the test host has no GD, and
                // nothing here reads the pixels.
                'file' => UploadedFile::fake()->create('gcash.jpg', 120, 'image/jpeg'),
            ])
            ->assertCreated();

        $uploaded = PaymentReceiptSubmission::where('installment_sequence', 2)->first();
        $this->assertNotNull($uploaded, 'the portal upload was not stored');
        $this->assertSame($this->institution->id, $uploaded->institution_id);

        $this->withHeader('Authorization', 'Bearer admin-token')
            ->getJson('/api/payment-receipt-submissions?status=pending')
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonFragment(['id' => $uploaded->id]);
    }

    public function test_another_schools_queue_does_not_show_this_receipt(): void
    {
        $otherInstitution = Institution::factory()->create(['title' => 'Other School']);

        $role = Role::create([
            'institution_id' => $otherInstitution->id,
            'title' => 'Cashier',
            'slug' => Role::generateSlug('Cashier', $otherInstitution->id),
        ]);
        $role->syncPermissions(['finance.manage']);

        $user = User::factory()->create([
            'email' => 'other-cashier@receipts.test',
            'token' => 'other-cashier-token',
            'token_expiry' => now()->addYear()->toDateTimeString(),
        ]);

        UserInstitution::factory()->create([
            'user_id' => $user->id,
            'institution_id' => $otherInstitution->id,
            'role_id' => $role->id,
            'is_default' => true,
            'is_main' => true,
        ]);

        $this->withHeader('Authorization', 'Bearer other-cashier-token')
            ->getJson('/api/payment-receipt-submissions?status=pending')
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }
}
