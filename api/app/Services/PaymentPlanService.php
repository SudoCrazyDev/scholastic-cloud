<?php

namespace App\Services;

use App\Models\PaymentPlan;
use App\Models\StudentPaymentPlan;
use Carbon\Carbon;

class PaymentPlanService
{
    /**
     * Build the installment schedule for a student's selected plan.
     *
     * Driven by the linked PaymentPlan definition's installment templates
     * (label + due month/day + optional share percentage). Charges are split
     * evenly across installments unless every template specifies a share
     * percentage, in which case they are allocated proportionally. The final
     * installment absorbs rounding so totals reconcile exactly.
     *
     * On a `net_of_downpayment` plan, money collected before the schedule's first
     * month is a downpayment: it comes off the amount being divided, so every
     * installment is smaller rather than the earliest ones being settled outright.
     *
     * @param  iterable|null  $principalPayments  Non-voided payments that settle plan
     *         principal (late-fee collections excluded) — needed to date the
     *         downpayment. Omit to skip downpayment detection entirely.
     */
    public function buildInstallments(
        ?StudentPaymentPlan $plan,
        string $academicYear,
        float $grossCharges,
        float $discountsTotal = 0.0,
        float $paymentsTotal = 0.0,
        $principalPayments = null
    ): array {
        $definition = $plan?->paymentPlan;
        if (! $definition) {
            return [];
        }

        $templates = $definition->installments; // ordered by sequence (relation)
        if ($templates->isEmpty()) {
            return [];
        }

        $startYear = $this->resolveStartYear($academicYear);
        if ($startYear === null) {
            return [];
        }

        $count = $templates->count();
        $pivotMonth = $this->resolvePivotMonth($templates);
        $netCharges = max(0.0, $grossCharges - $discountsTotal);
        $usePercentage = $templates->every(fn ($t) => $t->share_percentage !== null);

        // A downpayment is already-settled money, so it leaves the schedule twice over:
        // it shrinks the base being divided, and it is withheld from the pool that fills
        // installments — otherwise it would both lower the amounts and pay them off.
        $downpayment = $this->resolveDownpayment(
            $plan,
            $academicYear,
            $grossCharges,
            $discountsTotal,
            $principalPayments
        )['amount'];
        // Deducted from gross as well as net so `original_amount - discount_amount`
        // still equals `amount` and no phantom discount appears.
        $netCharges = max(0.0, round($netCharges - $downpayment, 2));
        $grossCharges = max(0.0, round($grossCharges - $downpayment, 2));

        $installments = [];
        $netAssigned = 0.0;
        $grossAssigned = 0.0;
        $remainingPaid = max(0.0, round(max(0.0, $paymentsTotal) - $downpayment, 2));

        foreach ($templates->values() as $i => $template) {
            // Last installment absorbs rounding for BOTH gross and net so
            // (original_amount - discount_amount) reconciles exactly with amount.
            if ($i === $count - 1) {
                $amount = round($netCharges - $netAssigned, 2);
                $originalAmount = round($grossCharges - $grossAssigned, 2);
            } else {
                if ($usePercentage) {
                    $fraction = ((float) $template->share_percentage) / 100;
                    $amount = round($netCharges * $fraction, 2);
                    $originalAmount = round($grossCharges * $fraction, 2);
                } else {
                    $amount = round($netCharges / $count, 2);
                    $originalAmount = round($grossCharges / $count, 2);
                }
                $netAssigned = round($netAssigned + $amount, 2);
                $grossAssigned = round($grossAssigned + $originalAmount, 2);
            }

            $discountAmount = round($originalAmount - $amount, 2);
            $dueDate = $this->resolveDueDate(
                $startYear,
                (int) $template->due_month,
                (int) $template->due_day,
                $pivotMonth
            );
            // Overdue charges only apply once the grace window after the due date has elapsed.
            $graceDays = max(0, (int) $template->grace_period_days);
            $overdueDate = $dueDate->copy()->addDays($graceDays);

            // FIFO-allocate payments across installments: earlier installments fill first.
            $paidApplied = round(min($remainingPaid, $amount), 2);
            $remainingPaid = round($remainingPaid - $paidApplied, 2);

            $status = 'pending';
            if ($amount <= 0) {
                $status = 'paid';
            } elseif ($paidApplied >= $amount - 0.005) {
                $status = 'paid';
            } elseif ($paidApplied > 0) {
                $status = 'partial';
            }

            // `is_overdue` marks an installment past its grace window that still owes
            // money — the trigger LateFeeService uses to book a one-time late fee. The
            // fee amount itself is not computed here: it lives on a real charge row, so
            // withLateFees() fills it in from what was actually charged.
            $lateFeePercentage = max(0.0, (float) $template->late_fee_percentage);
            $isOverdue = $status !== 'paid' && $amount > 0 && Carbon::today()->greaterThan($overdueDate);

            $installments[] = [
                'sequence' => $i + 1,
                'label' => $template->label ?: $dueDate->format('F Y'),
                'due_date' => $dueDate->toDateString(),
                'grace_period_days' => $graceDays,
                'overdue_date' => $overdueDate->toDateString(),
                'is_overdue' => $isOverdue,
                'late_fee_percentage' => $lateFeePercentage,
                'late_fee_amount' => 0.0,
                'late_fee_applied' => false,
                'late_fee_id' => null,
                'late_fee_charges' => [],
                'amount' => $amount,
                'original_amount' => $originalAmount,
                'discount_amount' => $discountAmount,
                'paid_amount' => $paidApplied,
                // Filled in by withRunningTotals() once surcharges are booked; defaulted
                // here so the shape is complete even for a caller that skips it.
                'outstanding_amount' => round(max(0.0, $amount - $paidApplied), 2),
                'running_total_due' => 0.0,
                'status' => $status,
            ];
        }

        return $installments;
    }

    /**
     * How much of what has been collected counts as a downpayment against the schedule,
     * and the date that decides it.
     *
     * The boundary is the first day of the schedule's earliest month — the moment it
     * starts collecting. Anything received before it was paid ahead of the plan and comes
     * off the amortized amount; anything on or after it lands inside a period and settles
     * installments the ordinary way. Anchoring on the month (not the due date) means the
     * monthly figure stops moving the day the schedule opens.
     *
     * Returns ['amount' => float, 'boundary' => ?string] — a zero amount and a null
     * boundary for plans that do not opt in, so callers can treat both modes uniformly.
     *
     * @param  iterable|null  $principalPayments  Non-voided payments settling plan principal
     */
    public function resolveDownpayment(
        ?StudentPaymentPlan $plan,
        string $academicYear,
        float $grossCharges,
        float $discountsTotal = 0.0,
        $principalPayments = null
    ): array {
        $none = ['amount' => 0.0, 'boundary' => null];

        $definition = $plan?->paymentPlan;
        if (! $definition || ! $definition->deductsDownpayment()) {
            return $none;
        }

        $templates = $definition->installments;
        if ($templates->isEmpty()) {
            return $none;
        }

        $startYear = $this->resolveStartYear($academicYear);
        if ($startYear === null) {
            return $none;
        }

        // The schedule opens on the first day of its first installment's month. That month
        // is also the pivot, so every later template resolves after it — no other period
        // can start earlier, and a mid-year payment can never be read as a downpayment.
        $pivotMonth = $this->resolvePivotMonth($templates);
        $boundary = $this->resolveDueDate($startYear, $pivotMonth, 1, $pivotMonth);

        $received = collect($principalPayments ?? [])
            ->filter(function ($payment) use ($boundary) {
                $paidOn = $this->paymentDate($payment);

                return $paidOn && $paidOn->lessThan($boundary);
            })
            ->sum(fn ($payment) => (float) (is_array($payment) ? $payment['amount'] : $payment->amount));

        // Capped at what is actually owed: overpayment stays visible as unapplied credit
        // rather than driving the schedule negative.
        $netCharges = max(0.0, $grossCharges - $discountsTotal);

        return [
            'amount' => round(min(max(0.0, (float) $received), $netCharges), 2),
            'boundary' => $boundary->toDateString(),
        ];
    }

    private function paymentDate($payment): ?Carbon
    {
        $raw = is_array($payment) ? ($payment['payment_date'] ?? null) : ($payment->payment_date ?? null);
        if (! $raw) {
            return null;
        }

        return ($raw instanceof Carbon ? $raw->copy() : Carbon::parse($raw))->startOfDay();
    }

    /**
     * Stamp each installment with the surcharges actually charged against it, so the
     * schedule shows the booked amounts rather than a recomputed guess. A fee stays
     * visible after the installment is settled (and after a waiver it disappears,
     * because the charge row is gone).
     *
     * A `carry_over` plan can charge a period twice — once for the balance rolled into it,
     * once for its own overdue principal — so `late_fee_amount` is the total for the period
     * and `late_fee_charges` itemizes it. `late_fee_id` and `late_fee_percentage` describe
     * the surcharge on the period's own principal, which is the only one a per-installment
     * plan ever has.
     *
     * @param  iterable<\App\Models\StudentAdditionalFee>  $lateFees  in schedule order
     */
    public function withLateFees(array $installments, $lateFees): array
    {
        $bySequence = collect($lateFees)->groupBy(fn ($fee) => (int) $fee->installment_sequence);
        if ($bySequence->isEmpty()) {
            return $installments;
        }

        return array_map(function (array $installment) use ($bySequence) {
            $fees = $bySequence->get((int) $installment['sequence']);
            if (! $fees || $fees->isEmpty()) {
                return $installment;
            }

            $own = $fees->first(fn ($fee) => ! $fee->isCarriedSurcharge()) ?? $fees->first();

            $installment['late_fee_amount'] = round((float) $fees->sum(fn ($fee) => (float) $fee->amount), 2);
            $installment['late_fee_applied'] = true;
            $installment['late_fee_id'] = $own->id;
            if ($own->late_fee_percentage !== null) {
                $installment['late_fee_percentage'] = (float) $own->late_fee_percentage;
            }
            $installment['late_fee_charges'] = $fees->map(fn ($fee) => [
                'id' => $fee->id,
                'stage' => $fee->lateFeeStage(),
                'name' => $fee->name,
                'amount' => (float) $fee->amount,
                'base_amount' => $fee->base_amount !== null ? (float) $fee->base_amount : null,
                'percentage' => $fee->late_fee_percentage !== null ? (float) $fee->late_fee_percentage : null,
                'assessed_on' => $fee->assessed_on?->toDateString(),
            ])->values()->all();

            return $installment;
        }, $installments);
    }

    /**
     * Stamp each installment with what is still outstanding through it, so a plan that
     * bills arrears as one accumulating figure has a figure to bill.
     *
     * `outstanding_amount` is what the period alone still owes — its unpaid principal plus
     * the uncollected part of every surcharge booked against it. `running_total_due`
     * accumulates that down the schedule, so period N carries everything unpaid from 1..N.
     * A settled period contributes nothing, so a student who missed June and August but
     * paid July is asked for June + August + September's own principal and no more.
     *
     * Both are net of collections, which makes them a balance rather than a charge total,
     * and both are reported on every plan — only a `running_total` plan presents the
     * running figure as the amount due. Nothing here assesses a surcharge: the charges are
     * already booked by the time this runs, so switching a plan's mode re-presents a year
     * without re-pricing it.
     *
     * A future period counts its own unpaid principal, matching how the schools state it:
     * with June and August unpaid at 1,030 each, September asks for 3,060 before its own
     * due date has even passed.
     *
     * @param  array<int, float>  $lateFeePaidBySequence  collected against each period's
     *                            surcharges, keyed by installment sequence
     */
    public function withRunningTotals(array $installments, array $lateFeePaidBySequence = []): array
    {
        $running = 0.0;

        return array_map(function (array $installment) use (&$running, $lateFeePaidBySequence) {
            $sequence = (int) ($installment['sequence'] ?? 0);

            // Overpayment against either side is credit held elsewhere in the ledger, so
            // neither leg is allowed to go negative and mask what a later period owes.
            $principalDue = max(0.0, round(
                (float) ($installment['amount'] ?? 0) - (float) ($installment['paid_amount'] ?? 0),
                2
            ));
            $surchargeDue = max(0.0, round(
                (float) ($installment['late_fee_amount'] ?? 0)
                    - (float) ($lateFeePaidBySequence[$sequence] ?? 0),
                2
            ));

            $installment['outstanding_amount'] = round($principalDue + $surchargeDue, 2);
            $running = round($running + $installment['outstanding_amount'], 2);
            $installment['running_total_due'] = $running;

            return $installment;
        }, $installments);
    }

    public function serializePlan(?StudentPaymentPlan $plan): ?array
    {
        if (! $plan) {
            return null;
        }

        $definition = $plan->paymentPlan;

        $installmentCount = $definition
            ? $definition->installments->count()
            : ($plan->plan_type === StudentPaymentPlan::TYPE_QUARTERLY ? 4 : 10);

        return [
            'id' => $plan->id,
            'academic_year' => $plan->academic_year,
            'payment_plan_id' => $plan->payment_plan_id,
            // plan_type kept for backward compatibility; payment_plan_id is authoritative.
            'plan_type' => $plan->plan_type,
            'name' => $definition?->name
                ?? ($plan->plan_type ? ucfirst((string) $plan->plan_type) : null),
            'advance_payment_mode' => $definition?->advance_payment_mode
                ?? PaymentPlan::ADVANCE_EQUAL_SPLIT,
            'surcharge_mode' => $definition?->surcharge_mode
                ?? PaymentPlan::SURCHARGE_PER_INSTALLMENT,
            'installment_count' => $installmentCount,
            'selected_at' => $plan->selected_at?->toIso8601String(),
            'selected_by_student' => (bool) $plan->selected_by_student,
        ];
    }

    private function resolveStartYear(string $academicYear): ?int
    {
        if (! preg_match('/(\d{4})/', $academicYear, $matches)) {
            return null;
        }

        return (int) $matches[1];
    }

    /**
     * The calendar month a plan's schedule opens in, taken from its first installment.
     *
     * An academic year spans two calendar years, so a bare month number is ambiguous:
     * "July" in AY 2026-2027 could mean July 2026 or July 2027. The plan itself answers
     * it — sequence 1 is by definition the first period, so its month starts the year and
     * every earlier month belongs to the second calendar year. Falls back to August, the
     * usual PH school-year start, when there is no template to learn from.
     *
     * @param  \Illuminate\Support\Collection  $templates  ordered by sequence
     */
    private function resolvePivotMonth($templates): int
    {
        $first = $templates->first();
        if (! $first) {
            return 8;
        }

        return min(max(1, (int) $first->due_month), 12);
    }

    /**
     * Resolve a template's calendar month/day to an actual date within the academic year.
     * Months from the schedule's opening month onward fall in the start year; earlier ones
     * roll into the following year — so a July-to-March plan puts July in the start year,
     * while an August-to-May plan puts January in the next. The day is clamped to the
     * month length (e.g. day 31 in February becomes 28/29).
     */
    private function resolveDueDate(int $startYear, int $month, int $day, int $pivotMonth = 8): Carbon
    {
        $month = min(max(1, $month), 12);
        $pivotMonth = min(max(1, $pivotMonth), 12);
        $year = $month >= $pivotMonth ? $startYear : $startYear + 1;
        $base = Carbon::create($year, $month, 1, 0, 0, 0);
        $clampedDay = min(max(1, $day), $base->daysInMonth);

        return $base->day($clampedDay);
    }
}
