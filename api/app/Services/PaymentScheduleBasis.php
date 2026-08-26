<?php

namespace App\Services;

use App\Models\GradeLevelDiscount;
use App\Models\GradeLevelDiscountStudentVoid;
use App\Models\SchoolFeeDefault;
use App\Models\StudentAdditionalFee;
use App\Models\StudentDiscount;
use App\Models\StudentPayment;
use App\Models\StudentSection;
use Illuminate\Support\Collection;

/**
 * What a student's payment schedule is built from, for one academic year.
 *
 * PaymentPlanService::buildInstallments() takes the plan as an argument rather than reading
 * the student's selection, so the same figures gathered here will price any plan. That is what
 * lets the portal answer "what would three terms cost me" without touching a single row: the
 * charges, discounts and payments are the student's real ones, only the plan is swapped.
 *
 * Nothing here writes. In particular it does not run LateFeeService — that materializes
 * surcharge rows as a side effect of reading a ledger, which is right for a ledger and quite
 * wrong for a projection. A plan being merely previewed must not leave charges behind.
 *
 * StudentFinanceController still gathers these same figures inline for the ledger and the
 * notice of account, because those need the underlying rows for their own output as well.
 * This is the reusable form; both are worth migrating onto it.
 */
class PaymentScheduleBasis
{
    /**
     * @return array{
     *     grade_level: ?string,
     *     principal_charges: float,
     *     discounts_total: float,
     *     principal_payments: float,
     *     principal_payment_rows: Collection,
     *     dated_adjustments: array<int, array{date: string, charge: float, discount: float}>
     * }
     */
    public function for(string $institutionId, string $studentId, string $academicYear): array
    {
        $gradeLevel = $this->resolveGradeLevel($studentId, $academicYear);

        $feeDefaults = $gradeLevel
            ? SchoolFeeDefault::where('institution_id', $institutionId)
                ->where('grade_level', $gradeLevel)
                ->where('academic_year', $academicYear)
                ->get()
            : collect();

        $standardCharges = (float) $feeDefaults->sum('amount');
        $feeAmountMap = $feeDefaults->keyBy('school_fee_id')->map(fn ($d) => (float) $d->amount);

        // Only amortized ad-hoc fees join the principal a plan divides; a cash-basis one is
        // collected on its own, and a late fee belongs to the period that incurred it.
        $additionalFees = StudentAdditionalFee::where('institution_id', $institutionId)
            ->where('student_id', $studentId)
            ->where('academic_year', $academicYear)
            ->orderBy('created_at')
            ->get();
        $lateFees = $additionalFees->filter(fn ($fee) => $fee->isLateFee())->values();
        $manualFees = $additionalFees->reject(fn ($fee) => $fee->isLateFee())->values();
        $installmentFees = $manualFees->filter(fn ($fee) => $fee->isInstallmentBased())->values();
        $cashFees = $manualFees->filter(fn ($fee) => $fee->isCashBasis())->values();

        $discountPayloads = $this->discountPayloads(
            $institutionId,
            $studentId,
            $academicYear,
            $gradeLevel,
            $feeAmountMap,
            $standardCharges
        );

        // Voided payments stay in the ledger for audit but never count as collected.
        $payments = StudentPayment::where('institution_id', $institutionId)
            ->where('student_id', $studentId)
            ->where('academic_year', $academicYear)
            ->whereNull('voided_at')
            ->orderBy('payment_date')
            ->get();

        // Money settling a late fee or a cash-basis fee is owed outside the schedule, so it
        // must not fill an installment it was never collected against.
        $offScheduleIds = $lateFees->pluck('id')->merge($cashFees->pluck('id'))->filter()->all();
        $principalPaymentRows = $payments
            ->reject(fn ($payment) => $payment->student_additional_fee_id
                && in_array($payment->student_additional_fee_id, $offScheduleIds, true))
            ->values();

        return [
            'grade_level' => $gradeLevel,
            'principal_charges' => round($standardCharges + (float) $installmentFees->sum('amount'), 2),
            'discounts_total' => round((float) $discountPayloads->sum('amount'), 2),
            'principal_payments' => round((float) $principalPaymentRows->sum('amount'), 2),
            'principal_payment_rows' => $principalPaymentRows,
            'dated_adjustments' => $this->datedAdjustments($discountPayloads, $installmentFees),
        ];
    }

    /**
     * Every discount in force for the student, with the peso amount each comes to.
     *
     * Grade-level discounts apply to everyone in the grade unless voided for this student in
     * particular, so those rows are dropped before the amounts are worked out.
     *
     * @return Collection<int, array{discount: mixed, amount: float}>
     */
    private function discountPayloads(
        string $institutionId,
        string $studentId,
        string $academicYear,
        ?string $gradeLevel,
        Collection $feeAmountMap,
        float $standardCharges
    ): Collection {
        $studentDiscounts = StudentDiscount::where('institution_id', $institutionId)
            ->where('student_id', $studentId)
            ->where('academic_year', $academicYear)
            ->whereNull('voided_at')
            ->orderBy('created_at')
            ->get();

        $gradeDiscounts = collect();
        if ($gradeLevel) {
            $gradeDiscounts = GradeLevelDiscount::where('institution_id', $institutionId)
                ->where('grade_level', $gradeLevel)
                ->where('academic_year', $academicYear)
                ->orderBy('created_at')
                ->get();

            if ($gradeDiscounts->isNotEmpty()) {
                $voided = GradeLevelDiscountStudentVoid::where('student_id', $studentId)
                    ->whereIn('grade_level_discount_id', $gradeDiscounts->pluck('id'))
                    ->pluck('grade_level_discount_id')
                    ->all();
                $gradeDiscounts = $gradeDiscounts
                    ->reject(fn ($discount) => in_array($discount->id, $voided, true))
                    ->values();
            }
        }

        return $this->pricedDiscounts(
            $studentDiscounts->toBase()->merge($gradeDiscounts->toBase()),
            $feeAmountMap,
            $standardCharges
        );
    }

    /**
     * What each discount comes to in pesos. A discount tied to a fee is priced against that
     * fee; an unassigned one against the grade's standard charges. Neither is allowed to
     * exceed the base it is taken from.
     *
     * Mirrors StudentFinanceController::applyDiscounts(), which the ledger still uses for its
     * own per-fee breakdown.
     *
     * @return Collection<int, array{discount: mixed, amount: float}>
     */
    private function pricedDiscounts(
        Collection $discounts,
        Collection $feeAmountMap,
        float $standardCharges
    ): Collection {
        return $discounts->map(function ($discount) use ($feeAmountMap, $standardCharges) {
            $base = $discount->school_fee_id
                ? (float) ($feeAmountMap[$discount->school_fee_id] ?? 0)
                : $standardCharges;

            $amount = $discount->discount_type === 'percentage'
                ? $base * ((float) $discount->value / 100)
                : (float) $discount->value;

            if ($base > 0) {
                $amount = min($amount, $base);
            }

            return ['discount' => $discount, 'amount' => round($amount, 2)];
        })->values();
    }

    /**
     * When what the student owes changed, and by how much — what a reamortizing plan needs to
     * keep a period priced from the figures that stood when it opened.
     *
     * Mirrors StudentFinanceController::datedAdjustments().
     *
     * @return array<int, array{date: string, charge: float, discount: float}>
     */
    private function datedAdjustments(Collection $discountPayloads, Collection $installmentFees): array
    {
        $rows = [];

        foreach ($discountPayloads as $payload) {
            $date = $payload['discount']->created_at;
            if ($date) {
                $rows[] = [
                    'date' => $date->toDateString(),
                    'charge' => 0.0,
                    'discount' => round((float) $payload['amount'], 2),
                ];
            }
        }

        foreach ($installmentFees as $fee) {
            if ($fee->created_at) {
                $rows[] = [
                    'date' => $fee->created_at->toDateString(),
                    'charge' => round((float) $fee->amount, 2),
                    'discount' => 0.0,
                ];
            }
        }

        return $rows;
    }

    private function resolveGradeLevel(string $studentId, string $academicYear): ?string
    {
        $sections = StudentSection::with('classSection')
            ->where('student_id', $studentId)
            ->where('academic_year', $academicYear)
            ->orderByDesc('created_at')
            ->get();

        $selected = $sections->firstWhere('is_active', true) ?? $sections->first();

        return $selected?->classSection?->grade_level;
    }
}
