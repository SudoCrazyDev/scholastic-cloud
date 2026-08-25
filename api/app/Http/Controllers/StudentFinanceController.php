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
use App\Services\PaymentPlanService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;

class StudentFinanceController extends Controller
{
    public function __construct(
        private PaymentPlanService $planService,
        private LateFeeService $lateFeeService
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
    private function buildFeeBreakdown(
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

        $breakdown = collect($feeDefaults)->map(function ($default) use ($paidByFee, $discountByFee) {
            $feeId = $default->school_fee_id;
            $charge = (float) $default->amount;
            $discount = (float) ($discountByFee[$feeId] ?? 0);
            $paid = (float) ($paidByFee[$feeId] ?? 0);

            return [
                'fee_id' => $feeId,
                'fee_name' => $default->schoolFee?->name ?? 'School Fee',
                'is_additional' => false,
                // Standard grade-level fees are the plan's principal by definition.
                'billing_type' => StudentAdditionalFee::BILLING_INSTALLMENT,
                'charge' => round($charge, 2),
                'discount' => round($discount, 2),
                'paid' => round($paid, 2),
                'outstanding' => round($charge - $discount - $paid, 2),
            ];
        })->toBase()->merge(
            // Ad-hoc fees first, then the surcharges charged against the schedule — each
            // its own collectible line, already in installment order.
            collect($manualAdditionalFees)
                ->merge($chargedLateFees)
                ->map(function ($af) use ($paidByAdditionalFee, $discountByFee) {
                    $charge = (float) $af->amount;
                    $discount = (float) ($discountByFee[$af->id] ?? 0);
                    $paid = (float) ($paidByAdditionalFee[$af->id] ?? 0);

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
                        'outstanding' => round($charge - $discount - $paid, 2),
                    ];
                })
        )->values();

        $unallocatedPayments = round((float) $activePayments
            ->filter(fn ($payment) => !$payment->school_fee_id && !$payment->student_additional_fee_id)
            ->sum('amount'), 2);

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
    private function spreadProportionally(float $amount, array $weights): array
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

    private function applyDiscounts($discounts, $feeAmountMap, float $chargesTotal)
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
}
