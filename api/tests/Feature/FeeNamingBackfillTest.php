<?php

namespace Tests\Feature;

use App\Models\ClassSection;
use App\Models\FeeNamingRun;
use App\Models\Institution;
use App\Models\PaymentReceiptSubmission;
use App\Models\PaymentTransaction;
use App\Models\PaymentVoidRequest;
use App\Models\SchoolFee;
use App\Models\SchoolFeeDefault;
use App\Models\Student;
use App\Models\StudentInstitution;
use App\Models\StudentPayment;
use App\Models\StudentSection;
use App\Models\User;
use App\Models\UserInstitution;
use App\Services\Finance\FeeNamingService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * Naming the fees on a General / Other collection.
 *
 * The operation's whole claim is that it writes down figures the ledger is already
 * reporting, so nothing about what the student owes moves — only the receipt gains fee
 * names. Every test here is ultimately that claim: snapshot the ledger, run the backfill,
 * and the ledger must come back byte-identical.
 */
class FeeNamingBackfillTest extends TestCase
{
    use RefreshDatabase;

    private const YEAR = '2026-2027';
    private const GRADE = 'Grade 7';

    private Institution $institution;
    private Student $student;
    private User $user;
    private SchoolFee $tuition;
    private SchoolFee $books;
    private SchoolFee $misc;

    protected function setUp(): void
    {
        parent::setUp();

        // Before the first due date, so no late fee joins the breakdown.
        Carbon::setTestNow('2026-05-11 08:00:00');

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

        // Deliberately not round: the shares come out to repeating centavos, which is
        // where a spread that does not hand out its remainder would drift.
        $this->tuition = $this->chargeStandardFee('Tuition', 7500);
        $this->books = $this->chargeStandardFee('Books', 5000);
        $this->misc = $this->chargeStandardFee('Miscellaneous', 750.50);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function service(): FeeNamingService
    {
        return app(FeeNamingService::class);
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

    /** Posts a collection through the till; a null fee id is its General / Other line. */
    private function pay(float $amount, ?string $schoolFeeId = null): array
    {
        return $this->withHeader('Authorization', 'Bearer test-token')
            ->postJson('/api/student-payments', [
                'student_id' => $this->student->id,
                'academic_year' => self::YEAR,
                'items' => [[
                    'school_fee_id' => $schoolFeeId,
                    'additional_fee_id' => null,
                    'amount' => $amount,
                ]],
            ])->assertCreated()->json('data');
    }

    /** Marks a posted collection as having come from an approved uploaded receipt. */
    private function asReceipt(string $transactionId, float $amount): PaymentReceiptSubmission
    {
        return PaymentReceiptSubmission::create([
            'institution_id' => $this->institution->id,
            'student_id' => $this->student->id,
            'academic_year' => self::YEAR,
            'installment_sequence' => 1,
            'amount' => $amount,
            'file_name' => 'proof.jpg',
            'file_path' => 'proof.jpg',
            'mime_type' => 'image/jpeg',
            'status' => PaymentReceiptSubmission::STATUS_APPROVED,
            'payment_transaction_id' => $transactionId,
        ]);
    }

    private function ledger(): array
    {
        return $this->withHeader('Authorization', 'Bearer test-token')
            ->getJson("/api/students/{$this->student->id}/ledger?academic_year=" . self::YEAR)
            ->assertOk()
            ->json('data');
    }

    /** Charge / discount / paid / outstanding per fee, which must survive a run intact. */
    private function balances(array $ledger): array
    {
        return collect($ledger['fee_breakdown'])
            ->mapWithKeys(fn ($row) => [$row['fee_name'] => [
                'charge' => round((float) $row['charge'], 2),
                'discount' => round((float) $row['discount'], 2),
                'paid' => round((float) $row['paid'], 2),
                'outstanding' => round((float) $row['outstanding'], 2),
            ]])
            ->all();
    }

    private function unnamedLineCount(): int
    {
        return StudentPayment::where('student_id', $this->student->id)
            ->whereNull('voided_at')
            ->whereNull('school_fee_id')
            ->whereNull('student_additional_fee_id')
            ->count();
    }

    /**
     * The claim, end to end. Three unnamed collections against three fees, and after the
     * run every per-fee figure and the ledger balance are exactly what they were.
     */
    public function test_naming_the_fees_moves_no_balance(): void
    {
        $this->pay(5000);
        $this->pay(1750);
        $this->pay(300);

        $before = $this->ledger();
        $balancesBefore = $this->balances($before);

        // Every peso is accounted against a fee before the run, by the ledger's own read.
        $this->assertEquals(0.0, round((float) $before['unallocated_payments'], 2));
        $this->assertGreaterThan(0, collect($before['fee_breakdown'])->sum('general_applied'));

        $run = $this->service()->apply(
            $this->institution->id,
            self::YEAR,
            FeeNamingService::SCOPE_ALL,
            $this->user->id
        );

        $after = $this->ledger();

        $this->assertSame($balancesBefore, $this->balances($after));
        $this->assertEquals(
            round((float) $before['totals']['balance'], 2),
            round((float) $after['totals']['balance'], 2)
        );

        // The money is now named, so nothing is left to share at read time.
        $this->assertEquals(0.0, collect($after['fee_breakdown'])->sum('general_applied'));
        $this->assertSame(0, $this->unnamedLineCount());
        $this->assertSame(3, $run->receipt_count);
        $this->assertEquals(7050.0, round((float) $run->total_amount, 2));
    }

    /** Each collection still totals what it collected, and now says what it settled. */
    public function test_each_collection_keeps_its_total_and_gains_fee_names(): void
    {
        $first = $this->pay(5000);
        $this->pay(1750);

        $this->service()->apply($this->institution->id, self::YEAR, FeeNamingService::SCOPE_ALL);

        foreach (PaymentTransaction::where('student_id', $this->student->id)->get() as $transaction) {
            $lines = StudentPayment::where('payment_transaction_id', $transaction->id)->get();

            $this->assertEquals(
                round((float) $transaction->total_amount, 2),
                round((float) $lines->sum('amount'), 2),
                'the lines must still add up to what the receipt collected'
            );
            $this->assertTrue(
                $lines->every(fn ($line) => $line->school_fee_id || $line->student_additional_fee_id),
                'no line should be left unnamed'
            );
        }

        // The receipt whose id anything else may hold is renamed in place, not replaced.
        $this->assertNotNull(StudentPayment::find($first['items'][0]['id']));
    }

    /** Undo is the exact inverse: one unnamed line per collection, balances untouched. */
    public function test_undoing_a_run_restores_the_original_lines(): void
    {
        $this->pay(5000);
        $this->pay(1750);

        $before = $this->balances($this->ledger());
        $lineIdsBefore = StudentPayment::where('student_id', $this->student->id)
            ->orderBy('created_at')->pluck('id')->all();

        $run = $this->service()->apply($this->institution->id, self::YEAR, FeeNamingService::SCOPE_ALL);
        $result = $this->service()->revert($run->fresh(), $this->user->id);

        $this->assertSame(2, $result['restored']);
        $this->assertSame($before, $this->balances($this->ledger()));
        $this->assertSame(2, $this->unnamedLineCount());

        // Same rows as before, not replacements wearing the same amounts.
        $this->assertSame(
            $lineIdsBefore,
            StudentPayment::where('student_id', $this->student->id)
                ->orderBy('created_at')->pluck('id')->all()
        );
        $this->assertTrue($run->fresh()->isReverted());
        $this->assertSame(
            0,
            StudentPayment::where('fee_naming_run_id', $run->id)->count(),
            'a reverted run should leave no stamps behind'
        );
    }

    /**
     * More general money than the fees owe. The surplus names no fee, so the student is
     * left alone rather than having the difference guessed onto a row.
     */
    public function test_a_student_who_overpaid_is_skipped(): void
    {
        // 13,250.50 charged in total; pay well past it.
        $this->pay(20000);

        $before = $this->balances($this->ledger());
        $preview = $this->service()->preview($this->institution->id, self::YEAR, FeeNamingService::SCOPE_ALL);

        $this->assertCount(0, $preview['students']);
        $this->assertCount(1, $preview['skipped']);
        $this->assertStringContainsString('more than the fees owe', $preview['skipped'][0]['reason']);

        $this->service()->apply($this->institution->id, self::YEAR, FeeNamingService::SCOPE_ALL);

        $this->assertSame(1, $this->unnamedLineCount());
        $this->assertSame($before, $this->balances($this->ledger()));
    }

    /** A collection somebody is disputing is not rewritten underneath them. */
    public function test_a_collection_with_an_open_void_request_is_left_alone(): void
    {
        $posted = $this->pay(5000);

        PaymentVoidRequest::create([
            'institution_id' => $this->institution->id,
            'student_id' => $this->student->id,
            'academic_year' => self::YEAR,
            'payment_transaction_id' => $posted['id'],
            'receipt_number' => $posted['receipt_number'],
            'amount' => 5000,
            'requested_by' => $this->user->id,
            'request_note' => 'Wrong student',
            'status' => PaymentVoidRequest::STATUS_PENDING,
        ]);

        $preview = $this->service()->preview($this->institution->id, self::YEAR, FeeNamingService::SCOPE_ALL);

        $this->assertCount(0, $preview['students']);
        $this->assertSame(0, $preview['line_count']);

        $this->service()->apply($this->institution->id, self::YEAR, FeeNamingService::SCOPE_ALL);
        $this->assertSame(1, $this->unnamedLineCount());
    }

    /**
     * The default scope is collections that came from an uploaded receipt. A General /
     * Other line a cashier typed at the till was a deliberate choice and is not swept up.
     */
    public function test_the_receipts_scope_leaves_till_entered_general_payments_alone(): void
    {
        $fromReceipt = $this->pay(5000);
        $this->asReceipt($fromReceipt['id'], 5000);
        $this->pay(1750); // typed at the till

        $preview = $this->service()->preview($this->institution->id, self::YEAR, FeeNamingService::SCOPE_RECEIPTS);

        // The till line puts the student's general money partly out of scope, and naming
        // only a subset of it would write figures the ledger never reported.
        $this->assertCount(0, $preview['students']);
        $this->assertCount(1, $preview['skipped']);
        $this->assertStringContainsString('out of scope', $preview['skipped'][0]['reason']);

        $this->service()->apply($this->institution->id, self::YEAR, FeeNamingService::SCOPE_RECEIPTS);
        $this->assertSame(2, $this->unnamedLineCount());
    }

    /** A receipt-only institution names cleanly under the default scope. */
    public function test_a_receipt_collection_is_named_under_the_receipts_scope(): void
    {
        $posted = $this->pay(5000);
        $this->asReceipt($posted['id'], 5000);

        $before = $this->balances($this->ledger());

        $run = $this->service()->apply($this->institution->id, self::YEAR, FeeNamingService::SCOPE_RECEIPTS);

        $this->assertSame(1, $run->receipt_count);
        $this->assertSame(0, $this->unnamedLineCount());
        $this->assertSame($before, $this->balances($this->ledger()));
    }

    /** Running it twice does nothing the second time. */
    public function test_a_second_run_finds_nothing_left_to_name(): void
    {
        $this->pay(5000);

        $this->service()->apply($this->institution->id, self::YEAR, FeeNamingService::SCOPE_ALL);
        $second = $this->service()->apply($this->institution->id, self::YEAR, FeeNamingService::SCOPE_ALL);

        $this->assertSame(0, $second->line_count);
        $this->assertEquals(0.0, round((float) $second->total_amount, 2));
    }

    /** Voided money is somebody's correction; an undo must not quietly undo it too. */
    public function test_undo_is_refused_when_a_named_line_has_since_been_voided(): void
    {
        $this->pay(5000);

        $run = $this->service()->apply($this->institution->id, self::YEAR, FeeNamingService::SCOPE_ALL);

        StudentPayment::where('fee_naming_run_id', $run->id)
            ->first()
            ->update(['voided_at' => now(), 'voided_by' => $this->user->id]);

        $this->expectException(\RuntimeException::class);
        $this->service()->revert($run->fresh(), $this->user->id);
    }

    /** Another school's collections are never touched. */
    public function test_a_run_is_scoped_to_its_own_institution(): void
    {
        $this->pay(5000);

        $other = Institution::factory()->create();
        $run = $this->service()->apply($other->id, self::YEAR, FeeNamingService::SCOPE_ALL);

        $this->assertSame(0, $run->line_count);
        $this->assertSame(1, $this->unnamedLineCount());
        $this->assertSame(0, FeeNamingRun::where('institution_id', $this->institution->id)->count());
    }
}
