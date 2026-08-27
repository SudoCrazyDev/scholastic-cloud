<?php

namespace App\Services\Payments;

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

            $holders = self::holdersOf($institutionId, $field, $value, $exceptTransactionId, $exceptPaymentId);
            if ($holders === []) {
                continue;
            }

            $warnings[$field] = [self::sentence($label, $value, $holders)];
        }

        return $warnings;
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
     * @return array<int, array{receipt_number: string|null, student: string|null, payment_date: string|null}>
     */
    private static function holdersOf(
        string $institutionId,
        string $field,
        string $value,
        ?string $exceptTransactionId,
        ?string $exceptPaymentId
    ): array {
        $transactions = PaymentTransaction::query()
            ->with('student:id,first_name,last_name')
            ->where('institution_id', $institutionId)
            ->where($field, $value)
            ->whereNull('voided_at')
            ->when($exceptTransactionId, fn ($query) => $query->whereKeyNot($exceptTransactionId))
            ->orderByDesc('created_at')
            ->get(['id', 'student_id', 'receipt_number', 'payment_date', 'created_at']);

        $standalone = StudentPayment::query()
            ->with('student:id,first_name,last_name')
            ->where('institution_id', $institutionId)
            ->whereNull('payment_transaction_id')
            ->whereNull('voided_at')
            ->where($field, $value)
            ->when($exceptPaymentId, fn ($query) => $query->whereKeyNot($exceptPaymentId))
            ->orderByDesc('created_at')
            ->get(['id', 'student_id', 'receipt_number', 'payment_date', 'created_at']);

        return $transactions->concat($standalone)
            ->sortByDesc('created_at')
            ->map(fn ($holder) => [
                'receipt_number' => $holder->receipt_number,
                'student' => trim(($holder->student?->first_name ?? '') . ' ' . ($holder->student?->last_name ?? '')) ?: null,
                'payment_date' => $holder->payment_date?->format('M j, Y'),
            ])
            ->values()
            ->all();
    }
}
