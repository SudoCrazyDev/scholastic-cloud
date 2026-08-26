<?php

namespace Tests\Feature;

use App\Models\Institution;
use App\Models\PaymentReceiptSubmission;
use App\Models\PaymentTransaction;
use App\Models\Role;
use App\Models\SchoolFee;
use App\Models\Student;
use App\Models\StudentInstitution;
use App\Models\StudentPayment;
use App\Models\User;
use App\Models\UserInstitution;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Two changes to how a collection is identified and described.
 *
 * **A receipt identifier names one collection.** The OR number and the reference number
 * stay optional — plenty of schools take cash with neither — but one that is entered is
 * what the school reconciles against the physical OR booklet or the bank statement. Two
 * payments carrying the same number make both of them unreconcilable, so the second one
 * is refused rather than accepted and discovered at audit.
 *
 * **An approved receipt says what it settled.** Approving a student's uploaded proof of
 * payment used to write one unallocated payment: the ledger read "Payment" against no fee
 * at all. It now posts a real transaction whose line items are the subdivision, and the
 * details of that collection — the OR number especially, which is usually written up
 * hours later — can be corrected afterwards without the amounts moving.
 */
class ReceiptIdentifierAndSubdivisionTest extends TestCase
{
    use RefreshDatabase;

    private Institution $institution;

    private Student $student;

    private SchoolFee $tuition;

    private SchoolFee $miscellaneous;

    protected function setUp(): void
    {
        parent::setUp();

        $this->institution = Institution::factory()->create(['title' => 'Receipt Identifier School']);

        $this->student = Student::create([
            'first_name' => 'Paying',
            'last_name' => 'Student',
            'gender' => 'male',
            'birthdate' => '2010-01-01',
            'is_active' => true,
        ]);

        StudentInstitution::create([
            'student_id' => $this->student->id,
            'institution_id' => $this->institution->id,
            'is_active' => true,
        ]);

        $this->tuition = SchoolFee::create([
            'institution_id' => $this->institution->id,
            'name' => 'Tuition',
            'is_active' => true,
        ]);

        $this->miscellaneous = SchoolFee::create([
            'institution_id' => $this->institution->id,
            'name' => 'Miscellaneous',
            'is_active' => true,
        ]);

        $this->staffWithRole('Cashier', ['finance.manage', 'finance.view'], 'cashier-token');
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
     * @param  array<string, mixed>  $overrides
     */
    private function recordPayment(array $overrides = []): \Illuminate\Testing\TestResponse
    {
        return $this->withHeader('Authorization', 'Bearer cashier-token')
            ->postJson('/api/student-payments', array_merge([
                'student_id' => $this->student->id,
                'academic_year' => '2026-2027',
                'payment_method' => 'Cash',
                'items' => [
                    ['school_fee_id' => $this->tuition->id, 'amount' => 1000],
                ],
            ], $overrides));
    }

    private function pendingSubmission(int $sequence = 1): PaymentReceiptSubmission
    {
        return PaymentReceiptSubmission::create([
            'institution_id' => $this->institution->id,
            'student_id' => $this->student->id,
            'academic_year' => '2026-2027',
            'installment_sequence' => $sequence,
            'installment_label' => 'Installment #'.$sequence,
            'file_path' => $this->institution->id.'/proof-'.$sequence.'.jpg',
            'file_name' => 'proof.jpg',
            'mime_type' => 'image/jpeg',
            'status' => PaymentReceiptSubmission::STATUS_PENDING,
        ]);
    }

    // ---------------------------------------------------------------- identifiers

    public function test_an_or_number_may_be_left_off_by_every_receipt(): void
    {
        $this->recordPayment()->assertCreated();
        $this->recordPayment()->assertCreated();

        $this->assertSame(2, PaymentTransaction::whereNull('or_number')->count());
    }

    public function test_a_second_receipt_cannot_reuse_an_or_number(): void
    {
        $this->recordPayment(['or_number' => 'OR-1042'])->assertCreated();

        $this->recordPayment(['or_number' => 'OR-1042'])
            ->assertStatus(422)
            ->assertJsonPath('errors.or_number.0', 'This OR number is already recorded on receipt '
                .PaymentTransaction::first()->receipt_number.'.');

        $this->assertSame(1, PaymentTransaction::count());
    }

    public function test_a_second_receipt_cannot_reuse_a_reference_number(): void
    {
        $this->recordPayment(['reference_number' => 'BDO-99381'])->assertCreated();

        $this->recordPayment(['reference_number' => 'BDO-99381'])
            ->assertStatus(422)
            ->assertJsonStructure(['errors' => ['reference_number']]);
    }

    /**
     * The two are separate namespaces: a school whose OR booklet and bank references
     * happen to run on the same series is not colliding with itself.
     */
    public function test_an_or_number_does_not_collide_with_a_reference_number(): void
    {
        $this->recordPayment(['or_number' => 'S-7'])->assertCreated();
        $this->recordPayment(['reference_number' => 'S-7'])->assertCreated();
    }

    /**
     * A number surrounded by whitespace is the same number. Storing it raw would let
     * "OR-1042 " through and leave two rows that look identical on screen.
     */
    public function test_a_padded_or_number_is_the_same_number(): void
    {
        $this->recordPayment(['or_number' => 'OR-1042'])->assertCreated();
        $this->recordPayment(['or_number' => '  OR-1042  '])->assertStatus(422);
    }

    public function test_a_blank_or_number_is_stored_as_nothing_rather_than_an_empty_string(): void
    {
        $this->recordPayment(['or_number' => '   '])->assertCreated();

        $this->assertNull(PaymentTransaction::first()->or_number);
    }

    /**
     * Uniqueness is per school. Two institutions on the same deployment issue their own
     * OR booklets and both start at 1.
     */
    public function test_another_school_may_use_the_same_or_number(): void
    {
        $this->recordPayment(['or_number' => 'OR-1'])->assertCreated();

        $otherInstitution = Institution::factory()->create(['title' => 'Other School']);
        $otherStudent = Student::create([
            'first_name' => 'Other',
            'last_name' => 'Student',
            'gender' => 'female',
            'birthdate' => '2010-01-01',
            'is_active' => true,
        ]);
        StudentInstitution::create([
            'student_id' => $otherStudent->id,
            'institution_id' => $otherInstitution->id,
            'is_active' => true,
        ]);
        $otherFee = SchoolFee::create([
            'institution_id' => $otherInstitution->id,
            'name' => 'Tuition',
            'is_active' => true,
        ]);

        $role = Role::create([
            'institution_id' => $otherInstitution->id,
            'title' => 'Cashier',
            'slug' => Role::generateSlug('Cashier', $otherInstitution->id),
        ]);
        $role->syncPermissions(['finance.manage']);
        $otherUser = User::factory()->create([
            'email' => 'other-cashier@identifiers.test',
            'token' => 'other-cashier-token',
            'token_expiry' => now()->addYear()->toDateTimeString(),
        ]);
        UserInstitution::factory()->create([
            'user_id' => $otherUser->id,
            'institution_id' => $otherInstitution->id,
            'role_id' => $role->id,
            'is_default' => true,
            'is_main' => true,
        ]);

        $this->withHeader('Authorization', 'Bearer other-cashier-token')
            ->postJson('/api/student-payments', [
                'student_id' => $otherStudent->id,
                'academic_year' => '2026-2027',
                'or_number' => 'OR-1',
                'items' => [['school_fee_id' => $otherFee->id, 'amount' => 500]],
            ])
            ->assertCreated();
    }

    /**
     * A four-fee receipt writes its own OR number onto all four line items. That is
     * denormalization, not a collision — the constraint has to allow it.
     */
    public function test_one_receipt_may_repeat_its_or_number_across_its_own_line_items(): void
    {
        $this->recordPayment([
            'or_number' => 'OR-2000',
            'items' => [
                ['school_fee_id' => $this->tuition->id, 'amount' => 1000],
                ['school_fee_id' => $this->miscellaneous->id, 'amount' => 500],
            ],
        ])->assertCreated();

        $this->assertSame(2, StudentPayment::where('or_number', 'OR-2000')->count());
        $this->assertSame(1, PaymentTransaction::where('or_number', 'OR-2000')->count());
    }

    /**
     * The till and the approval queue draw on one booklet, so a number used in either
     * place is used in both.
     */
    public function test_an_approval_cannot_reuse_a_cashiers_or_number(): void
    {
        $this->recordPayment(['or_number' => 'OR-500'])->assertCreated();

        $this->withHeader('Authorization', 'Bearer cashier-token')
            ->postJson('/api/payment-receipt-submissions/'.$this->pendingSubmission()->id.'/approve', [
                'amount' => 3500,
                'or_number' => 'OR-500',
            ])
            ->assertStatus(422)
            ->assertJsonStructure(['errors' => ['or_number']]);
    }

    // ---------------------------------------------------------------- subdivision

    public function test_approving_subdivides_the_verified_amount_across_fees(): void
    {
        $submission = $this->pendingSubmission();

        $this->withHeader('Authorization', 'Bearer cashier-token')
            ->postJson('/api/payment-receipt-submissions/'.$submission->id.'/approve', [
                'amount' => 3500,
                'or_number' => 'OR-7001',
                'payment_method' => 'Bank Transfer',
                'allocations' => [
                    ['school_fee_id' => $this->tuition->id, 'amount' => 2500],
                    ['school_fee_id' => $this->miscellaneous->id, 'amount' => 700],
                ],
            ])
            ->assertOk()
            ->assertJsonPath('data.status', 'approved');

        $transaction = $submission->fresh()->paymentTransaction;
        $this->assertNotNull($transaction);
        $this->assertSame('3500.00', (string) $transaction->total_amount);
        $this->assertSame('OR-7001', $transaction->or_number);
        $this->assertSame('Bank Transfer', $transaction->payment_method);

        // 2,500 + 700 named a fee; the 300 left over is still money the student paid, so
        // it posts as General / Other rather than going missing.
        $items = $transaction->items()->get();
        $this->assertCount(3, $items);
        $this->assertEquals(3500.00, (float) $items->sum('amount'));
        $this->assertSame(
            '2500.00',
            (string) $items->firstWhere('school_fee_id', $this->tuition->id)->amount
        );
        $unallocated = $items->firstWhere('school_fee_id', null);
        $this->assertSame('300.00', (string) $unallocated->amount);
        $this->assertNull($unallocated->student_additional_fee_id);

        // Every line carries the header's identifiers, because the ledger reads them
        // off the lines.
        $this->assertTrue($items->every(fn ($item) => $item->or_number === 'OR-7001'));
    }

    /**
     * Approving with nothing but an amount is what the screen did before allocations
     * existed, and has to keep working the same way.
     */
    public function test_approving_without_allocations_posts_one_general_line(): void
    {
        $submission = $this->pendingSubmission();

        $this->withHeader('Authorization', 'Bearer cashier-token')
            ->postJson('/api/payment-receipt-submissions/'.$submission->id.'/approve', ['amount' => 5000])
            ->assertOk();

        $submission = $submission->fresh();
        $items = $submission->paymentTransaction->items()->get();

        $this->assertCount(1, $items);
        $this->assertSame('5000.00', (string) $items->first()->amount);
        $this->assertNull($items->first()->school_fee_id);
        // Still reachable through the old link, so anything reading it keeps resolving.
        $this->assertSame($items->first()->id, $submission->student_payment_id);
    }

    public function test_allocating_more_than_the_verified_amount_is_refused(): void
    {
        $submission = $this->pendingSubmission();

        $this->withHeader('Authorization', 'Bearer cashier-token')
            ->postJson('/api/payment-receipt-submissions/'.$submission->id.'/approve', [
                'amount' => 1000,
                'allocations' => [
                    ['school_fee_id' => $this->tuition->id, 'amount' => 900],
                    ['school_fee_id' => $this->miscellaneous->id, 'amount' => 400],
                ],
            ])
            ->assertStatus(422)
            ->assertJsonStructure(['errors' => ['allocations']]);

        $this->assertSame('pending', $submission->fresh()->status);
        $this->assertSame(0, PaymentTransaction::count());
    }

    /**
     * A fee belonging to another school must not be settleable from this one's queue.
     */
    public function test_allocating_to_a_fee_from_another_school_is_refused(): void
    {
        $foreignFee = SchoolFee::create([
            'institution_id' => Institution::factory()->create(['title' => 'Elsewhere'])->id,
            'name' => 'Tuition',
            'is_active' => true,
        ]);

        $this->withHeader('Authorization', 'Bearer cashier-token')
            ->postJson('/api/payment-receipt-submissions/'.$this->pendingSubmission()->id.'/approve', [
                'amount' => 1000,
                'allocations' => [['school_fee_id' => $foreignFee->id, 'amount' => 1000]],
            ])
            ->assertNotFound();

        $this->assertSame(0, PaymentTransaction::count());
    }

    // ------------------------------------------------- editing an approved receipt

    public function test_an_approved_receipts_payment_details_can_be_corrected(): void
    {
        $submission = $this->pendingSubmission();

        $this->withHeader('Authorization', 'Bearer cashier-token')
            ->postJson('/api/payment-receipt-submissions/'.$submission->id.'/approve', [
                'amount' => 3500,
                'allocations' => [['school_fee_id' => $this->tuition->id, 'amount' => 3500]],
            ])
            ->assertOk();

        $this->withHeader('Authorization', 'Bearer cashier-token')
            ->putJson('/api/payment-receipt-submissions/'.$submission->id.'/payment-details', [
                'payment_method' => 'Bank Transfer',
                'or_number' => 'OR-9090',
                'reference_number' => 'BDO-1234',
                'payment_date' => '2026-08-20',
                'remarks' => 'Cleared on the August statement',
            ])
            ->assertOk()
            ->assertJsonPath('data.payment_transaction.or_number', 'OR-9090');

        $transaction = $submission->fresh()->paymentTransaction;
        $this->assertSame('OR-9090', $transaction->or_number);
        $this->assertSame('BDO-1234', $transaction->reference_number);
        $this->assertSame('2026-08-20', $transaction->payment_date->toDateString());

        // The correction reaches the line items too — the ledger reads the OR number and
        // the date off them, so a header-only edit would never show up on the account.
        foreach ($transaction->items()->get() as $item) {
            $this->assertSame('OR-9090', $item->or_number);
            $this->assertSame('Bank Transfer', $item->payment_method);
            $this->assertSame('2026-08-20', $item->payment_date->toDateString());
        }

        // And the money is exactly where the approval left it.
        $this->assertSame('3500.00', (string) $transaction->total_amount);
        $this->assertEquals(3500.00, (float) $transaction->items()->sum('amount'));
        $this->assertSame('3500.00', (string) $submission->fresh()->amount);
    }

    /**
     * The screen edits the two receipt identifiers and sends nothing else, so everything it
     * does not send has to survive. Nulling the mode and the remark by omission would strip
     * a posted collection of how it was paid, silently, on an edit that only touched the OR
     * number.
     */
    public function test_correcting_the_identifiers_leaves_the_rest_of_the_collection_alone(): void
    {
        $submission = $this->pendingSubmission();

        $this->withHeader('Authorization', 'Bearer cashier-token')
            ->postJson('/api/payment-receipt-submissions/'.$submission->id.'/approve', [
                'amount' => 2000,
                'payment_method' => 'GCash',
                'payment_date' => '2026-08-10',
                'remarks' => 'Cleared same day',
            ])
            ->assertOk();

        $this->withHeader('Authorization', 'Bearer cashier-token')
            ->putJson('/api/payment-receipt-submissions/'.$submission->id.'/payment-details', [
                'or_number' => 'OR-5150',
                'reference_number' => '',
            ])
            ->assertOk();

        $transaction = $submission->fresh()->paymentTransaction;
        $this->assertSame('OR-5150', $transaction->or_number);
        $this->assertSame('GCash', $transaction->payment_method);
        $this->assertSame('2026-08-10', $transaction->payment_date->toDateString());
        $this->assertSame('Cleared same day', $transaction->remarks);

        // ...and the line items the ledger actually reads agree with the header.
        foreach ($transaction->items()->get() as $item) {
            $this->assertSame('OR-5150', $item->or_number);
            $this->assertSame('GCash', $item->payment_method);
            $this->assertSame('Cleared same day', $item->remarks);
        }
    }

    /**
     * A number sent empty is a correction, not an omission: a cashier who typed the wrong OR
     * number needs a way to take it back off the receipt.
     */
    public function test_an_identifier_sent_empty_is_cleared(): void
    {
        $submission = $this->pendingSubmission();

        $this->withHeader('Authorization', 'Bearer cashier-token')
            ->postJson('/api/payment-receipt-submissions/'.$submission->id.'/approve', [
                'amount' => 2000,
                'or_number' => 'OR-TYPO',
            ])
            ->assertOk();

        $this->withHeader('Authorization', 'Bearer cashier-token')
            ->putJson('/api/payment-receipt-submissions/'.$submission->id.'/payment-details', [
                'or_number' => '',
                'reference_number' => '',
            ])
            ->assertOk();

        $transaction = $submission->fresh()->paymentTransaction;
        $this->assertNull($transaction->or_number);
        $this->assertNull($transaction->items()->first()->or_number);

        // Freed, so the next receipt may legitimately take it.
        $this->recordPayment(['or_number' => 'OR-TYPO'])->assertCreated();
    }

    public function test_correcting_details_may_keep_the_receipts_own_or_number(): void
    {
        $submission = $this->pendingSubmission();

        $this->withHeader('Authorization', 'Bearer cashier-token')
            ->postJson('/api/payment-receipt-submissions/'.$submission->id.'/approve', [
                'amount' => 1000,
                'or_number' => 'OR-4242',
            ])
            ->assertOk();

        $this->withHeader('Authorization', 'Bearer cashier-token')
            ->putJson('/api/payment-receipt-submissions/'.$submission->id.'/payment-details', [
                'or_number' => 'OR-4242',
                'payment_method' => 'GCash',
            ])
            ->assertOk();

        $this->assertSame('GCash', $submission->fresh()->paymentTransaction->payment_method);
    }

    public function test_correcting_details_cannot_take_another_receipts_or_number(): void
    {
        $this->recordPayment(['or_number' => 'OR-TAKEN'])->assertCreated();

        $submission = $this->pendingSubmission();
        $this->withHeader('Authorization', 'Bearer cashier-token')
            ->postJson('/api/payment-receipt-submissions/'.$submission->id.'/approve', ['amount' => 1000])
            ->assertOk();

        $this->withHeader('Authorization', 'Bearer cashier-token')
            ->putJson('/api/payment-receipt-submissions/'.$submission->id.'/payment-details', [
                'or_number' => 'OR-TAKEN',
            ])
            ->assertStatus(422)
            ->assertJsonStructure(['errors' => ['or_number']]);

        $this->assertNull($submission->fresh()->paymentTransaction->or_number);
    }

    public function test_a_pending_receipt_has_no_payment_details_to_edit(): void
    {
        $this->withHeader('Authorization', 'Bearer cashier-token')
            ->putJson('/api/payment-receipt-submissions/'.$this->pendingSubmission()->id.'/payment-details', [
                'or_number' => 'OR-1',
            ])
            ->assertStatus(422);
    }

    public function test_a_read_only_finance_role_cannot_correct_payment_details(): void
    {
        $submission = $this->pendingSubmission();

        $this->withHeader('Authorization', 'Bearer cashier-token')
            ->postJson('/api/payment-receipt-submissions/'.$submission->id.'/approve', ['amount' => 1000])
            ->assertOk();

        $this->staffWithRole('Finance Viewer', ['finance.view'], 'viewer-token');

        $this->withHeader('Authorization', 'Bearer viewer-token')
            ->putJson('/api/payment-receipt-submissions/'.$submission->id.'/payment-details', [
                'or_number' => 'OR-1',
            ])
            ->assertForbidden();
    }

    /**
     * The queue is what the screen renders the subdivision from, so it has to come back
     * with the transaction and its line items attached.
     */
    public function test_the_queue_carries_the_subdivision_of_an_approved_receipt(): void
    {
        $submission = $this->pendingSubmission();

        $this->withHeader('Authorization', 'Bearer cashier-token')
            ->postJson('/api/payment-receipt-submissions/'.$submission->id.'/approve', [
                'amount' => 3500,
                'allocations' => [
                    ['school_fee_id' => $this->tuition->id, 'amount' => 2500],
                    ['school_fee_id' => $this->miscellaneous->id, 'amount' => 1000],
                ],
            ])
            ->assertOk();

        $this->withHeader('Authorization', 'Bearer cashier-token')
            ->getJson('/api/payment-receipt-submissions?status=approved')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonCount(2, 'data.0.payment_transaction.items')
            ->assertJsonPath('data.0.payment_transaction.total_amount', '3500.00');
    }
}
