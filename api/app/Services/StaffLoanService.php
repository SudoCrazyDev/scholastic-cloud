<?php

namespace App\Services;

use App\Models\PayrollPeriod;
use App\Models\PayslipDeduction;
use App\Models\StaffLoan;
use App\Models\StaffLoanEvent;
use App\Models\StaffLoanInstallment;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Works a set of loan terms into a schedule, and moves that schedule along as
 * payroll collects it.
 *
 * All the arithmetic in here is done in centavos and only turned back into
 * pesos at the edge. A twelve-month loan divided in floating point leaves a
 * centavo unaccounted for often enough to matter, and "the school collected
 * ₱6,719.99 of a ₱6,720.00 loan" is exactly the kind of thing that keeps a loan
 * open forever.
 */
class StaffLoanService
{
    /**
     * The monthly rate a loan's terms come down to, as a fraction.
     *
     * An annual rate is twelfths of itself — the plain division schools quote,
     * not the compounded twelfth root. Nobody writes "1% a month" on a loan
     * agreement meaning 12.68% a year.
     */
    public function monthlyRate(string $method, float $ratePercent, string $ratePeriod): float
    {
        if ($method === StaffLoan::INTEREST_NONE || $ratePercent <= 0) {
            return 0.0;
        }

        $rate = $ratePercent / 100;

        return $ratePeriod === StaffLoan::RATE_ANNUAL ? $rate / 12 : $rate;
    }

    /**
     * What a set of terms works out to, before anything is written down.
     *
     * The same call answers the form's live preview and builds the schedule
     * that gets saved on approval, so what an approver signed off is the same
     * arithmetic payroll then collects.
     *
     * @return array{
     *     principal: float, interest: float, total: float, installment: float,
     *     installments: array<int, array{sequence: int, due_date: string, amount: float,
     *         principal_component: float, interest_component: float,
     *         opening_balance: float, closing_balance: float}>
     * }
     */
    public function quote(
        float $principal,
        string $method,
        float $ratePercent,
        string $ratePeriod,
        int $termMonths,
        Carbon $firstDueDate
    ): array {
        $term = max(1, $termMonths);
        $principalCents = (int) round($principal * 100);
        $rate = $this->monthlyRate($method, $ratePercent, $ratePeriod);

        $rows = $method === StaffLoan::INTEREST_DIMINISHING && $rate > 0
            ? $this->diminishingRows($principalCents, $rate, $term)
            : $this->levelRows($principalCents, $rate, $term);

        $interestCents = array_sum(array_column($rows, 'interest'));
        $installments = [];

        foreach ($rows as $index => $row) {
            $installments[] = [
                'sequence' => $index + 1,
                // addMonthsNoOverflow so a loan starting on the 31st collects
                // on the 28th in February instead of leaping into March.
                'due_date' => $firstDueDate->copy()->addMonthsNoOverflow($index)->toDateString(),
                'amount' => $this->pesos($row['principal'] + $row['interest']),
                'principal_component' => $this->pesos($row['principal']),
                'interest_component' => $this->pesos($row['interest']),
                'opening_balance' => $this->pesos($row['opening']),
                'closing_balance' => $this->pesos($row['closing']),
            ];
        }

        return [
            'principal' => $this->pesos($principalCents),
            'interest' => $this->pesos($interestCents),
            'total' => $this->pesos($principalCents + $interestCents),
            // The figure the staff member will see on most payslips. The last
            // one can differ by a centavo; the schedule is the authority.
            'installment' => $installments[0]['amount'] ?? 0.0,
            'installments' => $installments,
        ];
    }

    /**
     * No interest, or flat interest on the whole principal for the whole term:
     * either way every installment is the same and the split never moves.
     *
     * Whatever the division leaves over lands on the last installment rather
     * than being spread a centavo at a time, so the schedule reads as the
     * clean figure the loan was agreed at with one odd row at the end.
     *
     * @return array<int, array{principal: int, interest: int, opening: int, closing: int}>
     */
    private function levelRows(int $principalCents, float $rate, int $term): array
    {
        $interestCents = (int) round($principalCents * $rate * $term);

        $perPrincipal = intdiv($principalCents, $term);
        $perInterest = intdiv($interestCents, $term);

        $rows = [];
        $balance = $principalCents;

        for ($index = 0; $index < $term; $index++) {
            $last = $index === $term - 1;
            $principal = $last ? $balance : $perPrincipal;
            $interest = $last ? $interestCents - $perInterest * ($term - 1) : $perInterest;

            $rows[] = [
                'principal' => $principal,
                'interest' => $interest,
                'opening' => $balance,
                'closing' => $balance - $principal,
            ];

            $balance -= $principal;
        }

        return $rows;
    }

    /**
     * Interest on what is still owed, with a level monthly payment: the
     * ordinary amortized loan.
     *
     * The payment comes off the annuity formula, then each month's interest is
     * charged on the balance and whatever is left of the payment pays the
     * principal down. The last row is settled against the balance rather than
     * computed, which is what guarantees the schedule closes at exactly zero.
     *
     * @return array<int, array{principal: int, interest: int, opening: int, closing: int}>
     */
    private function diminishingRows(int $principalCents, float $rate, int $term): array
    {
        // Strictly greater than $principalCents * $rate for any positive rate,
        // so the principal component can never come out at or below zero and
        // the balance always falls.
        $payment = (int) round($principalCents * $rate / (1 - (1 + $rate) ** -$term));

        $rows = [];
        $balance = $principalCents;

        for ($index = 0; $index < $term; $index++) {
            $interest = (int) round($balance * $rate);
            $principal = $index === $term - 1 ? $balance : min($payment - $interest, $balance);

            $rows[] = [
                'principal' => $principal,
                'interest' => $interest,
                'opening' => $balance,
                'closing' => $balance - $principal,
            ];

            $balance -= $principal;
        }

        return $rows;
    }

    private function pesos(int $cents): float
    {
        return round($cents / 100, 2);
    }

    /**
     * Write the loan's terms out as a schedule and stamp the totals onto the
     * loan itself.
     *
     * Called on approval, and again if a still-pending loan is edited. An
     * approved loan is never re-scheduled: the only way to change one is to
     * cancel it and write a new one, so nothing can rewrite what a staff member
     * has already been charged.
     */
    public function writeSchedule(StaffLoan $loan): void
    {
        $quote = $this->quote(
            (float) $loan->principal_amount,
            $loan->interest_method,
            (float) $loan->interest_rate_percent,
            $loan->rate_period,
            (int) $loan->term_months,
            $loan->first_deduction_date->copy()
        );

        DB::transaction(function () use ($loan, $quote) {
            $loan->installments()->delete();

            foreach ($quote['installments'] as $row) {
                $loan->installments()->create($row + ['status' => StaffLoanInstallment::STATUS_SCHEDULED]);
            }

            $loan->update([
                'interest_amount' => $quote['interest'],
                'total_payable' => $quote['total'],
                'installment_amount' => $quote['installment'],
                'amount_paid' => 0,
            ]);
        });

        $loan->load('installments');
    }

    /**
     * The installments a period should collect, keyed by the staff member who
     * owes them.
     *
     * Anything already due by the last day of the period counts, not only the
     * month the period covers — a school that skipped a payroll run would
     * otherwise leave that installment scheduled forever and the loan would
     * never close. Both fall on the payslip as separate lines, so the staff
     * member can see they were charged twice and why.
     *
     * An installment already sitting on another period's payslip is left alone.
     * Only this period's payslips are about to be rebuilt; the other period's
     * line is still standing, and collecting the same installment twice is the
     * one thing this must not do.
     *
     * @param  array<int, string>  $userIds
     * @return Collection<string, Collection<int, StaffLoanInstallment>>
     */
    public function dueForPeriod(string $institutionId, array $userIds, PayrollPeriod $period): Collection
    {
        $placedElsewhere = DB::table('payslip_deductions')
            ->join('payslips', 'payslips.id', '=', 'payslip_deductions.payslip_id')
            ->whereNotNull('payslip_deductions.staff_loan_installment_id')
            ->where('payslips.payroll_period_id', '!=', $period->id)
            ->pluck('payslip_deductions.staff_loan_installment_id')
            ->all();

        return StaffLoanInstallment::with('loan')
            ->whereHas('loan', fn ($query) => $query
                ->where('institution_id', $institutionId)
                ->where('status', StaffLoan::STATUS_APPROVED)
                ->whereIn('user_id', $userIds ?: ['-']))
            ->where('status', StaffLoanInstallment::STATUS_SCHEDULED)
            ->whereDate('due_date', '<=', $period->date_to->toDateString())
            ->whereNotIn('id', $placedElsewhere ?: ['-'])
            ->orderBy('due_date')
            ->orderBy('sequence')
            ->get()
            ->groupBy(fn (StaffLoanInstallment $installment) => $installment->loan->user_id);
    }

    /**
     * Mark everything this period's payslips carried as collected.
     *
     * Releasing the period is the moment the money actually leaves the salary,
     * so it is the moment the balance moves. A payslip sitting in a draft
     * period has not paid anything down yet — it can still be regenerated away.
     */
    public function collectForPeriod(PayrollPeriod $period, ?User $actor): void
    {
        $this->settleForPeriod($period, $actor, collect: true);
    }

    /**
     * Give back everything this period collected, because it was reopened.
     */
    public function releaseForPeriod(PayrollPeriod $period, ?User $actor): void
    {
        $this->settleForPeriod($period, $actor, collect: false);
    }

    private function settleForPeriod(PayrollPeriod $period, ?User $actor, bool $collect): void
    {
        $lines = PayslipDeduction::with('installment')
            ->whereNotNull('staff_loan_installment_id')
            ->whereIn('payslip_id', $period->payslips()->select('id'))
            ->get();

        if ($lines->isEmpty()) {
            return;
        }

        DB::transaction(function () use ($lines, $period, $actor, $collect) {
            $touched = [];

            foreach ($lines as $line) {
                $installment = $line->installment;
                if ($installment === null) {
                    continue;
                }

                if ($collect) {
                    if ($installment->status !== StaffLoanInstallment::STATUS_SCHEDULED) {
                        continue;
                    }

                    $installment->update([
                        'status' => StaffLoanInstallment::STATUS_COLLECTED,
                        // What the payslip actually took, not what was
                        // scheduled — a payroll manager may have edited the
                        // line down for somebody who could not afford it.
                        'collected_amount' => $line->amount,
                        'collected_at' => now(),
                        'payslip_id' => $line->payslip_id,
                        'payroll_period_id' => $period->id,
                    ]);
                } else {
                    if (! $installment->isCollected()) {
                        continue;
                    }

                    $installment->update([
                        'status' => StaffLoanInstallment::STATUS_SCHEDULED,
                        'collected_amount' => 0,
                        'collected_at' => null,
                        'payslip_id' => null,
                        'payroll_period_id' => null,
                    ]);
                }

                $touched[$installment->staff_loan_id] = ($touched[$installment->staff_loan_id] ?? 0)
                    + (float) $line->amount;
            }

            foreach ($touched as $loanId => $amount) {
                $loan = StaffLoan::find($loanId);
                if ($loan === null) {
                    continue;
                }

                $this->refreshBalance($loan, $actor, $period->name);

                $this->log(
                    $loan,
                    $collect ? StaffLoanEvent::ACTION_COLLECTED : StaffLoanEvent::ACTION_RELEASED,
                    $actor,
                    round($amount, 2),
                    $collect
                        ? 'Collected on payroll period "'.$period->name.'".'
                        : 'Given back — payroll period "'.$period->name.'" was reopened.'
                );
            }
        });
    }

    /**
     * Re-add what has actually been collected and decide whether the loan is
     * finished.
     *
     * Summed off the schedule rather than incremented, so a reopened period, a
     * hand-edited payslip line and a cancelled tail all leave the same answer.
     */
    public function refreshBalance(StaffLoan $loan, ?User $actor = null, ?string $context = null): void
    {
        $paid = round((float) $loan->installments()
            ->where('status', StaffLoanInstallment::STATUS_COLLECTED)
            ->sum('collected_amount'), 2);

        $outstanding = $loan->installments()
            ->where('status', StaffLoanInstallment::STATUS_SCHEDULED)
            ->exists();

        $wasCompleted = $loan->status === StaffLoan::STATUS_COMPLETED;
        // Only an approved or already-completed loan changes state here. A
        // cancelled one keeps whatever it collected before it was called off.
        $completes = ! $outstanding && in_array($loan->status, [StaffLoan::STATUS_APPROVED, StaffLoan::STATUS_COMPLETED], true);

        $loan->update([
            'amount_paid' => $paid,
            'status' => $completes ? StaffLoan::STATUS_COMPLETED : (
                $wasCompleted ? StaffLoan::STATUS_APPROVED : $loan->status
            ),
            'completed_at' => $completes ? ($loan->completed_at ?? now()) : null,
        ]);

        if ($completes && ! $wasCompleted) {
            $this->log(
                $loan,
                StaffLoanEvent::ACTION_COMPLETED,
                $actor,
                $paid,
                $context === null ? null : 'Fully collected on payroll period "'.$context.'".'
            );
        }
    }

    /**
     * Cancel a loan and strike out everything it has not collected yet.
     * What was already taken stays taken — this stops the deduction, it does
     * not refund it.
     */
    public function cancel(StaffLoan $loan, ?User $actor, ?string $note): void
    {
        DB::transaction(function () use ($loan, $actor, $note) {
            // Off the model rather than the relation: the relation carries an
            // ORDER BY for reading the schedule, which has no business in an
            // UPDATE.
            StaffLoanInstallment::where('staff_loan_id', $loan->id)
                ->where('status', StaffLoanInstallment::STATUS_SCHEDULED)
                ->update(['status' => StaffLoanInstallment::STATUS_CANCELLED]);

            $loan->update([
                'status' => StaffLoan::STATUS_CANCELLED,
                'reviewed_by' => $actor?->id,
                'reviewed_at' => now(),
                'review_note' => $note,
            ]);

            $this->refreshBalance($loan->refresh(), $actor);
            $this->log($loan, StaffLoanEvent::ACTION_CANCELLED, $actor, $loan->balance(), $note);
        });
    }

    /**
     * Add a line to the loan's history.
     *
     * The actor's name is copied in alongside the id: the id answers "which
     * account", the name still answers "who" after that account is gone.
     */
    public function log(StaffLoan $loan, string $action, ?User $actor, ?float $amount = null, ?string $note = null): StaffLoanEvent
    {
        $name = null;
        if ($actor !== null) {
            $name = trim(implode(' ', array_filter([$actor->first_name, $actor->last_name])));
            $name = $name !== '' ? $name : $actor->email;
        }

        return $loan->events()->create([
            'action' => $action,
            'actor_id' => $actor?->id,
            'actor_name' => $name,
            'amount' => $amount,
            'note' => $note,
        ]);
    }

    /**
     * The next free reference for a school — "LN-0007".
     *
     * Counted off the highest number already issued rather than the row count,
     * so a deleted draft never hands its number to the next loan.
     */
    public function nextReference(string $institutionId): string
    {
        $last = StaffLoan::where('institution_id', $institutionId)
            ->where('reference_no', 'like', 'LN-%')
            ->orderByRaw('LENGTH(reference_no) DESC')
            ->orderBy('reference_no', 'desc')
            ->value('reference_no');

        $next = $last === null ? 1 : ((int) substr($last, 3)) + 1;

        return 'LN-'.str_pad((string) $next, 4, '0', STR_PAD_LEFT);
    }
}
