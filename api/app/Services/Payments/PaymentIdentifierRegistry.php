<?php

namespace App\Services\Payments;

use App\Models\PaymentTransaction;
use App\Models\StudentPayment;

/**
 * Keeps a school's receipt identifiers — the OR number and the reference number —
 * unique within the institution.
 *
 * Both stay optional: a school that does not issue an official receipt at the till,
 * or takes cash with nothing to reference, records neither. But a number that *is*
 * entered names one collection and only one, because that is what it is for —
 * reconciling against the physical OR booklet or the bank's own record. Two payments
 * carrying the same OR number make both unreconcilable.
 *
 * Where uniqueness lives:
 *
 *   - `payment_transactions` is the source of truth and carries a database unique
 *     index per (institution, number). Its `student_payments` line items only
 *     denormalize the header's number, so they are *deliberately* not indexed —
 *     a four-fee receipt legitimately repeats its own OR number four times.
 *   - `student_payments` rows with no `payment_transaction_id` are standalone
 *     payments (the legacy single-fee path), so they hold a number of their own and
 *     are checked here.
 *
 * A voided payment keeps its number reserved. The physical receipt was spoiled, not
 * returned to the booklet, so reissuing it would be the same collision one audit later.
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
     * Blank means "not issued", which is not a value that can collide. Stored as
     * NULL so the unique index treats each omission as distinct — an empty string
     * would collide with the next blank one.
     */
    public static function normalize(mixed $value): ?string
    {
        $trimmed = trim((string) ($value ?? ''));

        return $trimmed === '' ? null : $trimmed;
    }

    /**
     * Which of the given identifiers are already spoken for in this institution.
     *
     * @param  array<string, string|null>  $values  keyed by field name
     * @param  string|null  $exceptTransactionId  the transaction being edited, which may keep its own number
     * @param  string|null  $exceptPaymentId  the standalone payment being edited, likewise
     * @return array<string, string[]>  Laravel-shaped validation errors, empty when all are free
     */
    public static function conflicts(
        string $institutionId,
        array $values,
        ?string $exceptTransactionId = null,
        ?string $exceptPaymentId = null
    ): array {
        $errors = [];

        foreach (self::LABELS as $field => $label) {
            $value = self::normalize($values[$field] ?? null);
            if ($value === null) {
                continue;
            }

            $holder = self::holderOf($institutionId, $field, $value, $exceptTransactionId, $exceptPaymentId);
            if ($holder !== null) {
                $errors[$field] = [
                    sprintf('This %s is already recorded on receipt %s.', $label, $holder),
                ];
            }
        }

        return $errors;
    }

    /**
     * The receipt number of whatever already holds this identifier, or null when it is free.
     */
    private static function holderOf(
        string $institutionId,
        string $field,
        string $value,
        ?string $exceptTransactionId,
        ?string $exceptPaymentId
    ): ?string {
        $transaction = PaymentTransaction::where('institution_id', $institutionId)
            ->where($field, $value)
            ->when($exceptTransactionId, fn ($query) => $query->whereKeyNot($exceptTransactionId))
            ->value('receipt_number');

        if ($transaction !== null) {
            return $transaction;
        }

        return StudentPayment::where('institution_id', $institutionId)
            ->whereNull('payment_transaction_id')
            ->where($field, $value)
            ->when($exceptPaymentId, fn ($query) => $query->whereKeyNot($exceptPaymentId))
            ->value('receipt_number');
    }
}
