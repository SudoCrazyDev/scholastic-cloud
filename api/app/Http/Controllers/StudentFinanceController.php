<?php

namespace App\Http\Controllers;

use App\Auth\StudentPortalUser;
use App\Models\GradeLevelDiscount;
use App\Models\GradeLevelDiscountStudentVoid;
use App\Models\Student;
use App\Models\StudentAdditionalFee;
use App\Models\StudentPaymentPlan;
use App\Models\StudentSection;
use App\Models\SchoolFeeDefault;
use App\Models\StudentDiscount;
use App\Models\StudentPayment;
use App\Services\LateFeeService;
use App\Services\Finance\FeeBreakdownBuilder;
use App\Services\PaymentPlanService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;

class StudentFinanceController extends Controller
{
    public function __construct(
        private PaymentPlanService $planService,
        private LateFeeService $lateFeeService,
        private FeeBreakdownBuilder $feeBreakdown
    ) {
    }

    /**
     * Get a student's ledger for an academic year.
     */
    public function ledger(Request $request, string $studentId): JsonResponse
    {
        if ($this->isStudentActor($request) && !$this->isSelfStudent($request, $studentId)) {
            return response()->json([
                'success' => false,
                'message' => 'Students can only access their own ledger'
            ], 403);
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (!$institutionId) {
            return response()->json([
                'success' => false,
                'message' => 'User does not have any institution assigned'
            ], 400);
        }

        $student = Student::whereHas('studentInstitutions', function ($query) use ($institutionId) {
            $query->where('institution_id', $institutionId);
        })->find($studentId);

        if (!$student) {
            return response()->json([
                'success' => false,
                'message' => 'Student not found'
            ], 404);
        }

        $studentSections = StudentSection::with('classSection')
            ->where('student_id', $studentId)
            ->orderByDesc('created_at')
            ->get();

        $availableAcademicYears = $this->getAvailableAcademicYears($studentSections);
        $requestedAcademicYear = $request->get('academic_year');
        $academicYear = $this->resolveAcademicYear($studentSections, $requestedAcademicYear);
        if (!$academicYear) {
            $academicYear = $this->fallbackAcademicYear();
        }

        $gradeLevel = $this->resolveGradeLevel($studentSections, $academicYear);
        $section = $this->resolveSection($studentSections, $academicYear);

        $feeDefaults = collect();
        if ($gradeLevel) {
            $feeDefaults = SchoolFeeDefault::with('schoolFee')
                ->where('institution_id', $institutionId)
                ->where('grade_level', $gradeLevel)
                ->where('academic_year', $academicYear)
                ->orderBy('created_at')
                ->get();
        }

        $payments = StudentPayment::with(['schoolFee', 'additionalFee', 'receivedBy', 'voidedBy'])
            ->where('institution_id', $institutionId)
            ->where('student_id', $studentId)
            ->where('academic_year', $academicYear)
            ->orderBy('payment_date')
            ->orderBy('created_at')
            ->get();

        // Voided payments stay visible in the ledger for audit, but they are
        // excluded from all totals / running balance and per-fee breakdowns.
        $activePayments = $payments->whereNull('voided_at');

        $discounts = StudentDiscount::with(['schoolFee', 'creator', 'voidedBy'])
            ->where('institution_id', $institutionId)
            ->where('student_id', $studentId)
            ->where('academic_year', $academicYear)
            ->orderBy('created_at')
            ->get();

        $gradeLevelDiscounts = collect();
        if ($gradeLevel) {
            $gradeLevelDiscounts = GradeLevelDiscount::with(['schoolFee', 'creator'])
                ->where('institution_id', $institutionId)
                ->where('grade_level', $gradeLevel)
                ->where('academic_year', $academicYear)
                ->orderBy('created_at')
                ->get();
        }

        // Grade-level discounts voided for THIS student only, keyed by discount id.
        $gradeLevelDiscountVoids = $this->gradeLevelDiscountVoidsFor(
            $studentId,
            $gradeLevelDiscounts
        );

        $additionalFees = StudentAdditionalFee::where('institution_id', $institutionId)
            ->where('student_id', $studentId)
            ->where('academic_year', $academicYear)
            ->orderBy('created_at')
            ->get();

        // Late fees are additional-fee rows materialized from overdue installments
        // (source `late_fee`). They are kept apart from ad-hoc fees because they must
        // not feed the installment split, and payments settling one must not fill
        // installment principal. A carry-over plan charges a period more than once, so
        // these are held as a plain list — keying by installment would lose a row, and
        // its collections would then be mistaken for principal.
        $manualAdditionalFees = $additionalFees->reject(fn ($fee) => $fee->isLateFee())->values();
        $chargedLateFees = $additionalFees->filter(fn ($fee) => $fee->isLateFee())->values();

        // An ad-hoc fee declares whether it is amortized or collected on its own. Only the
        // installment-based ones join the principal the plan divides; a cash-basis fee is a
        // charge in its own right, like a late fee, and is settled outside the schedule.
        $installmentAdditionalFees = $manualAdditionalFees
            ->filter(fn ($fee) => $fee->isInstallmentBased())
            ->values();
        $cashAdditionalFees = $manualAdditionalFees
            ->filter(fn ($fee) => $fee->isCashBasis())
            ->values();

        $feeAmountMap = $feeDefaults->keyBy('school_fee_id')->map(function ($default) {
            return (float) $default->amount;
        });

        $standardCharges = (float) $feeDefaults->sum('amount');
        $cashChargesTotal = round((float) $cashAdditionalFees->sum('amount'), 2);
        $principalCharges = $standardCharges + (float) $installmentAdditionalFees->sum('amount');
        $discountsWithAmount = $this->applyDiscounts($discounts, $feeAmountMap, $standardCharges);
        $gradeLevelDiscountsWithAmount = $this->applyDiscounts($gradeLevelDiscounts, $feeAmountMap, $standardCharges);
        // Voided discounts stay visible in the ledger for audit, but they are
        // excluded from all totals / running balance and per-fee breakdowns.
        $activeDiscountsWithAmount = $discountsWithAmount->filter(
            fn ($payload) => $payload['discount']->voided_at === null
        );
        $activeGradeLevelDiscountsWithAmount = $gradeLevelDiscountsWithAmount->filter(
            fn ($payload) => ! $gradeLevelDiscountVoids->has($payload['discount']->id)
        );
        $discountsTotal = (float) $activeDiscountsWithAmount->sum('amount') + (float) $activeGradeLevelDiscountsWithAmount->sum('amount');
        $paymentsTotal = (float) $activePayments->sum('amount');
        // Money collected against a late fee or a cash-basis fee settles that charge, not
        // the installments — both sit outside the schedule.
        $offScheduleFees = $chargedLateFees->toBase()->merge($cashAdditionalFees);
        $lateFeePaymentsTotal = (float) $this->paymentsForFees($activePayments, $chargedLateFees)->sum('amount');
        $cashPaymentsTotal = round((float) $this->paymentsForFees($activePayments, $cashAdditionalFees)->sum('amount'), 2);
        $principalPayments = max(0.0, round($paymentsTotal - $lateFeePaymentsTotal - $cashPaymentsTotal, 2));
        // The same money as $principalPayments but row by row: a downpayment is decided by
        // payment date, which a single total cannot answer.
        $principalPaymentRows = $this->paymentsExcludingFees($activePayments, $offScheduleFees);
        $balanceForward = $this->calculateBalanceForward(
            $studentSections,
            $academicYear,
            $institutionId,
            $studentId
        );

        $paymentPlan = StudentPaymentPlan::with('paymentPlan.installments')
            ->where('institution_id', $institutionId)
            ->where('student_id', $studentId)
            ->where('academic_year', $academicYear)
            ->first();

        // Installments are split from the principal charges (before late fees) so a
        // late fee never feeds back into the per-installment amounts.
        $installments = $this->planService->buildInstallments(
            $paymentPlan,
            $academicYear,
            $principalCharges,
            (float) $discountsTotal,
            $principalPayments,
            $principalPaymentRows,
            $this->datedAdjustments(
                $activeDiscountsWithAmount->merge($activeGradeLevelDiscountsWithAmount),
                $installmentAdditionalFees
            )
        );

        // Reported alongside the schedule so the monthly view can show the downpayment as
        // its own settled row — without it the schedule totals less than Total Payable and
        // the collected money looks unapplied.
        $downpayment = $this->planService->resolveDownpayment(
            $paymentPlan,
            $academicYear,
            $principalCharges,
            (float) $discountsTotal,
            $principalPaymentRows
        );

        // Book a real charge for anything newly surcharged — an installment past its grace
        // window, and on a carry-over plan the balance rolled into a period that has opened
        // — then work from the charged rows. Once booked the fee stays: settling the
        // installment no longer erases it, and finance can waive it by deleting the charge.
        //
        // A reamortizing plan assesses nothing: a missed period is re-divided across the
        // periods after it, and that is the whole consequence. Surcharges booked under a plan
        // the student has since left are left exactly as they are — they were charged, and
        // stay collectible — so the rows already read from the ledger stand unchanged.
        if (! $paymentPlan?->paymentPlan?->reamortizes()) {
            $chargedLateFees = $this->lateFeeService->apply(
                $institutionId,
                $studentId,
                $academicYear,
                $installments,
                $paymentPlan,
                $principalPaymentRows,
                (float) $downpayment['amount']
            );
        }
        $installments = $this->planService->withLateFees($installments, $chargedLateFees);
        // Arrears folded forward, so a plan billing one accumulating figure has it to show.
        // Reported on every plan; only a `running_total` plan presents it as the amount due.
        $installments = $this->planService->withRunningTotals(
            $installments,
            $this->lateFeePaidBySequence($activePayments, $chargedLateFees)
        );

        $lateFeesTotal = (float) $chargedLateFees->sum(fn ($fee) => (float) $fee->amount);
        // Cash-basis fees are outside the schedule but still owed, so they are part of what
        // the student was charged.
        $chargesTotal = round($principalCharges + $cashChargesTotal + $lateFeesTotal, 2);
        $overdueDatesBySequence = collect($installments)
            ->keyBy(fn ($inst) => (int) $inst['sequence'])
            ->map(fn ($inst) => $inst['overdue_date'] ?? null);

        $lateFeeEntries = $chargedLateFees
            ->map(function ($fee) use ($overdueDatesBySequence) {
                $sequence = (int) $fee->installment_sequence;
                $pct = $this->lateFeeService->formatPercentage((float) $fee->late_fee_percentage);
                $reason = $fee->isCarriedSurcharge() ? '% carried over' : '% overdue';

                return [
                    'type' => 'charge',
                    'description' => $fee->name . ' (' . $pct . $reason . ')',
                    'amount' => (float) $fee->amount,
                    // Dated when the fee was incurred, not when the row happened to be
                    // written. Surcharges booked before assessment dates were recorded fall
                    // back to the installment's overdue date, which is what they were.
                    'date' => $fee->assessed_on?->toDateString()
                        ?? $overdueDatesBySequence->get($sequence)
                        ?? $fee->created_at?->toDateString(),
                    'fee_id' => $fee->id,
                    'fee_name' => $fee->name,
                    'source' => StudentAdditionalFee::SOURCE_LATE_FEE,
                    'installment_sequence' => $sequence,
                    'late_fee_stage' => $fee->lateFeeStage(),
                    'late_fee_percentage' => (float) $fee->late_fee_percentage,
                ];
            })
            ->values();

        $entries = collect();
        if (abs($balanceForward) > 0.0001) {
            $entries->push([
                'type' => 'balance_forward',
                'description' => 'Balance forward from previous years',
                'amount' => $balanceForward,
                'date' => null,
            ]);
        }

        $chargeEntries = $feeDefaults->map(function ($default) {
            return [
                'type' => 'charge',
                'description' => $default->schoolFee?->name ?? 'School Fee',
                'amount' => (float) $default->amount,
                'date' => null,
                'fee_id' => $default->school_fee_id,
                'fee_name' => $default->schoolFee?->name,
            ];
        });

        $additionalFeeEntries = $manualAdditionalFees->map(function ($af) {
            return [
                'type' => 'charge',
                'description' => 'Additional: ' . $af->name,
                'amount' => (float) $af->amount,
                'date' => $af->created_at?->toDateString(),
                'fee_id' => $af->id,
                'fee_name' => $af->name,
                'source' => $af->source,
                'billing_type' => $af->isInstallmentBased()
                    ? StudentAdditionalFee::BILLING_INSTALLMENT
                    : StudentAdditionalFee::BILLING_CASH,
            ];
        });

        $discountEntries = $discountsWithAmount->map(function ($payload) {
            $discount = $payload['discount'];
            $feeName = $discount->schoolFee?->name;
            $label = $feeName ? 'Discount - ' . $feeName : 'Discount';
            $description = $discount->description ? $label . ' (' . $discount->description . ')' : $label;
            $creator = $discount->creator;
            $processedByName = $creator
                ? trim(($creator->first_name ?? '') . ' ' . ($creator->last_name ?? ''))
                : null;
            $voidedByUser = $discount->voidedBy;
            $voidedByName = $voidedByUser
                ? trim(($voidedByUser->first_name ?? '') . ' ' . ($voidedByUser->last_name ?? ''))
                : null;

            return [
                'type' => 'discount',
                'description' => $description,
                'amount' => -1 * (float) $payload['amount'],
                'date' => $discount->created_at?->toDateString(),
                'discount_id' => $discount->id,
                'discount_type' => $discount->discount_type,
                'discount_value' => (float) $discount->value,
                'discount_scope' => 'student',
                'fee_id' => $discount->school_fee_id,
                'fee_name' => $feeName,
                'processed_by' => $processedByName,
                'voided' => $discount->voided_at !== null,
                'voided_at' => $discount->voided_at?->toDateTimeString(),
                'voided_by' => $voidedByName,
                'void_note' => $discount->void_note,
            ];
        });

        $gradeLevelDiscountEntries = $gradeLevelDiscountsWithAmount->map(function ($payload) use ($gradeLevelDiscountVoids) {
            $discount = $payload['discount'];
            $feeName = $discount->schoolFee?->name;
            $label = $feeName ? 'Grade Discount - ' . $feeName : 'Grade Discount';
            $description = $discount->description ? $label . ' (' . $discount->description . ')' : $label;
            $creator = $discount->creator;
            $processedByName = $creator
                ? trim(($creator->first_name ?? '') . ' ' . ($creator->last_name ?? ''))
                : null;

            // A void row (if any) suppresses this grade discount for the student.
            $void = $gradeLevelDiscountVoids->get($discount->id);
            $voidedByUser = $void?->voidedBy;
            $voidedByName = $voidedByUser
                ? trim(($voidedByUser->first_name ?? '') . ' ' . ($voidedByUser->last_name ?? ''))
                : null;

            return [
                'type' => 'discount',
                'description' => $description,
                'amount' => -1 * (float) $payload['amount'],
                'date' => $discount->created_at?->toDateString(),
                'discount_id' => $discount->id,
                'discount_type' => $discount->discount_type,
                'discount_value' => (float) $discount->value,
                'discount_scope' => 'grade_level',
                'fee_id' => $discount->school_fee_id,
                'fee_name' => $feeName,
                'processed_by' => $processedByName,
                'voided' => $void !== null,
                'voided_at' => $void?->voided_at?->toDateTimeString(),
                'voided_by' => $voidedByName,
                'void_note' => $void?->void_note,
            ];
        });

        $paymentEntries = $payments->map(function ($payment) {
            // A payment settles either a school fee or an additional fee (late fees included).
            $feeName = $payment->schoolFee?->name ?? $payment->additionalFee?->name;
            $label = $feeName ? 'Payment - ' . $feeName : 'Payment';
            $receivedBy = $payment->receivedBy;
            $processedByName = $receivedBy
                ? trim(($receivedBy->first_name ?? '') . ' ' . ($receivedBy->last_name ?? ''))
                : null;
            $isVoided = $payment->voided_at !== null;
            $voidedByUser = $payment->voidedBy;
            $voidedByName = $voidedByUser
                ? trim(($voidedByUser->first_name ?? '') . ' ' . ($voidedByUser->last_name ?? ''))
                : null;

            return [
                'type' => 'payment',
                'description' => $label,
                'amount' => -1 * (float) $payment->amount,
                'date' => $payment->payment_date?->toDateString(),
                'or_number' => $payment->or_number,
                'receipt_number' => $payment->receipt_number,
                'reference_number' => $payment->reference_number,
                'payment_id' => $payment->id,
                'fee_id' => $payment->school_fee_id ?? $payment->student_additional_fee_id,
                'fee_name' => $feeName,
                'source' => $payment->additionalFee?->source,
                'processed_by' => $processedByName,
                'voided' => $isVoided,
                'voided_at' => $payment->voided_at?->toDateTimeString(),
                'voided_by' => $voidedByName,
                'void_note' => $payment->void_note,
            ];
        });

        $entries = $entries
            ->merge($chargeEntries)
            ->merge($additionalFeeEntries)
            ->merge($lateFeeEntries)
            ->merge($discountEntries)
            ->merge($gradeLevelDiscountEntries)
            ->merge($paymentEntries);

        $entries = $entries->sortBy(function ($entry) {
            $typeOrder = [
                'balance_forward' => 0,
                'charge' => 1,
                'discount' => 2,
                'payment' => 3,
            ];
            $order = $typeOrder[$entry['type']] ?? 3;
            $date = $entry['date'] ? strtotime($entry['date']) : 0;
            return [$order, $date];
        })->values();

        $runningBalance = 0.0;
        $entries = $entries->map(function ($entry) use (&$runningBalance) {
            // Voided payments are shown for audit but must not move the balance.
            if (empty($entry['voided'])) {
                $runningBalance += (float) $entry['amount'];
            }
            $entry['running_balance'] = round($runningBalance, 2);
            return $entry;
        });

        $balance = $balanceForward + $chargesTotal - $discountsTotal - $paymentsTotal;

        // Per-fee breakdown used by the cashiering (POS) screen to show the
        // outstanding amount for each fee so the cashier can pay toward each.
        [$feeBreakdown, $unallocatedPayments] = $this->buildFeeBreakdown(
            $activePayments,
            $feeDefaults,
            $manualAdditionalFees,
            $chargedLateFees,
            $activeDiscountsWithAmount->merge($activeGradeLevelDiscountsWithAmount)
        );

        return response()->json([
            'success' => true,
            'data' => [
                'student' => $student,
                'academic_year' => $academicYear,
                'grade_level' => $gradeLevel,
                'section' => $section,
                'entries' => $entries,
                'totals' => [
                    'charges' => round($chargesTotal, 2),
                    'late_fees' => round($lateFeesTotal, 2),
                    'cash_fees' => $cashChargesTotal,
                    'discounts' => round($discountsTotal, 2),
                    'payments' => round($paymentsTotal, 2),
                    'balance_forward' => round($balanceForward, 2),
                    'balance' => round($balance, 2),
                ],
                // Charges that never entered the schedule, so the Payment Schedule view can
                // exclude them from Total Payable without treating their collections as
                // money it failed to apply.
                'cash_basis' => [
                    'charges' => $cashChargesTotal,
                    'paid' => $cashPaymentsTotal,
                    'outstanding' => round(max($cashChargesTotal - $cashPaymentsTotal, 0), 2),
                    'fee_count' => $cashAdditionalFees->count(),
                ],
                'fee_breakdown' => $feeBreakdown,
                'unallocated_payments' => round($unallocatedPayments, 2),
                'payment_plan' => $this->planService->serializePlan($paymentPlan),
                'downpayment' => $downpayment,
                'installments' => $installments,
                'available_academic_years' => $availableAcademicYears,
            ]
        ]);
    }

    /**
     * Get Notice of Account (NOA) summary for a student.
     */
    public function noticeOfAccount(Request $request, string $studentId): JsonResponse
    {
        if ($this->isStudentActor($request) && !$this->isSelfStudent($request, $studentId)) {
            return response()->json([
                'success' => false,
                'message' => 'Students can only access their own notice of account'
            ], 403);
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (!$institutionId) {
            return response()->json([
                'success' => false,
                'message' => 'User does not have any institution assigned'
            ], 400);
        }

        $student = Student::whereHas('studentInstitutions', function ($query) use ($institutionId) {
            $query->where('institution_id', $institutionId);
        })->find($studentId);

        if (!$student) {
            return response()->json([
                'success' => false,
                'message' => 'Student not found'
            ], 404);
        }

        $studentSections = StudentSection::with('classSection')
            ->where('student_id', $studentId)
            ->orderByDesc('created_at')
            ->get();

        $availableAcademicYears = $this->getAvailableAcademicYears($studentSections);
        $requestedAcademicYear = $request->get('academic_year');
        $academicYear = $this->resolveAcademicYear($studentSections, $requestedAcademicYear);
        if (!$academicYear) {
            $academicYear = $this->fallbackAcademicYear();
        }

        $gradeLevel = $this->resolveGradeLevel($studentSections, $academicYear);

        $feeDefaults = collect();
        if ($gradeLevel) {
            $feeDefaults = SchoolFeeDefault::with('schoolFee')
                ->where('institution_id', $institutionId)
                ->where('grade_level', $gradeLevel)
                ->where('academic_year', $academicYear)
                ->orderBy('created_at')
                ->get();
        }

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
        }

        // Drop grade-level discounts that were voided for this student.
        $gradeLevelDiscountVoids = $this->gradeLevelDiscountVoidsFor($studentId, $gradeLevelDiscounts);
        $gradeLevelDiscounts = $gradeLevelDiscounts->reject(
            fn ($discount) => $gradeLevelDiscountVoids->has($discount->id)
        )->values();

        $additionalFees = StudentAdditionalFee::where('institution_id', $institutionId)
            ->where('student_id', $studentId)
            ->where('academic_year', $academicYear)
            ->orderBy('created_at')
            ->get();

        $payments = StudentPayment::with(['schoolFee', 'additionalFee'])
            ->where('institution_id', $institutionId)
            ->where('student_id', $studentId)
            ->where('academic_year', $academicYear)
            ->whereNull('voided_at')
            ->orderBy('payment_date')
            ->orderBy('created_at')
            ->get();

        $feeAmountMap = $feeDefaults->keyBy('school_fee_id')->map(function ($default) {
            return (float) $default->amount;
        });

        // Same split as the ledger: late fees are charges in their own right, and are
        // excluded from the principal the installment schedule is divided from.
        $manualAdditionalFees = $additionalFees->reject(fn ($fee) => $fee->isLateFee())->values();
        $chargedLateFees = $additionalFees->filter(fn ($fee) => $fee->isLateFee())->values();

        // And the same split by basis: only amortized ad-hoc fees are divided by the plan.
        $installmentAdditionalFees = $manualAdditionalFees
            ->filter(fn ($fee) => $fee->isInstallmentBased())
            ->values();
        $cashAdditionalFees = $manualAdditionalFees
            ->filter(fn ($fee) => $fee->isCashBasis())
            ->values();

        $standardCharges = (float) $feeDefaults->sum('amount');
        $cashChargesTotal = round((float) $cashAdditionalFees->sum('amount'), 2);
        $principalCharges = $standardCharges + (float) $installmentAdditionalFees->sum('amount');
        $discountsWithAmount = $this->applyDiscounts($discounts, $feeAmountMap, $standardCharges);
        $gradeLevelDiscountsWithAmount = $this->applyDiscounts($gradeLevelDiscounts, $feeAmountMap, $standardCharges);
        $discountsTotal = (float) $discountsWithAmount->sum('amount') + (float) $gradeLevelDiscountsWithAmount->sum('amount');
        $paymentsTotal = (float) $payments->sum('amount');
        $offScheduleFees = $chargedLateFees->toBase()->merge($cashAdditionalFees);
        $lateFeePaymentsTotal = (float) $this->paymentsForFees($payments, $chargedLateFees)->sum('amount');
        $cashPaymentsTotal = round((float) $this->paymentsForFees($payments, $cashAdditionalFees)->sum('amount'), 2);
        $principalPayments = max(0.0, round($paymentsTotal - $lateFeePaymentsTotal - $cashPaymentsTotal, 2));
        $principalPaymentRows = $this->paymentsExcludingFees($payments, $offScheduleFees);
        $balanceForward = $this->calculateBalanceForward(
            $studentSections,
            $academicYear,
            $institutionId,
            $studentId
        );

        $paymentPlan = StudentPaymentPlan::with('paymentPlan.installments')
            ->where('institution_id', $institutionId)
            ->where('student_id', $studentId)
            ->where('academic_year', $academicYear)
            ->first();

        $installments = $this->planService->buildInstallments(
            $paymentPlan,
            $academicYear,
            $principalCharges,
            (float) $discountsTotal,
            $principalPayments,
            $principalPaymentRows,
            // Mirrors the ledger, and drawn from the same discount payloads this method totals,
            // so a printed notice prices a month exactly as the screen does.
            $this->datedAdjustments(
                $discountsWithAmount->merge($gradeLevelDiscountsWithAmount),
                $installmentAdditionalFees
            )
        );

        $downpayment = $this->planService->resolveDownpayment(
            $paymentPlan,
            $academicYear,
            $principalCharges,
            (float) $discountsTotal,
            $principalPaymentRows
        );

        // The notice of account books newly-incurred surcharges just like the ledger, so a
        // printed NOA and the on-screen balance can never disagree about them — including in
        // declining to assess any on a reamortizing plan.
        if (! $paymentPlan?->paymentPlan?->reamortizes()) {
            $chargedLateFees = $this->lateFeeService->apply(
                $institutionId,
                $studentId,
                $academicYear,
                $installments,
                $paymentPlan,
                $principalPaymentRows,
                (float) $downpayment['amount']
            );
        }
        $installments = $this->planService->withLateFees($installments, $chargedLateFees);
        // Arrears folded forward, so a plan billing one accumulating figure has it to show.
        // Reported on every plan; only a `running_total` plan presents it as the amount due.
        $installments = $this->planService->withRunningTotals(
            $installments,
            $this->lateFeePaidBySequence($payments, $chargedLateFees)
        );

        $lateFeesTotal = (float) $chargedLateFees->sum(fn ($fee) => (float) $fee->amount);
        $chargesTotal = round($principalCharges + $cashChargesTotal + $lateFeesTotal, 2);
        $balance = $balanceForward + $chargesTotal - $discountsTotal - $paymentsTotal;

        $allDiscountsMapped = $discountsWithAmount->map(function ($payload) {
            $discount = $payload['discount'];

            return [
                'discount_id' => $discount->id,
                'discount_type' => $discount->discount_type,
                'discount_value' => (float) $discount->value,
                'amount' => (float) $payload['amount'],
                'description' => $discount->description,
                'fee_id' => $discount->school_fee_id,
                'fee_name' => $discount->schoolFee?->name,
                'scope' => 'student',
                'created_at' => $discount->created_at?->toDateString(),
            ];
        })->merge($gradeLevelDiscountsWithAmount->map(function ($payload) {
            $discount = $payload['discount'];

            return [
                'discount_id' => $discount->id,
                'discount_type' => $discount->discount_type,
                'discount_value' => (float) $discount->value,
                'amount' => (float) $payload['amount'],
                'description' => $discount->description ?? ('Grade Level Discount - ' . $discount->grade_level),
                'fee_id' => $discount->school_fee_id,
                'fee_name' => $discount->schoolFee?->name,
                'scope' => 'grade_level',
                'created_at' => $discount->created_at?->toDateString(),
            ];
        }));

        // The notice itemizes by fee, so it bills from the same per-fee figures the
        // cashier collects against rather than a second reading of the same rows.
        [$feeBreakdown, $unallocatedPayments] = $this->buildFeeBreakdown(
            $payments,
            $feeDefaults,
            $manualAdditionalFees,
            $chargedLateFees,
            $discountsWithAmount->merge($gradeLevelDiscountsWithAmount)
        );

        $allFees = $feeDefaults->map(function ($default) {
            return [
                'fee_id' => $default->school_fee_id,
                'fee_name' => $default->schoolFee?->name ?? 'School Fee',
                'amount' => (float) $default->amount,
                'is_additional' => false,
                'billing_type' => StudentAdditionalFee::BILLING_INSTALLMENT,
            ];
        })->toBase()->merge(
            $manualAdditionalFees
                ->merge($chargedLateFees)
                ->map(function ($af) {
                    return [
                        'fee_id' => $af->id,
                        'fee_name' => $af->name,
                        'amount' => (float) $af->amount,
                        'is_additional' => true,
                        'source' => $af->source,
                        'billing_type' => $af->isCashBasis()
                            ? StudentAdditionalFee::BILLING_CASH
                            : StudentAdditionalFee::BILLING_INSTALLMENT,
                        'installment_sequence' => $af->installment_sequence,
                        'late_fee_stage' => $af->isLateFee() ? $af->lateFeeStage() : null,
                    ];
                })
        );

        return response()->json([
            'success' => true,
            'data' => [
                'student' => $student,
                'academic_year' => $academicYear,
                'grade_level' => $gradeLevel,
                'fees' => $allFees,
                'discounts' => $allDiscountsMapped,
                'payments' => $payments->map(function ($payment) {
                    return [
                        'payment_id' => $payment->id,
                        'amount' => (float) $payment->amount,
                        'payment_date' => $payment->payment_date?->toDateString(),
                        'receipt_number' => $payment->receipt_number,
                        'reference_number' => $payment->reference_number,
                        'fee_name' => $payment->schoolFee?->name ?? $payment->additionalFee?->name,
                    ];
                }),
                'totals' => [
                    'charges' => round($chargesTotal, 2),
                    'late_fees' => round($lateFeesTotal, 2),
                    'cash_fees' => $cashChargesTotal,
                    'discounts' => round($discountsTotal, 2),
                    'payments' => round($paymentsTotal, 2),
                    'balance_forward' => round($balanceForward, 2),
                    'balance' => round($balance, 2),
                ],
                'cash_basis' => [
                    'charges' => $cashChargesTotal,
                    'paid' => $cashPaymentsTotal,
                    'outstanding' => round(max($cashChargesTotal - $cashPaymentsTotal, 0), 2),
                    'fee_count' => $cashAdditionalFees->count(),
                ],
                'fee_breakdown' => $feeBreakdown,
                'unallocated_payments' => $unallocatedPayments,
                'payment_plan' => $this->planService->serializePlan($paymentPlan),
                'downpayment' => $downpayment,
                'installments' => $installments,
                'available_academic_years' => $availableAcademicYears,
            ]
        ]);
    }

    /**
     * How much has been collected against each period's surcharges, keyed by installment
     * sequence — what withRunningTotals() needs to report a balance rather than a charge.
     *
     * A late fee is booked against the installment that incurred it and the payment that
     * settles it points at the fee row, so the collection is mapped back through the row to
     * land on the period rather than on principal. A carry-over plan books two rows for one
     * period; both belong to the same sequence and are summed.
     *
     * @param  iterable  $payments  non-voided StudentPayment rows
     * @param  iterable  $lateFees  StudentAdditionalFee rows, source `late_fee`
     * @return array<int, float>
     */
    private function lateFeePaidBySequence($payments, $lateFees): array
    {
        $sequenceByFee = collect($lateFees)
            ->filter(fn ($fee) => $fee->installment_sequence !== null)
            ->mapWithKeys(fn ($fee) => [$fee->id => (int) $fee->installment_sequence]);

        $paid = [];
        foreach ($payments as $payment) {
            $feeId = $payment->student_additional_fee_id;
            if (! $feeId || ! $sequenceByFee->has($feeId)) {
                continue;
            }

            $sequence = $sequenceByFee[$feeId];
            $paid[$sequence] = round(($paid[$sequence] ?? 0.0) + (float) $payment->amount, 2);
        }

        return $paid;
    }

    /**
     * Payments allocated to any of the given additional-fee rows.
     *
     * @param  iterable  $fees  StudentAdditionalFee models
     */
    private function paymentsForFees($payments, $fees): Collection
    {
        $ids = collect($fees)->pluck('id')->filter()->all();
        if (empty($ids)) {
            return collect();
        }

        return collect($payments)->filter(
            fn ($payment) => $payment->student_additional_fee_id
                && in_array($payment->student_additional_fee_id, $ids, true)
        );
    }

    /**
     * When what a student owes changed, and by how much — what a reamortizing plan needs to
     * keep a period priced from the figures that stood when it opened.
     *
     * A discount granted in November did not exist in July, so July must keep the figure it
     * was billed; the same goes for an ad-hoc charge added mid-year. Without the dates, either
     * one would silently rewrite every notice already issued for the earlier months.
     *
     * The grade's standard fees are deliberately absent: they are the year's stated cost
     * rather than something granted on a date, so a change to one is a correction and is meant
     * to re-price the schedule.
     *
     * @param  iterable  $discountPayloads  ['discount' => model, 'amount' => float] as
     *                   applyDiscounts() returns them, already filtered to the active ones
     * @param  iterable  $installmentFees  StudentAdditionalFee rows that join the principal
     * @return array<int, array{date: string, charge: float, discount: float}>
     */
    private function datedAdjustments($discountPayloads, $installmentFees): array
    {
        $rows = [];

        foreach ($discountPayloads as $payload) {
            $date = $payload['discount']->created_at;
            if (! $date) {
                continue;
            }

            $rows[] = [
                'date' => $date->toDateString(),
                'charge' => 0.0,
                'discount' => round((float) $payload['amount'], 2),
            ];
        }

        foreach ($installmentFees as $fee) {
            if (! $fee->created_at) {
                continue;
            }

            $rows[] = [
                'date' => $fee->created_at->toDateString(),
                'charge' => round((float) $fee->amount, 2),
                'discount' => 0.0,
            ];
        }

        return $rows;
    }

    /**
     * The complement of paymentsForFees(): everything settling plan principal rather than
     * one of the given fee rows.
     *
     * @param  iterable  $fees  StudentAdditionalFee models
     */
    private function paymentsExcludingFees($payments, $fees): Collection
    {
        $ids = collect($fees)->pluck('id')->filter()->all();

        return collect($payments)->reject(
            fn ($payment) => $payment->student_additional_fee_id
                && in_array($payment->student_additional_fee_id, $ids, true)
        )->values();
    }

    private function resolveInstitutionId(Request $request): ?string
    {
        $user = $request->user();
        if (!$user) {
            return null;
        }

        if ($user instanceof StudentPortalUser) {
            return $user->student
                ->studentInstitutions()
                ->where('is_active', true)
                ->value('institution_id')
                ?? $user->student->studentInstitutions()->value('institution_id');
        }

        $institutionId = $user->getDefaultInstitutionId();
        if (!$institutionId) {
            $firstUserInstitution = $user->userInstitutions()->first();
            if ($firstUserInstitution) {
                $institutionId = $firstUserInstitution->institution_id;
            }
        }

        if (!$institutionId && $this->isStudentActor($request)) {
            $selfStudentId = $this->resolveSelfStudentId($request);
            if ($selfStudentId) {
                $selfStudent = Student::find($selfStudentId);
                $institutionId = $selfStudent?->studentInstitutions()->value('institution_id');
            }
        }

        return $institutionId;
    }

    private function isStudentActor(Request $request): bool
    {
        $user = $request->user();
        if (!$user) {
            return false;
        }

        if ($user instanceof StudentPortalUser) {
            return true;
        }

        $role = method_exists($user, 'getRole') ? $user->getRole() : null;
        return (string) ($role->slug ?? '') === 'student';
    }

    private function isSelfStudent(Request $request, string $studentId): bool
    {
        return $this->resolveSelfStudentId($request) === $studentId;
    }

    private function resolveSelfStudentId(Request $request): ?string
    {
        $user = $request->user();
        if (!$user) {
            return null;
        }

        if ($user instanceof StudentPortalUser) {
            return $user->student->id;
        }

        return Student::where('user_id', $user->id)->value('id');
    }

    private function getAvailableAcademicYears($studentSections)
    {
        return $studentSections
            ->pluck('academic_year')
            ->filter()
            ->unique()
            ->sortByDesc(function ($year) {
                return $this->extractStartYear($year) ?? 0;
            })
            ->values()
            ->all();
    }

    private function resolveAcademicYear($studentSections, ?string $requestedYear): ?string
    {
        if ($requestedYear) {
            return $requestedYear;
        }

        $activeSection = $studentSections->firstWhere('is_active', true);
        if ($activeSection && $activeSection->academic_year) {
            return $activeSection->academic_year;
        }

        $academicYears = $studentSections->pluck('academic_year')->filter()->unique();
        if ($academicYears->isEmpty()) {
            return null;
        }

        return $academicYears->sortByDesc(function ($year) {
            return $this->extractStartYear($year) ?? 0;
        })->first();
    }

    private function resolveGradeLevel($studentSections, string $academicYear): ?string
    {
        $sectionsForYear = $studentSections->filter(function ($section) use ($academicYear) {
            return $section->academic_year === $academicYear;
        });

        $selected = $sectionsForYear->firstWhere('is_active', true) ?? $sectionsForYear->first();
        return $selected?->classSection?->grade_level;
    }

    private function resolveSection($studentSections, string $academicYear): ?string
    {
        $sectionsForYear = $studentSections->filter(function ($section) use ($academicYear) {
            return $section->academic_year === $academicYear;
        });

        $selected = $sectionsForYear->firstWhere('is_active', true) ?? $sectionsForYear->first();
        return $selected?->classSection?->title;
    }

    private function calculateBalanceForward($studentSections, string $academicYear, string $institutionId, string $studentId): float
    {
        $availableYears = $this->getAvailableAcademicYears($studentSections);
        $targetStart = $this->extractStartYear($academicYear);
        $balanceForward = 0.0;

        foreach ($availableYears as $year) {
            if ($year === $academicYear) {
                continue;
            }

            if ($targetStart !== null) {
                $yearStart = $this->extractStartYear($year);
                if ($yearStart === null || $yearStart >= $targetStart) {
                    continue;
                }
            } else {
                if ($year >= $academicYear) {
                    continue;
                }
            }

            $gradeLevel = $this->resolveGradeLevel($studentSections, $year);
            $charges = 0.0;
            $discountsTotal = 0.0;
            if ($gradeLevel) {
                $feeDefaults = SchoolFeeDefault::where('institution_id', $institutionId)
                    ->where('grade_level', $gradeLevel)
                    ->where('academic_year', $year)
                    ->get();

                $charges = (float) $feeDefaults->sum('amount');
                $feeAmountMap = $feeDefaults->keyBy('school_fee_id')->map(function ($default) {
                    return (float) $default->amount;
                });

                $discounts = StudentDiscount::where('institution_id', $institutionId)
                    ->where('student_id', $studentId)
                    ->where('academic_year', $year)
                    ->whereNull('voided_at')
                    ->get();

                $discountsTotal = (float) $this->applyDiscounts($discounts, $feeAmountMap, $charges)
                    ->sum('amount');
            }

            // Additional fees (ad-hoc charges and late fees booked for that year) are
            // owed just like school fees, so they have to carry forward too — otherwise
            // payments made against them would drag the carried balance negative.
            $charges += (float) StudentAdditionalFee::where('institution_id', $institutionId)
                ->where('student_id', $studentId)
                ->where('academic_year', $year)
                ->sum('amount');

            $payments = (float) StudentPayment::where('institution_id', $institutionId)
                ->where('student_id', $studentId)
                ->where('academic_year', $year)
                ->whereNull('voided_at')
                ->sum('amount');

            $balanceForward += ($charges - $discountsTotal - $payments);
        }

        return round($balanceForward, 2);
    }

    private function extractStartYear(?string $academicYear): ?int
    {
        if (!$academicYear) {
            return null;
        }

        if (preg_match('/(\d{4})/', $academicYear, $matches)) {
            return (int) $matches[1];
        }

        return null;
    }

    private function fallbackAcademicYear(): string
    {
        $currentYear = now()->year;
        return $currentYear . '-' . ($currentYear + 1);
    }

    /**
     * Load per-student void rows for the given grade-level discounts, keyed by
     * grade_level_discount_id. Returns an empty collection when there are no
     * grade discounts to check.
     */
    private function gradeLevelDiscountVoidsFor(string $studentId, $gradeLevelDiscounts)
    {
        if ($gradeLevelDiscounts->isEmpty()) {
            return collect();
        }

        return GradeLevelDiscountStudentVoid::with('voidedBy')
            ->where('student_id', $studentId)
            ->whereIn('grade_level_discount_id', $gradeLevelDiscounts->pluck('id'))
            ->get()
            ->keyBy('grade_level_discount_id');
    }

    /**
     * @see \App\Services\Finance\FeeBreakdownBuilder::build()
     *
     * Kept as a wrapper so the ledger and the notice of account read unchanged; the
     * arithmetic itself lives in the service, which the naming backfill shares.
     *
     * @param  iterable  $activePayments  non-voided StudentPayment rows
     * @param  iterable  $feeDefaults  SchoolFeeDefault rows for the grade level and year
     * @param  iterable  $manualAdditionalFees  ad-hoc fees, late fees excluded
     * @param  iterable  $chargedLateFees  surcharges booked against the schedule
     * @param  iterable  $discountPayloads  applyDiscounts() output, student + grade level
     * @return array{0: \Illuminate\Support\Collection, 1: float}
     */
    private function buildFeeBreakdown(
        $activePayments,
        $feeDefaults,
        $manualAdditionalFees,
        $chargedLateFees,
        $discountPayloads
    ): array {
        return $this->feeBreakdown->build(
            $activePayments,
            $feeDefaults,
            $manualAdditionalFees,
            $chargedLateFees,
            $discountPayloads
        );
    }

    /**
     * @see \App\Services\Finance\FeeBreakdownBuilder::priceDiscounts()
     *
     * A wrapper so the ledger, the notice and the projections read unchanged. The pricing
     * itself is shared with the per-fee breakdown that consumes it — the naming backfill
     * has to reach the same peso figures the ledger reports, and two copies of this would
     * eventually stop agreeing.
     */
    private function applyDiscounts($discounts, $feeAmountMap, float $chargesTotal)
    {
        return $this->feeBreakdown->priceDiscounts($discounts, $feeAmountMap, $chargesTotal);
    }
}
