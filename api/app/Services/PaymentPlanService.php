<?php

namespace App\Services;

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
     */
    public function buildInstallments(
        ?StudentPaymentPlan $plan,
        string $academicYear,
        float $grossCharges,
        float $discountsTotal = 0.0,
        float $paymentsTotal = 0.0
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
        $netCharges = max(0.0, $grossCharges - $discountsTotal);
        $usePercentage = $templates->every(fn ($t) => $t->share_percentage !== null);

        $installments = [];
        $netAssigned = 0.0;
        $grossAssigned = 0.0;
        $remainingPaid = max(0.0, $paymentsTotal);

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
            $dueDate = $this->resolveDueDate($startYear, (int) $template->due_month, (int) $template->due_day);
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

            // Live, one-time late fee: applies when today is past the grace window and the
            // installment is not fully paid. Based on the installment's net amount. No charge
            // record is persisted — the ledger computes and folds this in on each load.
            $lateFeePercentage = max(0.0, (float) $template->late_fee_percentage);
            $isOverdue = $status !== 'paid' && $amount > 0 && Carbon::today()->greaterThan($overdueDate);
            $lateFeeAmount = $isOverdue ? round($amount * $lateFeePercentage / 100, 2) : 0.0;

            $installments[] = [
                'sequence' => $i + 1,
                'label' => $template->label ?: $dueDate->format('F Y'),
                'due_date' => $dueDate->toDateString(),
                'grace_period_days' => $graceDays,
                'overdue_date' => $overdueDate->toDateString(),
                'is_overdue' => $isOverdue,
                'late_fee_percentage' => $lateFeePercentage,
                'late_fee_amount' => $lateFeeAmount,
                'amount' => $amount,
                'original_amount' => $originalAmount,
                'discount_amount' => $discountAmount,
                'paid_amount' => $paidApplied,
                'status' => $status,
            ];
        }

        return $installments;
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
     * Resolve a template's calendar month/day to an actual date within the
     * academic year. PH school years start in August, so months Aug–Dec fall in
     * the start year and Jan–Jul in the following year. The day is clamped to the
     * month length (e.g. day 31 in February becomes 28/29).
     */
    private function resolveDueDate(int $startYear, int $month, int $day): Carbon
    {
        $month = min(max(1, $month), 12);
        $year = $month >= 8 ? $startYear : $startYear + 1;
        $base = Carbon::create($year, $month, 1, 0, 0, 0);
        $clampedDay = min(max(1, $day), $base->daysInMonth);

        return $base->day($clampedDay);
    }
}
