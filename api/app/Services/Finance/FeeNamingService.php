<?php

namespace App\Services\Finance;

use App\Models\FeeNamingRun;
use App\Models\PaymentReceiptSubmission;
use App\Models\PaymentVoidRequest;
use App\Models\Student;
use App\Models\StudentPayment;
use Illuminate\Support\Facades\DB;

/**
 * Writes down the fees a "General / Other" collection already settled.
 *
 * A general collection names no fee, so the receipt it posted names none either: the till,
 * a reprint and any fee-by-fee reconciliation all read "General / Other". The per-fee
 * balances were never wrong — the ledger shares that money across the fees that still owe
 * every time it is read (FeeBreakdownBuilder, `general_applied`). What this does is write
 * that share down as real line items.
 *
 * **It decides nothing.** Every figure it writes is one the ledger is already reporting, so
 * the receipt total never moves and no per-fee balance changes. A student's Fees view is
 * identical before and after; the only difference is that the receipt now says what it
 * paid for. That is the entire safety case, and it is why the shares must come from
 * FeeBreakdownBuilder::forStudent() and never be recomputed here.
 *
 * What it does change is that the money stops floating. General money re-spreads itself
 * when a new charge appears; named money stays where it was put. Pinning it is the point,
 * but it is a decision about the books, so it is recorded as a revertible run.
 */
class FeeNamingService
{
    /** Collections a cashier deliberately entered as General / Other at the till. */
    public const SCOPE_ALL = 'all';

    /** Only collections posted by approving an uploaded receipt. */
    public const SCOPE_RECEIPTS = 'receipts';

    public function __construct(private FeeBreakdownBuilder $breakdown)
    {
    }

    /**
     * What a run would write, without writing it.
     *
     * @return array{
     *     students: array<int, array<string, mixed>>,
     *     receipt_count: int, line_count: int, total_amount: float,
     *     skipped: array<int, array<string, mixed>>
     * }
     */
    public function preview(
        string $institutionId,
        ?string $academicYear = null,
        string $scope = self::SCOPE_RECEIPTS
    ): array {
        return $this->plan($institutionId, $academicYear, $scope);
    }

    /**
     * Name the fees, as one revertible run.
     *
     * The plan is recomputed here rather than taken from a preview the caller is holding:
     * a preview is a screenshot, and a payment posted in between would make it a stale
     * instruction to write figures the ledger no longer reports.
     */
    public function apply(
        string $institutionId,
        ?string $academicYear = null,
        string $scope = self::SCOPE_RECEIPTS,
        ?string $userId = null
    ): FeeNamingRun {
        return DB::transaction(function () use ($institutionId, $academicYear, $scope, $userId) {
            $plan = $this->plan($institutionId, $academicYear, $scope);

            $run = FeeNamingRun::create([
                'institution_id' => $institutionId,
                'academic_year' => $academicYear,
                'receipt_count' => $plan['receipt_count'],
                'line_count' => $plan['line_count'],
                'total_amount' => $plan['total_amount'],
                'created_by' => $userId,
            ]);

            foreach ($plan['students'] as $student) {
                foreach ($student['lines'] as $line) {
                    $this->nameLine($line, $run->id);
                }
            }

            return $run;
        });
    }

    /**
     * Put a run back: the renamed originals return to one unnamed line each, and the
     * siblings the run inserted are removed.
     *
     * Also total-neutral, so it is the exact inverse. Refused if anything the run touched
     * has since been voided — that is money somebody has deliberately taken back, and
     * collapsing it here would quietly resurrect or destroy their correction.
     *
     * @return array{restored: int, deleted: int}
     */
    public function revert(FeeNamingRun $run, ?string $userId = null): array
    {
        return DB::transaction(function () use ($run, $userId) {
            $rows = StudentPayment::where('fee_naming_run_id', $run->id)->get();

            if ($rows->contains(fn ($row) => $row->voided_at !== null)) {
                throw new \RuntimeException(
                    'Some of the lines this run named have since been voided, so it cannot be undone automatically.'
                );
            }

            $originals = $rows->filter(fn ($row) => $row->fee_naming_original_amount !== null);
            $inserted = $rows->filter(fn ($row) => $row->fee_naming_original_amount === null);

            foreach ($originals as $row) {
                $row->update([
                    'school_fee_id' => null,
                    'student_additional_fee_id' => null,
                    'amount' => $row->fee_naming_original_amount,
                    'fee_naming_run_id' => null,
                    'fee_naming_original_amount' => null,
                ]);
            }

            // Safe to delete outright: the run only ever inserted these, so nothing points
            // at them. A receipt's `student_payment_id` tracks the *original* row, which
            // the run renamed in place rather than replacing, precisely so this holds.
            $deleted = 0;
            foreach ($inserted as $row) {
                $row->delete();
                $deleted++;
            }

            $run->update(['reverted_at' => now(), 'reverted_by' => $userId]);

            return ['restored' => $originals->count(), 'deleted' => $deleted];
        });
    }

    /**
     * Work out, per student, which unnamed lines become which fees.
     *
     * @return array{
     *     students: array<int, array<string, mixed>>,
     *     receipt_count: int, line_count: int, total_amount: float,
     *     skipped: array<int, array<string, mixed>>
     * }
     */
    private function plan(string $institutionId, ?string $academicYear, string $scope): array
    {
        $candidates = $this->candidateLines($institutionId, $academicYear, $scope);

        $students = [];
        $skipped = [];
        $lineCount = 0;
        $receipts = [];
        $total = 0.0;

        foreach ($candidates->groupBy(fn ($row) => $row->student_id . '|' . $row->academic_year) as $key => $rows) {
            [$studentId, $year] = explode('|', $key, 2);

            // Every unnamed line for the student counts toward the shares, even one this
            // run is not allowed to touch — the ledger spread the whole general total, and
            // taking a subset of it would name figures the ledger never reported.
            $allUnnamed = $this->unnamedLines($institutionId, $studentId, $year);
            $generalTotal = round((float) $allUnnamed->sum('amount'), 2);

            $reason = null;
            if ($allUnnamed->count() !== $rows->count()) {
                $reason = 'Some of this student\'s general collections are out of scope for this run.';
            } elseif ($generalTotal <= 0) {
                $reason = 'Nothing collected as General / Other.';
            }

            if (! $reason) {
                [$breakdown, $unallocated] = $this->breakdown->forStudent($institutionId, $studentId, $year);

                if (round((float) $unallocated, 2) > 0.001) {
                    // More general money than the fees still owe. That surplus is an
                    // advance the student is owed back, and there is no fee to name it
                    // against — exactly the case where guessing would be wrong.
                    $reason = 'Paid more than the fees owe, so part of it names no fee ('
                        . number_format((float) $unallocated, 2) . ' unapplied).';
                } else {
                    $shares = $this->sharesFrom($breakdown);

                    if ($shares === []) {
                        $reason = 'No outstanding fees to name it against.';
                    } elseif (abs(array_sum(array_column($shares, 'amount')) - $generalTotal) > 0.001) {
                        // Belt and braces: if the ledger's own shares do not add back to
                        // the general total, writing them down would move the balance.
                        $reason = 'The ledger\'s per-fee shares do not add up to the general total.';
                    } else {
                        $assigned = $this->assign($rows->values(), $shares);
                        $students[] = [
                            'student_id' => $studentId,
                            'student_name' => $this->nameOf($studentId),
                            'academic_year' => $year,
                            'general_total' => $generalTotal,
                            'lines' => $assigned,
                        ];
                        $lineCount += count($assigned);
                        foreach ($assigned as $line) {
                            // One collection can carry more than one unnamed line, so the
                            // receipts touched are the distinct transactions behind them.
                            if ($line['payment_transaction_id']) {
                                $receipts[$line['payment_transaction_id']] = true;
                            }
                        }
                        $total += $generalTotal;
                        continue;
                    }
                }
            }

            $skipped[] = [
                'student_id' => $studentId,
                'student_name' => $this->nameOf($studentId),
                'academic_year' => $year,
                'general_total' => $generalTotal,
                'reason' => $reason,
            ];
        }

        return [
            'students' => $students,
            'receipt_count' => count($receipts),
            'line_count' => $lineCount,
            'total_amount' => round($total, 2),
            'skipped' => $skipped,
        ];
    }

    /**
     * The unnamed, live lines this run is allowed to touch.
     *
     * A transaction with a void request open on it is left alone whatever the scope: that
     * is money somebody is already disputing, and rewriting its lines underneath them
     * would change what they are arguing about.
     */
    private function candidateLines(string $institutionId, ?string $academicYear, string $scope)
    {
        $query = StudentPayment::where('institution_id', $institutionId)
            ->whereNull('voided_at')
            ->whereNull('school_fee_id')
            ->whereNull('student_additional_fee_id')
            ->whereNull('fee_naming_run_id')
            ->orderBy('payment_date')
            ->orderBy('created_at');

        if ($academicYear) {
            $query->where('academic_year', $academicYear);
        }

        if ($scope === self::SCOPE_RECEIPTS) {
            $query->whereIn(
                'payment_transaction_id',
                PaymentReceiptSubmission::where('institution_id', $institutionId)
                    ->where('status', PaymentReceiptSubmission::STATUS_APPROVED)
                    ->whereNotNull('payment_transaction_id')
                    ->select('payment_transaction_id')
            );
        }

        // Pending: somebody is disputing this collection right now. Approved: part of it
        // has already been taken back, so what is left is not a whole receipt any more.
        // A disapproved request means the collection stands, and is no reason to skip it.
        $disputed = PaymentVoidRequest::whereNotNull('payment_transaction_id')
            ->whereIn('status', [PaymentVoidRequest::STATUS_PENDING, PaymentVoidRequest::STATUS_APPROVED])
            ->pluck('payment_transaction_id')
            ->filter()
            ->all();

        if ($disputed !== []) {
            $query->whereNotIn('payment_transaction_id', $disputed);
        }

        return $query->get();
    }

    /** Every live unnamed line for a student and year, in scope or not. */
    private function unnamedLines(string $institutionId, string $studentId, string $academicYear)
    {
        return StudentPayment::where('institution_id', $institutionId)
            ->where('student_id', $studentId)
            ->where('academic_year', $academicYear)
            ->whereNull('voided_at')
            ->whereNull('school_fee_id')
            ->whereNull('student_additional_fee_id')
            ->orderBy('payment_date')
            ->orderBy('created_at')
            ->get();
    }

    /**
     * The per-fee shares of general money the ledger is already reporting.
     *
     * @return array<int, array{fee_id: string, fee_name: string, is_additional: bool, amount: float}>
     */
    private function sharesFrom($breakdown): array
    {
        $shares = [];
        foreach ($breakdown as $row) {
            $amount = round((float) ($row['general_applied'] ?? 0), 2);
            if ($amount > 0) {
                $shares[] = [
                    'fee_id' => $row['fee_id'],
                    'fee_name' => $row['fee_name'],
                    'is_additional' => (bool) $row['is_additional'],
                    'amount' => $amount,
                ];
            }
        }

        return $shares;
    }

    /**
     * Hand the shares out across the unnamed lines, oldest first.
     *
     * Filling one line at a time rather than splitting every fee across every line keeps
     * the result readable: three receipts against four fees become a handful of lines that
     * each name one or two fees, not twelve slivers. The shares and the line amounts have
     * already been checked to agree in total, so this consumes both exactly.
     *
     * @return array<int, array<string, mixed>>
     */
    private function assign($lines, array $shares): array
    {
        $queue = $shares;
        $assigned = [];

        foreach ($lines as $line) {
            $remaining = round((float) $line->amount, 2);
            $parts = [];

            while ($remaining > 0.001 && $queue !== []) {
                $share = &$queue[0];
                $take = min($remaining, $share['amount']);
                $take = round($take, 2);

                if ($take > 0) {
                    $parts[] = [
                        'fee_id' => $share['fee_id'],
                        'fee_name' => $share['fee_name'],
                        'is_additional' => $share['is_additional'],
                        'amount' => $take,
                    ];
                    $share['amount'] = round($share['amount'] - $take, 2);
                    $remaining = round($remaining - $take, 2);
                }

                if ($share['amount'] <= 0.001) {
                    unset($share);
                    array_shift($queue);
                } else {
                    unset($share);
                }
            }

            $assigned[] = [
                'payment_id' => $line->id,
                'payment_transaction_id' => $line->payment_transaction_id,
                'receipt_number' => $line->receipt_number,
                'amount' => round((float) $line->amount, 2),
                'parts' => $parts,
            ];
        }

        return $assigned;
    }

    /**
     * Write one line's split.
     *
     * The existing row is renamed in place to carry the first part and the rest are
     * inserted beside it, rather than deleting it and writing N fresh rows: a receipt's
     * `student_payment_id` points at it, and the undo needs one row per line it can
     * restore rather than reconstruct.
     */
    private function nameLine(array $line, string $runId): void
    {
        $parts = $line['parts'];
        if ($parts === []) {
            return;
        }

        $original = StudentPayment::find($line['payment_id']);
        if (! $original) {
            return;
        }

        $first = array_shift($parts);
        $original->update([
            'school_fee_id' => $first['is_additional'] ? null : $first['fee_id'],
            'student_additional_fee_id' => $first['is_additional'] ? $first['fee_id'] : null,
            'amount' => $first['amount'],
            'fee_naming_run_id' => $runId,
            // Only the renamed original carries this; it is what the undo restores to.
            'fee_naming_original_amount' => $line['amount'],
        ]);

        foreach ($parts as $part) {
            StudentPayment::create([
                'institution_id' => $original->institution_id,
                'student_id' => $original->student_id,
                'payment_transaction_id' => $original->payment_transaction_id,
                'school_fee_id' => $part['is_additional'] ? null : $part['fee_id'],
                'student_additional_fee_id' => $part['is_additional'] ? $part['fee_id'] : null,
                'academic_year' => $original->academic_year,
                'amount' => $part['amount'],
                // Copied verbatim: these siblings are the same collection, and a receipt
                // reprint reads them as one.
                'payment_date' => $original->payment_date,
                'payment_method' => $original->payment_method,
                'reference_number' => $original->reference_number,
                'or_number' => $original->or_number,
                'receipt_number' => $original->receipt_number,
                'remarks' => $original->remarks,
                'received_by' => $original->received_by,
                'fee_naming_run_id' => $runId,
                'fee_naming_original_amount' => null,
            ]);
        }
    }

    private function nameOf(string $studentId): string
    {
        $student = Student::find($studentId);

        return $student
            ? trim($student->first_name . ' ' . $student->last_name)
            : 'Unknown student';
    }
}
