<?php

namespace App\Services\Finance;

use App\Models\GradeLevelDiscount;
use App\Models\GradeLevelDiscountStudentVoid;
use App\Models\SchoolFeeDefault;
use App\Models\StudentAdditionalFee;
use App\Models\StudentDiscount;
use App\Models\StudentPayment;
use App\Models\StudentSection;

/**
 * The per-fee reading of a student's year: what each fee was charged, discounted and
 * collected against, and the money collected against no fee at all.
 *
 * Lifted out of StudentFinanceController so it has exactly one implementation. The ledger
 * and the notice of account bill from it, the cashiering screen prices payments against
 * it, and FeeNamingService writes it down — a second copy of this arithmetic anywhere
 * would let a printed notice disagree with the counter it was printed at.
 *
 * Nothing here loads or writes. Callers hand in the rows; PaymentScheduleBasis is the
 * reusable way to gather them.
 */
class FeeBreakdownBuilder
{
    /**
     * What each fee has been charged, discounted and collected against, and the money
     * collected against no fee at all.
     *
     * The cashier prices a payment per fee, so this is what the POS screen bills from;
     * the notice of account itemizes the same way, and sharing the computation is what
     * keeps a printed notice agreeing with the counter it was printed at.
     *
     * @param  iterable  $activePayments  non-voided StudentPayment rows
     * @param  iterable  $feeDefaults  SchoolFeeDefault rows for the grade level and year
     * @param  iterable  $manualAdditionalFees  ad-hoc fees, late fees excluded
     * @param  iterable  $chargedLateFees  surcharges booked against the schedule
     * @param  iterable  $discountPayloads  applyDiscounts() output, student + grade level
     * @return array{0: \Illuminate\Support\Collection, 1: float}
     */
    public function build(
        $activePayments,
        $feeDefaults,
        $manualAdditionalFees,
        $chargedLateFees,
        $discountPayloads
    ): array {
        $activePayments = collect($activePayments);
        $discountPayloads = collect($discountPayloads);

        $paidByFee = $activePayments
            ->filter(fn ($payment) => $payment->school_fee_id)
            ->groupBy('school_fee_id')
            ->map(fn ($group) => (float) $group->sum('amount'));

        // Additional fees (ad-hoc charges and late fees) are settled through
        // student_additional_fee_id, so their collections track separately.
        $paidByAdditionalFee = $activePayments
            ->filter(fn ($payment) => $payment->student_additional_fee_id)
            ->groupBy('student_additional_fee_id')
            ->map(fn ($group) => (float) $group->sum('amount'));

        $discountByFee = $discountPayloads
            ->filter(fn ($payload) => $payload['discount']->school_fee_id)
            ->groupBy(fn ($payload) => $payload['discount']->school_fee_id)
            ->map(fn ($group) => (float) collect($group)->sum('amount'))
            ->all();

        // A whole-bill discount carries no school_fee_id, so it has no fee of its own to
        // sit against. It was priced against the standard charges (see applyDiscounts),
        // so it is spread back over those same fees — otherwise the Fees view reports
        // outstanding that the ledger balance has already discounted away. What each fee
        // still owes is part of that spread: a cashier who collected a fee's whole charge
        // before the discount existed left it nothing to write off.
        $unassignedDiscountTotal = (float) $discountPayloads
            ->reject(fn ($payload) => $payload['discount']->school_fee_id)
            ->sum('amount');

        $unassignedShares = $this->allocateUnassignedDiscounts(
            $unassignedDiscountTotal,
            $feeDefaults,
            $discountByFee,
            $paidByFee->all()
        );

        foreach ($unassignedShares as $feeId => $share) {
            $discountByFee[$feeId] = round(($discountByFee[$feeId] ?? 0) + $share, 2);
        }

        // A General / Other collection names no fee, so no row below claims it. Left
        // there it is money the ledger balance has already taken off while every fee
        // still reports its whole charge outstanding — the cashier is handed a bill the
        // student has partly settled, and a fee the money fully covered never reads paid.
        //
        // It is applied the way the schedule already reads it (see $principalPayments in
        // ledger()): against the principal the plan divides — the standard fees and the
        // amortized ad-hoc ones — in proportion to what each still owes, so a fee already
        // settled takes no share. Late fees and cash-basis fees sit outside the schedule
        // and are settled only by money named to them, so they take none either.
        $generalTotal = round((float) $activePayments
            ->filter(fn ($payment) => !$payment->school_fee_id && !$payment->student_additional_fee_id)
            ->sum('amount'), 2);

        $unpaidRoom = [];
        foreach ($feeDefaults as $default) {
            $feeId = $default->school_fee_id;
            $room = round(
                (float) $default->amount
                    - (float) ($discountByFee[$feeId] ?? 0)
                    - (float) ($paidByFee[$feeId] ?? 0),
                2
            );
            if ($room > 0) {
                $unpaidRoom[$feeId] = $room;
            }
        }
        foreach ($manualAdditionalFees as $additionalFee) {
            if (! $additionalFee->isInstallmentBased()) {
                continue;
            }
            $room = round(
                (float) $additionalFee->amount
                    - (float) ($discountByFee[$additionalFee->id] ?? 0)
                    - (float) ($paidByAdditionalFee[$additionalFee->id] ?? 0),
                2
            );
            if ($room > 0) {
                $unpaidRoom[$additionalFee->id] = $room;
            }
        }

        // Capped at what the fees still owe: money past that is an advance the student is
        // owed back, not a row to drive negative, so it stays unapplied below.
        $generalShares = $this->spreadProportionally($generalTotal, $unpaidRoom);

        $breakdown = collect($feeDefaults)->map(function ($default) use ($paidByFee, $discountByFee, $generalShares) {
            $feeId = $default->school_fee_id;
            $charge = (float) $default->amount;
            $discount = (float) ($discountByFee[$feeId] ?? 0);
            $general = (float) ($generalShares[$feeId] ?? 0);
            $paid = (float) ($paidByFee[$feeId] ?? 0) + $general;

            return [
                'fee_id' => $feeId,
                'fee_name' => $default->schoolFee?->name ?? 'School Fee',
                'is_additional' => false,
                // Standard grade-level fees are the plan's principal by definition.
                'billing_type' => StudentAdditionalFee::BILLING_INSTALLMENT,
                'charge' => round($charge, 2),
                'discount' => round($discount, 2),
                'paid' => round($paid, 2),
                // The part of `paid` that came from a General / Other collection instead
                // of a receipt naming this fee, so the row can say why it is down.
                'general_applied' => round($general, 2),
                'outstanding' => round($charge - $discount - $paid, 2),
            ];
        })->toBase()->merge(
            // Ad-hoc fees first, then the surcharges charged against the schedule — each
            // its own collectible line, already in installment order.
            collect($manualAdditionalFees)
                ->merge($chargedLateFees)
                ->map(function ($af) use ($paidByAdditionalFee, $discountByFee, $generalShares) {
                    $charge = (float) $af->amount;
                    $discount = (float) ($discountByFee[$af->id] ?? 0);
                    $general = (float) ($generalShares[$af->id] ?? 0);
                    $paid = (float) ($paidByAdditionalFee[$af->id] ?? 0) + $general;

                    return [
                        'fee_id' => $af->id,
                        'fee_name' => $af->name,
                        'is_additional' => true,
                        'source' => $af->source,
                        // A late fee is reported as installment-based: it is not amortized,
                        // but the schedule shows it on the period that incurred it, so the
                        // Fees view must not list it as separately collectible cash.
                        'billing_type' => $af->isCashBasis()
                            ? StudentAdditionalFee::BILLING_CASH
                            : StudentAdditionalFee::BILLING_INSTALLMENT,
                        'installment_sequence' => $af->installment_sequence,
                        'late_fee_stage' => $af->isLateFee() ? $af->lateFeeStage() : null,
                        'charge' => round($charge, 2),
                        'discount' => round($discount, 2),
                        'paid' => round($paid, 2),
                        'general_applied' => round($general, 2),
                        'outstanding' => round($charge - $discount - $paid, 2),
                    ];
                })
        )->values();

        // Only what the fees could not absorb is still unapplied — the Fees view and the
        // notice of account both name this rather than folding it into a line, and it is
        // what keeps the per-fee rows reconciling with the ledger balance.
        $unallocatedPayments = round($generalTotal - array_sum($generalShares), 2);

        return [$breakdown, $unallocatedPayments];
    }

    /**
     * Spread whole-bill discounts (no school_fee_id) across the standard fees they were
     * priced against, so the per-fee breakdown reconciles with the ledger total.
     *
     * A fee can absorb at most its charge net of any discount tied to it specifically, or
     * the whole-bill one drives the row negative. Within that ceiling the discount lands
     * on what each fee still has unpaid first, and only spills onto already-collected
     * charge once the unpaid room runs out. Spreading over the charge instead would write
     * a share off a fee a payment had already settled in full, leaving that row overpaid
     * and its neighbour reading Partial while the bill as a whole is paid.
     *
     * @param  \Illuminate\Support\Collection  $feeRows  rows exposing school_fee_id + amount
     * @param  array<string, float>  $assignedByFee  fee id => discount already tied to that fee
     * @param  array<string, float>  $paidByFee  fee id => collections allocated to that fee
     * @return array<string, float>  fee id => its share of the unassigned total
     */
    private function allocateUnassignedDiscounts(
        float $unassignedTotal,
        $feeRows,
        array $assignedByFee,
        array $paidByFee = []
    ): array {
        if ($unassignedTotal <= 0 || $feeRows->isEmpty()) {
            return [];
        }

        // Ceiling per fee, and the part of it no payment has covered yet.
        $capacity = [];
        $unpaidRoom = [];
        foreach ($feeRows as $row) {
            $feeId = $row->school_fee_id;
            $available = round((float) $row->amount - (float) ($assignedByFee[$feeId] ?? 0), 2);
            if ($available <= 0) {
                continue;
            }
            $capacity[$feeId] = $available;
            $unpaid = round($available - (float) ($paidByFee[$feeId] ?? 0), 2);
            if ($unpaid > 0) {
                $unpaidRoom[$feeId] = $unpaid;
            }
        }

        // Discounts exceeding the charges are a data problem, not something to spread
        // further — cap at what the fees can hold rather than driving a row negative.
        $allocatable = min($unassignedTotal, array_sum($capacity));
        if ($allocatable <= 0) {
            return [];
        }

        $shares = $this->spreadProportionally(
            min($allocatable, array_sum($unpaidRoom)),
            $unpaidRoom
        );

        // More discount than the fees still owe: the rest has to sit on charge a payment
        // already covered, so the row reads overpaid rather than the discount vanishing.
        $overflow = round($allocatable - array_sum($shares), 2);
        if ($overflow > 0) {
            $paidRoom = [];
            foreach ($capacity as $feeId => $available) {
                $left = round($available - ($shares[$feeId] ?? 0), 2);
                if ($left > 0) {
                    $paidRoom[$feeId] = $left;
                }
            }

            foreach ($this->spreadProportionally($overflow, $paidRoom) as $feeId => $share) {
                $shares[$feeId] = round(($shares[$feeId] ?? 0) + $share, 2);
            }
        }

        return $shares;
    }

    /**
     * Split an amount across weighted buckets, handing the leftover centavos to the
     * largest remainders so the shares total the amount exactly — shares that merely
     * round close leave a fee that never reads as paid.
     *
     * @param  array<string, float>  $weights  bucket key => its weight (all positive)
     * @return array<string, float>  bucket key => its share
     */
    public function spreadProportionally(float $amount, array $weights): array
    {
        $base = array_sum($weights);
        if ($amount <= 0 || $base <= 0) {
            return [];
        }

        $amount = min($amount, $base);

        $shares = [];
        $remainders = [];
        foreach ($weights as $key => $weight) {
            $exact = $amount * ($weight / $base);
            $floor = floor($exact * 100) / 100;
            $shares[$key] = $floor;
            $remainders[$key] = $exact - $floor;
        }

        $leftover = (int) round(($amount - array_sum($shares)) * 100);
        arsort($remainders);
        while ($leftover > 0) {
            foreach (array_keys($remainders) as $key) {
                if ($leftover <= 0) {
                    break;
                }
                $shares[$key] = round($shares[$key] + 0.01, 2);
                $leftover--;
            }
        }

        return array_map(fn ($share) => round($share, 2), $shares);
    }

    /**
     * What each discount comes to in pesos. A discount tied to a fee is priced against
     * that fee; an unassigned one against the grade's standard charges. Neither may exceed
     * the base it is taken from.
     *
     * @param  iterable  $discounts  StudentDiscount or GradeLevelDiscount rows
     * @param  \Illuminate\Support\Collection  $feeAmountMap  school_fee_id => charge
     * @return \Illuminate\Support\Collection  ['discount' => model, 'amount' => float, 'base' => float]
     */
    public function priceDiscounts($discounts, $feeAmountMap, float $chargesTotal)
    {
        // toBase(): an empty $discounts leaves map() as an Eloquent Collection, whose
        // merge() calls getKey() on the plain-array payloads and crashes. Force a base
        // Support collection so downstream merge()s are always safe.
        return $discounts->map(function ($discount) use ($feeAmountMap, $chargesTotal) {
            $baseAmount = $chargesTotal;
            if ($discount->school_fee_id) {
                $baseAmount = (float) ($feeAmountMap[$discount->school_fee_id] ?? 0);
            }

            $amount = 0.0;
            if ($discount->discount_type === 'percentage') {
                $amount = $baseAmount * ((float) $discount->value / 100);
            } else {
                $amount = (float) $discount->value;
            }

            if ($baseAmount > 0) {
                $amount = min($amount, $baseAmount);
            }

            return [
                'discount' => $discount,
                'amount' => round($amount, 2),
                'base' => round($baseAmount, 2),
            ];
        })->toBase();
    }

    /**
     * The breakdown for one student and year, loading the rows itself.
     *
     * Deliberately a line-for-line mirror of what StudentFinanceController::ledger()
     * gathers — same eager loads, same `orderBy`s, same active-only filtering. That is not
     * fussiness: `spreadProportionally` hands its leftover centavos to the largest
     * remainders and breaks ties in iteration order, so loading `feeDefaults` in a
     * different order can move a centavo between two fees. Anything reading these figures
     * back to *write* them down (see FeeNamingService) has to land on the ledger's numbers
     * exactly, or naming a receipt would shift a balance it promised to leave alone.
     *
     * @return array{0: \Illuminate\Support\Collection, 1: float}  [breakdown, unallocated]
     */
    public function forStudent(string $institutionId, string $studentId, string $academicYear): array
    {
        $gradeLevel = $this->resolveGradeLevel($studentId, $academicYear);

        $feeDefaults = collect();
        if ($gradeLevel) {
            $feeDefaults = SchoolFeeDefault::with('schoolFee')
                ->where('institution_id', $institutionId)
                ->where('grade_level', $gradeLevel)
                ->where('academic_year', $academicYear)
                ->orderBy('created_at')
                ->get();
        }

        // Voided payments stay in the ledger for audit but never count as collected.
        $activePayments = StudentPayment::where('institution_id', $institutionId)
            ->where('student_id', $studentId)
            ->where('academic_year', $academicYear)
            ->whereNull('voided_at')
            ->orderBy('payment_date')
            ->orderBy('created_at')
            ->get();

        $additionalFees = StudentAdditionalFee::where('institution_id', $institutionId)
            ->where('student_id', $studentId)
            ->where('academic_year', $academicYear)
            ->orderBy('created_at')
            ->get();
        $manualAdditionalFees = $additionalFees->reject(fn ($fee) => $fee->isLateFee())->values();
        $chargedLateFees = $additionalFees->filter(fn ($fee) => $fee->isLateFee())->values();

        $feeAmountMap = $feeDefaults->keyBy('school_fee_id')->map(fn ($d) => (float) $d->amount);
        $standardCharges = (float) $feeDefaults->sum('amount');

        // Active only, exactly as the ledger passes them: a voided discount is still shown
        // there for audit but takes no part in the per-fee arithmetic.
        $discounts = StudentDiscount::with('schoolFee')
            ->where('institution_id', $institutionId)
            ->where('student_id', $studentId)
            ->where('academic_year', $academicYear)
            ->whereNull('voided_at')
            ->orderBy('created_at')
            ->get();

        $gradeLevelDiscounts = collect();
        if ($gradeLevel) {
            $gradeLevelDiscounts = GradeLevelDiscount::with('schoolFee')
                ->where('institution_id', $institutionId)
                ->where('grade_level', $gradeLevel)
                ->where('academic_year', $academicYear)
                ->orderBy('created_at')
                ->get();

            if ($gradeLevelDiscounts->isNotEmpty()) {
                // A grade-level discount can be voided for one student in particular.
                $voided = GradeLevelDiscountStudentVoid::where('student_id', $studentId)
                    ->whereIn('grade_level_discount_id', $gradeLevelDiscounts->pluck('id'))
                    ->pluck('grade_level_discount_id')
                    ->all();
                $gradeLevelDiscounts = $gradeLevelDiscounts
                    ->reject(fn ($discount) => in_array($discount->id, $voided, true))
                    ->values();
            }
        }

        $discountPayloads = $this->priceDiscounts($discounts, $feeAmountMap, $standardCharges)
            ->merge($this->priceDiscounts($gradeLevelDiscounts, $feeAmountMap, $standardCharges));

        return $this->build(
            $activePayments,
            $feeDefaults,
            $manualAdditionalFees,
            $chargedLateFees,
            $discountPayloads
        );
    }

    /** The grade level whose fee schedule the student is billed on for that year. */
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
