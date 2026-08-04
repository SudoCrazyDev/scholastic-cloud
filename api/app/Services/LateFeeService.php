<?php

namespace App\Services;

use App\Models\StudentAdditionalFee;
use App\Models\StudentPayment;
use App\Models\StudentPaymentPlan;
use Carbon\Carbon;
use Illuminate\Database\QueryException;
use Illuminate\Support\Collection;

/**
 * Materializes payment-plan surcharges into real charges.
 *
 * A late fee used to be recomputed on every ledger load, so it disappeared the
 * moment the installment was settled and could never be collected. Instead, the
 * first time an installment is seen past its grace window while unpaid, the fee is
 * written as a `student_additional_fees` row (source `late_fee`). From then on it
 * behaves like any other charge: it sits in the ledger, the notice of account, and
 * the cashiering breakdown, and it survives payment of the installment itself.
 *
 * The charge is a snapshot of the base it was assessed on, so it is kept in step with
 * that base on later loads — see rebase() for the limits.
 *
 * Two modes, chosen per payment plan:
 *
 *  - `per_installment` (the default, and how every plan behaved before carry-over
 *    existed): each installment is surcharged once, on its own amount.
 *  - `carry_over`: the unpaid balance rolls forward, so a period is assessed twice —
 *    once when it opens, against everything already delinquent behind it, and once when
 *    its own grace window elapses, against its own unpaid principal. Earlier surcharges
 *    are part of the carried balance, so the charge compounds while the account stays
 *    delinquent. See applyCarryOver() for the walk.
 *
 * Finance can waive one by deleting the row, or adjust it by editing the amount,
 * through the existing additional-fee endpoints.
 */
class LateFeeService
{
    /**
     * Charge whatever has newly been incurred, re-base the standing rows, and return every
     * surcharge for the year in schedule order.
     *
     * @param  array  $installments  Schedule from PaymentPlanService::buildInstallments(),
     *                               built from principal charges only (no surcharges).
     * @param  StudentPaymentPlan|null  $plan  The student's selected plan, which decides the
     *                               mode. Omit for the per-installment behaviour.
     * @param  iterable|null  $principalPayments  Non-voided payments settling plan principal
     *                               (surcharge collections excluded). Carry-over needs their
     *                               dates to know what was unpaid at each assessment.
     * @param  float  $downpayment  Money already deducted from the schedule, so it is not
     *                               counted twice when rebuilding a historical balance.
     * @return Collection<int, StudentAdditionalFee>
     */
    public function apply(
        string $institutionId,
        string $studentId,
        string $academicYear,
        array $installments,
        ?StudentPaymentPlan $plan = null,
        $principalPayments = null,
        float $downpayment = 0.0
    ): Collection {
        // Waived fees are soft-deleted rather than erased, and they still count as
        // handled — otherwise the next ledger load would undo the waiver.
        $handled = $this->chargedFor($institutionId, $studentId, $academicYear, withWaived: true);
        $collections = $this->collectionsAgainst($handled);

        $context = compact('institutionId', 'studentId', 'academicYear');

        $handled = $plan?->paymentPlan?->carriesOverSurcharge()
            ? $this->applyCarryOver($context, $installments, $handled, $collections, $principalPayments, $downpayment)
            : $this->applyPerInstallment($context, $installments, $handled, $collections);

        return $handled
            ->reject(fn ($fee) => $fee->trashed())
            ->sortBy([
                fn ($fee) => (int) $fee->installment_sequence,
                // A carried surcharge is assessed when the period opens, ahead of the
                // surcharge on the period's own principal.
                fn ($fee) => $fee->isCarriedSurcharge() ? 0 : 1,
            ])
            ->values();
    }

    /**
     * Surcharge rows charged for this student/year, keyed by "sequence:stage".
     *
     * @return Collection<string, StudentAdditionalFee>
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
            ->orderBy('installment_sequence')
            ->orderBy('late_fee_stage');

        if ($withWaived) {
            $query->withTrashed();
        }

        return $query->get()->keyBy(
            fn ($fee) => $this->stageKey((int) $fee->installment_sequence, $fee->lateFeeStage())
        );
    }

    /**
     * One surcharge per installment, on the installment's own amount.
     *
     * @param  Collection<string, StudentAdditionalFee>  $handled
     * @param  array<string, array{total: float, rows: array}>  $collections
     * @return Collection<string, StudentAdditionalFee>
     */
    private function applyPerInstallment(
        array $context,
        array $installments,
        Collection $handled,
        array $collections
    ): Collection {
        foreach ($installments as $installment) {
            $sequence = (int) ($installment['sequence'] ?? 0);
            if ($sequence < 1) {
                continue;
            }

            $event = $this->installmentEvent($installment);
            $key = $this->stageKey($sequence, StudentAdditionalFee::LATE_FEE_STAGE_INSTALLMENT);
            $existing = $handled->get($key);

            if ($existing) {
                // A waived fee is settled business; only a standing one tracks its base.
                if (! $existing->trashed()) {
                    $this->rebase(
                        $existing,
                        round((float) ($installment['amount'] ?? 0), 2),
                        $event,
                        $this->collectedTotal($collections, $existing->id)
                    );
                }

                continue;
            }

            if (! $this->shouldCharge($installment)) {
                continue;
            }

            $fee = $this->createFee($context, round((float) $installment['amount'], 2), $event);
            if ($fee) {
                $handled->put($key, $fee);
            }
        }

        return $handled;
    }

    /**
     * Walk the schedule in date order, surcharging the balance as it stood at each
     * assessment, and let each charge feed the next.
     *
     * Two things are assessed. When a period opens — the first day of its installment's due
     * month — everything already delinquent behind it is surcharged at that period's rate:
     * the unpaid principal of earlier installments that are themselves past their grace
     * window, plus the unpaid surcharges assessed before this moment. That last part is what
     * makes the charge compound. Then, when the period's own grace window elapses, its own
     * unpaid principal is surcharged the ordinary way.
     *
     * Every base is the balance as it stood *on the assessment date*, rebuilt from payment
     * dates rather than read off today's figures. A student who clears July on the 5th of
     * August owes July's own surcharge but never the one August would have carried, and a
     * receipt voided or backdated later re-bases the whole chain behind it.
     *
     * Assessment stops at the last installment: an account still unpaid past the end of the
     * schedule stops compounding rather than growing without a cap.
     *
     * @param  Collection<string, StudentAdditionalFee>  $handled
     * @param  array<string, array{total: float, rows: array}>  $collections
     * @return Collection<string, StudentAdditionalFee>
     */
    private function applyCarryOver(
        array $context,
        array $installments,
        Collection $handled,
        array $collections,
        $principalPayments,
        float $downpayment
    ): Collection {
        $today = Carbon::today();
        $payments = $this->paymentRows($principalPayments);

        // Surcharges standing behind the event being assessed: ['date' => Carbon, 'fee' => row].
        // Waived rows never make the list — a forgiven charge is not part of any balance.
        $standing = [];

        foreach ($this->assessments($installments) as $event) {
            // Not yet incurred. Events are in date order, so nothing after it is either.
            if (! $this->incurred($event, $today)) {
                break;
            }

            $base = $event['stage'] === StudentAdditionalFee::LATE_FEE_STAGE_CARRY_OVER
                ? $this->carriedBase($installments, $event, $payments, $downpayment, $standing, $collections)
                : $this->unpaidPrincipal($installments, $event['sequence'], $event['date'], $payments, $downpayment);

            $key = $this->stageKey($event['sequence'], $event['stage']);
            $existing = $handled->get($key);

            if ($existing) {
                if (! $existing->trashed()) {
                    $this->rebase($existing, $base, $event, $this->collectedTotal($collections, $existing->id));
                    $standing[] = ['date' => $event['date'], 'fee' => $existing];
                }

                continue;
            }

            if ($base <= 0 || $event['percentage'] <= 0) {
                continue;
            }

            $fee = $this->createFee($context, $base, $event);
            if ($fee) {
                $handled->put($key, $fee);
                $standing[] = ['date' => $event['date'], 'fee' => $fee];
            }
        }

        return $handled;
    }

    /**
     * Every surcharge a carry-over plan can assess, in the order it is incurred.
     *
     * A period contributes a carried assessment only when it opens strictly later than the
     * period before it — two installments inside one month share an opening, and the balance
     * must not be surcharged twice for it.
     *
     * @return array<int, array{sequence: int, stage: string, date: Carbon, percentage: float, label: string}>
     */
    private function assessments(array $installments): array
    {
        $events = [];
        $previousOpen = null;

        foreach ($installments as $installment) {
            $sequence = (int) ($installment['sequence'] ?? 0);
            if ($sequence < 1) {
                continue;
            }

            $percentage = max(0.0, (float) ($installment['late_fee_percentage'] ?? 0));
            $open = $this->periodOpen($installment);

            // A zero rate is how a plan says "no surcharge this period", in both directions.
            if ($percentage > 0 && $previousOpen && $open->greaterThan($previousOpen)) {
                $events[] = [
                    'sequence' => $sequence,
                    'stage' => StudentAdditionalFee::LATE_FEE_STAGE_CARRY_OVER,
                    'date' => $open,
                    'percentage' => $percentage,
                    'label' => $this->label($installment),
                ];
            }

            if ($percentage > 0) {
                $events[] = $this->installmentEvent($installment);
            }

            $previousOpen = $open;
        }

        usort($events, function (array $a, array $b) {
            $byDate = $a['date']->getTimestamp() <=> $b['date']->getTimestamp();
            if ($byDate !== 0) {
                return $byDate;
            }

            // On a shared date the carried balance is assessed before the period's own
            // principal, so the period's own surcharge is not folded into what it carried.
            return $this->stageRank($a['stage']) <=> $this->stageRank($b['stage']);
        });

        return $events;
    }

    /**
     * What the account owed going into a period: the unpaid principal of every earlier
     * installment already past its own grace window, plus the unpaid surcharges assessed
     * before this moment.
     *
     * An installment that is not yet overdue is not delinquent, so it is not carried — a
     * plan whose grace window spills past the next period's opening would otherwise
     * surcharge a student who is still inside it.
     *
     * @param  array<int, array{date: Carbon, fee: StudentAdditionalFee}>  $standing
     */
    private function carriedBase(
        array $installments,
        array $event,
        Collection $payments,
        float $downpayment,
        array $standing,
        array $collections
    ): float {
        $base = 0.0;

        foreach ($installments as $installment) {
            $sequence = (int) ($installment['sequence'] ?? 0);
            if ($sequence < 1 || $sequence >= $event['sequence']) {
                continue;
            }

            $overdueDate = $this->parseDate($installment['overdue_date'] ?? $installment['due_date'] ?? null);
            if (! $overdueDate || ! $overdueDate->lessThan($event['date'])) {
                continue;
            }

            $base += $this->unpaidPrincipal($installments, $sequence, $event['date'], $payments, $downpayment);
        }

        foreach ($standing as $entry) {
            if (! $entry['date']->lessThan($event['date'])) {
                continue;
            }

            $base += $this->unpaidSurcharge($entry['fee'], $event['date'], $collections);
        }

        return round($base, 2);
    }

    /**
     * What one installment still owed on a given date.
     *
     * Payments fill installments earliest-first, the same FIFO the schedule itself uses —
     * only here the pool is limited to what had actually been received by that date. The
     * downpayment is already out of the installment amounts, so it comes off the pool too.
     */
    private function unpaidPrincipal(
        array $installments,
        int $sequence,
        Carbon $asOf,
        Collection $payments,
        float $downpayment
    ): float {
        $pool = $payments
            ->filter(fn (array $payment) => $payment['date'] && ! $payment['date']->greaterThan($asOf))
            ->sum(fn (array $payment) => $payment['amount']);
        $pool = max(0.0, round($pool - $downpayment, 2));

        foreach ($installments as $installment) {
            $amount = round((float) ($installment['amount'] ?? 0), 2);
            $applied = round(min($pool, max(0.0, $amount)), 2);
            $pool = round($pool - $applied, 2);

            if ((int) ($installment['sequence'] ?? 0) === $sequence) {
                return max(0.0, round($amount - $applied, 2));
            }
        }

        return 0.0;
    }

    /** What one surcharge row still owed on a given date. */
    private function unpaidSurcharge(StudentAdditionalFee $fee, Carbon $asOf, array $collections): float
    {
        $collected = collect($collections[$fee->id]['rows'] ?? [])
            ->filter(fn (array $row) => $row['date'] && ! $row['date']->greaterThan($asOf))
            ->sum(fn (array $row) => $row['amount']);

        return max(0.0, round((float) $fee->amount - $collected, 2));
    }

    /**
     * Whether an assessment has been reached.
     *
     * A grace window is the payer's to use in full, so an installment's own surcharge is
     * only incurred once its overdue date has passed — the same rule that sets `is_overdue`.
     * A period opening is not a grace window: the balance rolls forward on the day the
     * period starts, so a carried surcharge lands on that date itself.
     */
    private function incurred(array $event, Carbon $today): bool
    {
        return $event['stage'] === StudentAdditionalFee::LATE_FEE_STAGE_CARRY_OVER
            ? ! $event['date']->greaterThan($today)
            : $today->greaterThan($event['date']);
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
     * Keep a standing surcharge in step with the base it was charged against.
     *
     * The fee is booked the first time the ledger is loaded past the assessment date, which
     * freezes the base as it stood at that instant. Anything entered afterwards that moves
     * that base — a backdated downpayment, a voided payment, a discount, a new charge — used
     * to strand the surcharge on a figure the schedule no longer shows.
     *
     * What money has already been received pins it down. The fee never drops below what
     * was collected against it, so re-basing cannot conjure a credit out of a receipt; and
     * a fee collected in full is never raised, so nobody is billed again for something
     * they already settled. A fee whose amount no longer matches its own base was set by
     * hand, and an override exists to be honoured. A base that shrinks to nothing leaves
     * the fee standing for finance to waive rather than silently zeroing a charge.
     */
    private function rebase(StudentAdditionalFee $fee, float $base, array $event, float $collected): void
    {
        $percentage = (float) $fee->late_fee_percentage;
        $base = round($base, 2);
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
            'description' => $this->describe($base, $percentage, $event),
        ]);
    }

    /**
     * Money already received against each surcharge row, keyed by fee id, with the dates
     * that decide what had been collected at any point in the year. Voided payments do not
     * count — that collection was undone.
     *
     * @param  Collection<int|string, StudentAdditionalFee>  $fees
     * @return array<string, array{total: float, rows: array<int, array{date: ?Carbon, amount: float}>}>
     */
    private function collectionsAgainst(Collection $fees): array
    {
        $ids = $fees->pluck('id')->filter()->all();
        if (empty($ids)) {
            return [];
        }

        return StudentPayment::whereIn('student_additional_fee_id', $ids)
            ->whereNull('voided_at')
            ->get(['student_additional_fee_id', 'amount', 'payment_date'])
            ->groupBy('student_additional_fee_id')
            ->map(fn ($group) => [
                'total' => round((float) $group->sum('amount'), 2),
                'rows' => $group->map(fn ($payment) => [
                    'date' => $this->parseDate($payment->payment_date),
                    'amount' => (float) $payment->amount,
                ])->values()->all(),
            ])
            ->all();
    }

    private function collectedTotal(array $collections, string $feeId): float
    {
        return (float) ($collections[$feeId]['total'] ?? 0.0);
    }

    /**
     * Plan payments as date/amount pairs, so a historical balance can be rebuilt.
     *
     * @return Collection<int, array{date: ?Carbon, amount: float}>
     */
    private function paymentRows($principalPayments): Collection
    {
        return collect($principalPayments ?? [])
            ->map(fn ($payment) => [
                'date' => $this->parseDate(
                    is_array($payment) ? ($payment['payment_date'] ?? null) : ($payment->payment_date ?? null)
                ),
                'amount' => (float) (is_array($payment) ? ($payment['amount'] ?? 0) : ($payment->amount ?? 0)),
            ])
            ->values();
    }

    /** The surcharge an installment incurs on its own principal when its grace elapses. */
    private function installmentEvent(array $installment): array
    {
        $date = $this->parseDate($installment['overdue_date'] ?? $installment['due_date'] ?? null)
            ?? Carbon::today();

        return [
            'sequence' => (int) ($installment['sequence'] ?? 0),
            'stage' => StudentAdditionalFee::LATE_FEE_STAGE_INSTALLMENT,
            'date' => $date,
            'percentage' => max(0.0, (float) ($installment['late_fee_percentage'] ?? 0)),
            'label' => $this->label($installment),
        ];
    }

    /**
     * The day a period starts collecting: the first of its installment's due month. It is
     * the same boundary PaymentPlanService uses to decide what counts as a downpayment, so
     * a period opens at one moment for both.
     */
    private function periodOpen(array $installment): Carbon
    {
        $dueDate = $this->parseDate($installment['due_date'] ?? null);

        return $dueDate ? $dueDate->copy()->startOfMonth() : Carbon::today();
    }

    private function label(array $installment): string
    {
        $label = $installment['label'] ?? '';

        return $label !== '' ? $label : ('Installment #' . ($installment['sequence'] ?? ''));
    }

    private function stageKey(int $sequence, string $stage): string
    {
        return $sequence . ':' . $stage;
    }

    private function stageRank(string $stage): int
    {
        return $stage === StudentAdditionalFee::LATE_FEE_STAGE_CARRY_OVER ? 0 : 1;
    }

    private function parseDate($value): ?Carbon
    {
        if (! $value) {
            return null;
        }

        return ($value instanceof Carbon ? $value->copy() : Carbon::parse($value))->startOfDay();
    }

    private function name(array $event): string
    {
        return $event['stage'] === StudentAdditionalFee::LATE_FEE_STAGE_CARRY_OVER
            ? 'Carried Surcharge — ' . $event['label']
            : 'Late Fee — ' . $event['label'];
    }

    private function describe(float $base, float $percentage, array $event): string
    {
        $prefix = $this->formatPercentage($percentage) . '% of ' . number_format($base, 2);

        if ($event['stage'] === StudentAdditionalFee::LATE_FEE_STAGE_CARRY_OVER) {
            return $prefix . ' · balance carried into installment #' . $event['sequence']
                . ' on ' . $event['date']->toDateString();
        }

        return $prefix . ' · installment #' . $event['sequence']
            . ' overdue since ' . $event['date']->toDateString();
    }

    private function createFee(array $context, float $base, array $event): ?StudentAdditionalFee
    {
        $percentage = $event['percentage'];
        $base = round($base, 2);
        $amount = round($base * $percentage / 100, 2);

        if ($amount <= 0) {
            return null;
        }

        try {
            return StudentAdditionalFee::create([
                'institution_id' => $context['institutionId'],
                'student_id' => $context['studentId'],
                'academic_year' => $context['academicYear'],
                'name' => $this->name($event),
                'description' => $this->describe($base, $percentage, $event),
                'source' => StudentAdditionalFee::SOURCE_LATE_FEE,
                'installment_sequence' => $event['sequence'],
                'late_fee_stage' => $event['stage'],
                'assessed_on' => $event['date']->toDateString(),
                'late_fee_percentage' => $percentage,
                'base_amount' => $base,
                'amount' => $amount,
                'created_by' => null,
            ]);
        } catch (QueryException) {
            // A concurrent ledger load charged the same assessment first; the unique
            // index rejected this one. Use whatever landed, unless it was waived.
            return StudentAdditionalFee::lateFees()
                ->where('institution_id', $context['institutionId'])
                ->where('student_id', $context['studentId'])
                ->where('academic_year', $context['academicYear'])
                ->where('installment_sequence', $event['sequence'])
                ->where('late_fee_stage', $event['stage'])
                ->first();
        }
    }

    public function formatPercentage(float $percentage): string
    {
        return rtrim(rtrim(number_format($percentage, 2), '0'), '.');
    }
}
