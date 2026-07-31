<?php

namespace App\Services;

use App\Models\StudentAdditionalFee;
use App\Models\StudentPayment;
use Illuminate\Database\QueryException;
use Illuminate\Support\Collection;

/**
 * Materializes payment-plan late fees into real charges.
 *
 * A late fee used to be recomputed on every ledger load, so it disappeared the
 * moment the installment was settled and could never be collected. Instead, the
 * first time an installment is seen past its grace window while unpaid, the fee is
 * written as a `student_additional_fees` row (source `late_fee`). From then on it
 * behaves like any other charge: it sits in the ledger, the notice of account, and
 * the cashiering breakdown, and it survives payment of the installment itself.
 *
 * The charge is a snapshot of the installment as it stood when it was booked, so it is
 * kept in step with that installment on later loads — see rebase() for the limits.
 *
 * Finance can waive one by deleting the row, or adjust it by editing the amount,
 * through the existing additional-fee endpoints.
 */
class LateFeeService
{
    /**
     * Charge any newly-overdue installments, re-base the standing ones, and return every
     * late-fee row for the year.
     *
     * @param  array  $installments  Schedule from PaymentPlanService::buildInstallments(),
     *                               built from principal charges only (no late fees).
     * @return Collection<int, StudentAdditionalFee> keyed by installment sequence
     */
    public function apply(
        string $institutionId,
        string $studentId,
        string $academicYear,
        array $installments
    ): Collection {
        // Waived fees are soft-deleted rather than erased, and they still count as
        // handled — otherwise the next ledger load would undo the waiver.
        $handled = $this->chargedFor($institutionId, $studentId, $academicYear, withWaived: true);
        $collected = $this->collectedAgainst($handled);

        foreach ($installments as $installment) {
            $sequence = (int) ($installment['sequence'] ?? 0);
            if ($sequence < 1) {
                continue;
            }

            $existing = $handled->get($sequence);
            if ($existing) {
                // A waived fee is settled business; only a standing one tracks its installment.
                if (! $existing->trashed()) {
                    $this->rebase($existing, $installment, $collected[$existing->id] ?? 0.0);
                }

                continue;
            }

            if (! $this->shouldCharge($installment)) {
                continue;
            }

            $fee = $this->createFee($institutionId, $studentId, $academicYear, $installment);
            if ($fee) {
                $handled->put($sequence, $fee);
            }
        }

        return $handled->reject(fn ($fee) => $fee->trashed());
    }

    /**
     * Late-fee rows charged for this student/year, keyed by installment sequence.
     *
     * @return Collection<int, StudentAdditionalFee>
     */
    public function chargedFor(
        string $institutionId,
        string $studentId,
        string $academicYear,
        bool $withWaived = false
    ): Collection {
        $query = StudentAdditionalFee::lateFees()
            ->where('institution_id', $institutionId)
            ->where('student_id', $studentId)
            ->where('academic_year', $academicYear)
            ->orderBy('installment_sequence');

        if ($withWaived) {
            $query->withTrashed();
        }

        return $query->get()->keyBy(fn ($fee) => (int) $fee->installment_sequence);
    }

    /**
     * The fee is charged once: the installment is past its grace window, still owes
     * money, and carries a late-fee percentage. Whether it is settled afterwards no
     * longer matters — the charge has already been booked.
     */
    private function shouldCharge(array $installment): bool
    {
        $percentage = (float) ($installment['late_fee_percentage'] ?? 0);
        $amount = (float) ($installment['amount'] ?? 0);

        return ! empty($installment['is_overdue'])
            && $percentage > 0
            && $amount > 0;
    }

    /**
     * Keep a standing late fee in step with the installment it was charged against.
     *
     * The fee is booked the first time the ledger is loaded past the grace window, which
     * freezes the installment amount as it stood at that instant. Anything entered
     * afterwards that moves that amount — a backdated downpayment, a voided payment, a
     * discount, a new charge — used to strand the surcharge on a figure the schedule no
     * longer shows.
     *
     * What money has already been received pins it down. The fee never drops below what
     * was collected against it, so re-basing cannot conjure a credit out of a receipt; and
     * a fee collected in full is never raised, so nobody is billed again for something
     * they already settled. A fee whose amount no longer matches its own base was set by
     * hand, and an override exists to be honoured. An installment that shrinks to nothing
     * leaves the fee standing for finance to waive rather than silently zeroing a charge.
     */
    private function rebase(StudentAdditionalFee $fee, array $installment, float $collected): void
    {
        $percentage = (float) $fee->late_fee_percentage;
        $base = round((float) ($installment['amount'] ?? 0), 2);
        if ($percentage <= 0 || $base <= 0) {
            return;
        }

        $storedBase = round((float) $fee->base_amount, 2);
        if (abs($base - $storedBase) < 0.005) {
            return;
        }

        $current = (float) $fee->amount;
        if (abs($current - round($storedBase * $percentage / 100, 2)) >= 0.005) {
            return;
        }

        $amount = round($base * $percentage / 100, 2);
        $collected = round($collected, 2);
        if ($amount <= 0 || $amount < $collected - 0.005) {
            return;
        }

        if ($collected >= $current - 0.005 && $amount > $current + 0.005) {
            return;
        }

        $fee->update([
            'base_amount' => $base,
            'amount' => $amount,
            'description' => $this->describe($base, $percentage, $installment),
        ]);
    }

    /**
     * Money already received against each late-fee row, keyed by fee id. Voided payments
     * do not count — that collection was undone.
     *
     * @param  Collection<int, StudentAdditionalFee>  $fees
     * @return array<string, float>
     */
    private function collectedAgainst(Collection $fees): array
    {
        $ids = $fees->pluck('id')->filter()->all();
        if (empty($ids)) {
            return [];
        }

        return StudentPayment::whereIn('student_additional_fee_id', $ids)
            ->whereNull('voided_at')
            ->groupBy('student_additional_fee_id')
            ->selectRaw('student_additional_fee_id, SUM(amount) as total')
            ->pluck('total', 'student_additional_fee_id')
            ->map(fn ($total) => (float) $total)
            ->all();
    }

    private function describe(float $base, float $percentage, array $installment): string
    {
        return $this->formatPercentage($percentage) . '% of ' . number_format($base, 2)
            . ' · installment #' . ($installment['sequence'] ?? '')
            . ' overdue since ' . ($installment['overdue_date'] ?? $installment['due_date'] ?? '');
    }

    private function createFee(
        string $institutionId,
        string $studentId,
        string $academicYear,
        array $installment
    ): ?StudentAdditionalFee {
        $percentage = (float) $installment['late_fee_percentage'];
        $base = round((float) $installment['amount'], 2);
        $amount = round($base * $percentage / 100, 2);

        if ($amount <= 0) {
            return null;
        }

        $label = $installment['label'] ?? ('Installment #' . $installment['sequence']);

        try {
            return StudentAdditionalFee::create([
                'institution_id' => $institutionId,
                'student_id' => $studentId,
                'academic_year' => $academicYear,
                'name' => 'Late Fee — ' . $label,
                'description' => $this->describe($base, $percentage, $installment),
                'source' => StudentAdditionalFee::SOURCE_LATE_FEE,
                'installment_sequence' => (int) $installment['sequence'],
                'late_fee_percentage' => $percentage,
                'base_amount' => $base,
                'amount' => $amount,
                'created_by' => null,
            ]);
        } catch (QueryException) {
            // A concurrent ledger load charged the same installment first; the unique
            // index rejected this one. Use whatever landed, unless it was waived.
            return StudentAdditionalFee::lateFees()
                ->where('institution_id', $institutionId)
                ->where('student_id', $studentId)
                ->where('academic_year', $academicYear)
                ->where('installment_sequence', (int) $installment['sequence'])
                ->first();
        }
    }

    public function formatPercentage(float $percentage): string
    {
        return rtrim(rtrim(number_format($percentage, 2), '0'), '.');
    }
}
