<?php

namespace App\Services;

use App\Models\StudentPaymentPlan;
use Carbon\Carbon;

class PaymentPlanService
{
    public const MONTHLY_INSTALLMENTS = 10;
    public const QUARTERLY_INSTALLMENTS = 4;

    public function buildInstallments(
        ?StudentPaymentPlan $plan,
        string $academicYear,
        float $grossCharges,
        float $discountsTotal = 0.0,
        float $paymentsTotal = 0.0
    ): array {
        if (!$plan) {
            return [];
        }

        $count = $plan->plan_type === StudentPaymentPlan::TYPE_QUARTERLY
            ? self::QUARTERLY_INSTALLMENTS
            : self::MONTHLY_INSTALLMENTS;

        $start = $this->resolveStartMonth($academicYear);
        if (!$start) {
            return [];
        }

        $netCharges = max(0.0, $grossCharges - $discountsTotal);
        $stepMonths = $plan->plan_type === StudentPaymentPlan::TYPE_QUARTERLY ? 3 : 1;
        $netPer = $count > 0 ? round($netCharges / $count, 2) : 0;
        $grossPer = $count > 0 ? round($grossCharges / $count, 2) : 0;

        $installments = [];
        $netAssigned = 0.0;
        $grossAssigned = 0.0;
        $remainingPaid = max(0.0, $paymentsTotal);
        for ($i = 0; $i < $count; $i++) {
            $dueDate = $start->copy()->addMonths($i * $stepMonths)->endOfMonth();
            // Last installment absorbs rounding for BOTH gross and net so
            // (original_amount - discount_amount) reconciles exactly with amount.
            if ($i === $count - 1) {
                $amount = round($netCharges - $netAssigned, 2);
                $originalAmount = round($grossCharges - $grossAssigned, 2);
            } else {
                $amount = $netPer;
                $originalAmount = $grossPer;
                $netAssigned = round($netAssigned + $netPer, 2);
                $grossAssigned = round($grossAssigned + $grossPer, 2);
            }
            $discountAmount = round($originalAmount - $amount, 2);

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

            $installments[] = [
                'sequence' => $i + 1,
                'label' => $plan->plan_type === StudentPaymentPlan::TYPE_QUARTERLY
                    ? 'Quarter ' . ($i + 1)
                    : $dueDate->format('F Y'),
                'due_date' => $dueDate->toDateString(),
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
        if (!$plan) {
            return null;
        }

        return [
            'id' => $plan->id,
            'academic_year' => $plan->academic_year,
            'plan_type' => $plan->plan_type,
            'installment_count' => $plan->plan_type === StudentPaymentPlan::TYPE_QUARTERLY
                ? self::QUARTERLY_INSTALLMENTS
                : self::MONTHLY_INSTALLMENTS,
            'selected_at' => $plan->selected_at?->toIso8601String(),
            'selected_by_student' => (bool) $plan->selected_by_student,
        ];
    }

    private function resolveStartMonth(string $academicYear): ?Carbon
    {
        if (!preg_match('/(\d{4})/', $academicYear, $matches)) {
            return null;
        }

        // PH school year typically starts August.
        return Carbon::create((int) $matches[1], 8, 1, 0, 0, 0);
    }
}
