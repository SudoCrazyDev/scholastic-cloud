<?php

namespace App\Services;

use App\Models\StudentAdditionalFee;
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
 * Finance can waive one by deleting the row, or adjust it by editing the amount,
 * through the existing additional-fee endpoints.
 */
class LateFeeService
{
    /**
     * Charge any newly-overdue installments and return every late-fee row for the year.
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

        foreach ($installments as $installment) {
            $sequence = (int) ($installment['sequence'] ?? 0);
            if ($sequence < 1 || $handled->has($sequence)) {
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
        $pct = $this->formatPercentage($percentage);

        try {
            return StudentAdditionalFee::create([
                'institution_id' => $institutionId,
                'student_id' => $studentId,
                'academic_year' => $academicYear,
                'name' => 'Late Fee — ' . $label,
                'description' => $pct . '% of ' . number_format($base, 2)
                    . ' · installment #' . $installment['sequence']
                    . ' overdue since ' . ($installment['overdue_date'] ?? $installment['due_date'] ?? ''),
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
