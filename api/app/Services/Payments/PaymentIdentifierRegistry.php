<?php

namespace App\Services\Payments;

use App\Models\PaymentReceiptSubmission;
use App\Models\PaymentTransaction;
use App\Models\StudentPayment;

/**
 * Tells the cashier when a receipt identifier — the OR number or the reference number —
 * is already on another collection. It does not stop them.
 *
 * These were briefly held unique per institution, on the reasoning that a number names
 * one collection and two of them make both unreconcilable. Real books say otherwise. A
 * school writes one OR across several postings all the time: the tuition and the ₱60
 * that came with it go in as two entries, siblings pay together on one receipt, an
 * installment is settled in two goes. Refusing the second entry does not make the books
 * tidier — it stops the cashier recording money that was actually collected.
 *
 * So the number is free, and a reuse is surfaced instead: the write goes through and the
 * response carries a warning naming what already holds it, which is enough for the
 * cashier to catch the case they *did* mean to catch — the same entry keyed twice.
 *
 * Where the numbers live:
 *
 *   - `payment_transactions` is the header, and its `student_payments` line items
 *     denormalize its number — a four-fee receipt repeats its own OR number four times,
 *     which is why the line items are never counted as separate holders.
 *   - `student_payments` rows with no `payment_transaction_id` are standalone payments
 *     (the legacy single-fee path) and hold a number of their own.
 *
 * A voided receipt is not a holder. Voiding is usually the cashier catching their own
 * keying mistake with the physical OR still in hand, and warning them about the entry
 * they just took back is noise on the one path where reuse is certainly correct.
 */
class PaymentIdentifierRegistry
{
    /**
     * Field => how the cashier sees it named on screen.
     */
    public const LABELS = [
        'or_number' => 'OR number',
        'reference_number' => 'Reference number',
    ];

    /**
     * Blank means "not issued". Stored as NULL rather than an empty string so a receipt
     * that leaves a number off does not read as one carrying the number "".
     */
    public static function normalize(mixed $value): ?string
    {
        $trimmed = trim((string) ($value ?? ''));

        return $trimmed === '' ? null : $trimmed;
    }

    /**
     * Which of the given identifiers are already on another live collection.
     *
     * Shaped like Laravel's validation errors — keyed by field, a list of sentences —
     * so the same screen can render them beside the same input it renders errors on.
     * They ride along with a successful write, so an empty array is the ordinary case.
     *
     * @param  array<string, string|null>  $values  keyed by field name
     * @param  string|null  $exceptTransactionId  the transaction being edited, which is not its own duplicate
     * @param  string|null  $exceptPaymentId  the standalone payment being edited, likewise
     * @return array<string, string[]>
     */
    public static function warnings(
        string $institutionId,
        array $values,
        ?string $exceptTransactionId = null,
        ?string $exceptPaymentId = null
    ): array {
        $warnings = [];

        foreach (self::LABELS as $field => $label) {
            $value = self::normalize($values[$field] ?? null);
            if ($value === null) {
                continue;
            }

            $holders = self::liveHolders($institutionId, $field, $value, $exceptTransactionId, $exceptPaymentId);
            if ($holders === []) {
                continue;
            }

            $warnings[$field] = [self::sentence($label, $value, array_map(self::summarize(...), $holders))];
        }

        return $warnings;
    }

    /**
     * The live collections already carrying these identifiers, in full.
     *
     * `warnings()` exists to be read after the fact — the write happened, here is a
     * sentence about it. This is the other direction: asked *before* posting, so the
     * screen can stop and show the reviewer what already holds the number and let them
     * decide. That means the slim three-field shape is not enough. A reviewer looking at
     * a reference number they are about to reuse needs to see which collection it is, whose
     * it is, and — when the holder was itself posted from an uploaded receipt — the image
     * that was verified for it, because side by side with the one in front of them that is
     * what settles whether this is the same payment keyed twice or a genuine second one.
     *
     * @param  array<string, string|null>  $values  keyed by field name
     * @return array<string, array<int, array<string, mixed>>>  fields with at least one holder
     */
    public static function collisions(
        string $institutionId,
        array $values,
        ?string $exceptTransactionId = null,
        ?string $exceptPaymentId = null
    ): array {
        $collisions = [];

        foreach (array_keys(self::LABELS) as $field) {
            $value = self::normalize($values[$field] ?? null);
            if ($value === null) {
                continue;
            }

            $holders = self::liveHolders($institutionId, $field, $value, $exceptTransactionId, $exceptPaymentId);
            if ($holders === []) {
                continue;
            }

            $submissions = self::submissionsFor($holders);

            $collisions[$field] = array_map(
                fn ($holder) => self::describe($holder, $submissions),
                $holders
            );
        }

        return $collisions;
    }

    /**
     * One holder, as the screen shows it.
     *
     * @param  array<string, PaymentReceiptSubmission>  $submissions  keyed by holder id
     * @return array<string, mixed>
     */
    private static function describe(PaymentTransaction|StudentPayment $holder, array $submissions): array
    {
        $isTransaction = $holder instanceof PaymentTransaction;
        $submission = $submissions[$holder->getKey()] ?? null;

        return [
            'kind' => $isTransaction ? 'transaction' : 'payment',
            'id' => $holder->getKey(),
            'receipt_number' => $holder->receipt_number,
            'or_number' => $holder->or_number,
            'reference_number' => $holder->reference_number,
            'payment_method' => $holder->payment_method,
            'payment_date' => $holder->payment_date?->toDateString(),
            'academic_year' => $holder->academic_year,
            'remarks' => $holder->remarks,
            // A transaction's total is the whole collection; a standalone payment is its own.
            'amount' => (float) ($isTransaction ? $holder->total_amount : $holder->amount),
            'posted_at' => $holder->created_at?->toIso8601String(),
            'student' => $holder->student ? [
                'id' => $holder->student->id,
                'lrn' => $holder->student->lrn,
                'first_name' => $holder->student->first_name,
                'middle_name' => $holder->student->middle_name,
                'last_name' => $holder->student->last_name,
            ] : null,
            // Present only when this collection was itself posted from a student upload.
            'receipt_submission' => $submission ? [
                'id' => $submission->id,
                'file_name' => $submission->file_name,
                'mime_type' => $submission->mime_type,
                'url' => $submission->url,
                'installment_sequence' => $submission->installment_sequence,
                'installment_label' => $submission->installment_label,
                'uploaded_at' => $submission->created_at?->toIso8601String(),
            ] : null,
        ];
    }

    /**
     * The uploaded receipt behind each holder, keyed by that holder's id.
     *
     * One query for the lot rather than one per holder. A transaction is matched by
     * `payment_transaction_id`; a standalone payment predates transactions and is matched
     * by `student_payment_id`, which is the only link those approvals ever got.
     *
     * @param  array<int, PaymentTransaction|StudentPayment>  $holders
     * @return array<string, PaymentReceiptSubmission>
     */
    private static function submissionsFor(array $holders): array
    {
        $transactionIds = [];
        $paymentIds = [];

        foreach ($holders as $holder) {
            if ($holder instanceof PaymentTransaction) {
                $transactionIds[] = $holder->getKey();
            } else {
                $paymentIds[] = $holder->getKey();
            }
        }

        if ($transactionIds === [] && $paymentIds === []) {
            return [];
        }

        $submissions = PaymentReceiptSubmission::query()
            ->when($transactionIds !== [], fn ($query) => $query->orWhereIn('payment_transaction_id', $transactionIds))
            ->when($paymentIds !== [], fn ($query) => $query->orWhereIn('student_payment_id', $paymentIds))
            ->orderByDesc('created_at')
            ->get();

        $byHolder = [];

        foreach ($submissions as $submission) {
            // First wins: ordered newest-first, so a holder linked from more than one
            // submission shows the most recent upload rather than an arbitrary one.
            foreach ([$submission->payment_transaction_id, $submission->student_payment_id] as $holderId) {
                if ($holderId && !isset($byHolder[$holderId])) {
                    $byHolder[$holderId] = $submission;
                }
            }
        }

        return $byHolder;
    }

    /**
     * One sentence naming the most recent holder, and how many others there are.
     *
     * @param  array<int, array{receipt_number: string|null, student: string|null, payment_date: string|null}>  $holders
     */
    private static function sentence(string $label, string $value, array $holders): string
    {
        $first = $holders[0];
        $where = 'receipt ' . ($first['receipt_number'] ?: 'an earlier collection');

        if ($first['student']) {
            $where .= ' for ' . $first['student'];
        }
        if ($first['payment_date']) {
            $where .= ' on ' . $first['payment_date'];
        }

        $others = count($holders) - 1;
        $rest = match (true) {
            $others === 1 => ', and 1 other collection',
            $others > 1 => sprintf(', and %d other collections', $others),
            default => '',
        };

        return sprintf('%s %s is already on %s%s. Post it again only if that is a separate collection.', $label, $value, $where, $rest);
    }

    /**
     * Live collections already carrying this identifier, newest first.
     *
     * Returns the models rather than a shape, because the two callers want different
     * things from them — a sentence, or the full record the collision screen renders —
     * and the query that finds them is the same either way.
     *
     * @return array<int, PaymentTransaction|StudentPayment>
     */
    private static function liveHolders(
        string $institutionId,
        string $field,
        string $value,
        ?string $exceptTransactionId,
        ?string $exceptPaymentId
    ): array {
        $studentColumns = 'student:id,lrn,first_name,middle_name,last_name';

        $transactions = PaymentTransaction::query()
            ->with($studentColumns)
            ->where('institution_id', $institutionId)
            ->where($field, $value)
            ->whereNull('voided_at')
            ->when($exceptTransactionId, fn ($query) => $query->whereKeyNot($exceptTransactionId))
            ->orderByDesc('created_at')
            ->get();

        $standalone = StudentPayment::query()
            ->with($studentColumns)
            ->where('institution_id', $institutionId)
            ->whereNull('payment_transaction_id')
            ->whereNull('voided_at')
            ->where($field, $value)
            ->when($exceptPaymentId, fn ($query) => $query->whereKeyNot($exceptPaymentId))
            ->orderByDesc('created_at')
            ->get();

        return $transactions->concat($standalone)
            ->sortByDesc('created_at')
            ->values()
            ->all();
    }

    /**
     * A holder as `sentence()` reads it: who and when, nothing more.
     *
     * @return array{receipt_number: string|null, student: string|null, payment_date: string|null}
     */
    private static function summarize(PaymentTransaction|StudentPayment $holder): array
    {
        return [
            'receipt_number' => $holder->receipt_number,
            'student' => trim(($holder->student?->first_name ?? '') . ' ' . ($holder->student?->last_name ?? '')) ?: null,
            'payment_date' => $holder->payment_date?->format('M j, Y'),
        ];
    }
}
