<?php

namespace App\Http\Controllers;

use App\Auth\StudentPortalUser;
use App\Models\GradeLevelDiscount;
use App\Models\Student;
use App\Models\StudentAdditionalFee;
use App\Models\StudentSection;
use App\Models\SchoolFeeDefault;
use App\Models\StudentDiscount;
use App\Models\StudentPayment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class StudentFinanceController extends Controller
{
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

        $feeDefaults = collect();
        if ($gradeLevel) {
            $feeDefaults = SchoolFeeDefault::with('schoolFee')
                ->where('institution_id', $institutionId)
                ->where('grade_level', $gradeLevel)
                ->where('academic_year', $academicYear)
                ->orderBy('created_at')
                ->get();
        }

        $payments = StudentPayment::with('schoolFee')
            ->where('institution_id', $institutionId)
            ->where('student_id', $studentId)
            ->where('academic_year', $academicYear)
            ->orderBy('payment_date')
            ->orderBy('created_at')
            ->get();

        $discounts = StudentDiscount::with('schoolFee')
            ->where('institution_id', $institutionId)
            ->where('student_id', $studentId)
            ->where('academic_year', $academicYear)
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

        $additionalFees = StudentAdditionalFee::where('institution_id', $institutionId)
            ->where('student_id', $studentId)
            ->where('academic_year', $academicYear)
            ->orderBy('created_at')
            ->get();

        $feeAmountMap = $feeDefaults->keyBy('school_fee_id')->map(function ($default) {
            return (float) $default->amount;
        });

        $chargesTotal = (float) $feeDefaults->sum('amount') + (float) $additionalFees->sum('amount');
        $standardCharges = (float) $feeDefaults->sum('amount');
        $discountsWithAmount = $this->applyDiscounts($discounts, $feeAmountMap, $standardCharges);
        $gradeLevelDiscountsWithAmount = $this->applyDiscounts($gradeLevelDiscounts, $feeAmountMap, $standardCharges);
        $discountsTotal = (float) $discountsWithAmount->sum('amount') + (float) $gradeLevelDiscountsWithAmount->sum('amount');
        $paymentsTotal = (float) $payments->sum('amount');
        $balanceForward = $this->calculateBalanceForward(
            $studentSections,
            $academicYear,
            $institutionId,
            $studentId
        );

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

        $additionalFeeEntries = $additionalFees->map(function ($af) {
            return [
                'type' => 'charge',
                'description' => 'Additional: ' . $af->name,
                'amount' => (float) $af->amount,
                'date' => $af->created_at?->toDateString(),
                'fee_id' => $af->id,
                'fee_name' => $af->name,
            ];
        });

        $discountEntries = $discountsWithAmount->map(function ($payload) {
            $discount = $payload['discount'];
            $feeName = $discount->schoolFee?->name;
            $label = $feeName ? 'Discount - ' . $feeName : 'Discount';
            $description = $discount->description ? $label . ' (' . $discount->description . ')' : $label;

            return [
                'type' => 'discount',
                'description' => $description,
                'amount' => -1 * (float) $payload['amount'],
                'date' => $discount->created_at?->toDateString(),
                'discount_id' => $discount->id,
                'discount_type' => $discount->discount_type,
                'discount_value' => (float) $discount->value,
                'fee_id' => $discount->school_fee_id,
                'fee_name' => $feeName,
            ];
        });

        $gradeLevelDiscountEntries = $gradeLevelDiscountsWithAmount->map(function ($payload) {
            $discount = $payload['discount'];
            $feeName = $discount->schoolFee?->name;
            $label = $feeName ? 'Grade Discount - ' . $feeName : 'Grade Discount';
            $description = $discount->description ? $label . ' (' . $discount->description . ')' : $label;

            return [
                'type' => 'discount',
                'description' => $description,
                'amount' => -1 * (float) $payload['amount'],
                'date' => $discount->created_at?->toDateString(),
                'discount_id' => $discount->id,
                'discount_type' => $discount->discount_type,
                'discount_value' => (float) $discount->value,
                'fee_id' => $discount->school_fee_id,
                'fee_name' => $feeName,
            ];
        });

        $paymentEntries = $payments->map(function ($payment) {
            $feeName = $payment->schoolFee?->name;
            $label = $feeName ? 'Payment - ' . $feeName : 'Payment';
            return [
                'type' => 'payment',
                'description' => $label,
                'amount' => -1 * (float) $payment->amount,
                'date' => $payment->payment_date?->toDateString(),
                'receipt_number' => $payment->receipt_number,
                'reference_number' => $payment->reference_number,
                'payment_id' => $payment->id,
                'fee_id' => $payment->school_fee_id,
                'fee_name' => $feeName,
            ];
        });

        $entries = $entries
            ->merge($chargeEntries)
            ->merge($additionalFeeEntries)
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
            $runningBalance += (float) $entry['amount'];
            $entry['running_balance'] = round($runningBalance, 2);
            return $entry;
        });

        $balance = $balanceForward + $chargesTotal - $discountsTotal - $paymentsTotal;

        return response()->json([
            'success' => true,
            'data' => [
                'student' => $student,
                'academic_year' => $academicYear,
                'grade_level' => $gradeLevel,
                'entries' => $entries,
                'totals' => [
                    'charges' => round($chargesTotal, 2),
                    'discounts' => round($discountsTotal, 2),
                    'payments' => round($paymentsTotal, 2),
                    'balance_forward' => round($balanceForward, 2),
                    'balance' => round($balance, 2),
                ],
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

        $additionalFees = StudentAdditionalFee::where('institution_id', $institutionId)
            ->where('student_id', $studentId)
            ->where('academic_year', $academicYear)
            ->orderBy('created_at')
            ->get();

        $payments = StudentPayment::with('schoolFee')
            ->where('institution_id', $institutionId)
            ->where('student_id', $studentId)
            ->where('academic_year', $academicYear)
            ->orderBy('payment_date')
            ->orderBy('created_at')
            ->get();

        $feeAmountMap = $feeDefaults->keyBy('school_fee_id')->map(function ($default) {
            return (float) $default->amount;
        });

        $standardCharges = (float) $feeDefaults->sum('amount');
        $chargesTotal = $standardCharges + (float) $additionalFees->sum('amount');
        $discountsWithAmount = $this->applyDiscounts($discounts, $feeAmountMap, $standardCharges);
        $gradeLevelDiscountsWithAmount = $this->applyDiscounts($gradeLevelDiscounts, $feeAmountMap, $standardCharges);
        $discountsTotal = (float) $discountsWithAmount->sum('amount') + (float) $gradeLevelDiscountsWithAmount->sum('amount');
        $paymentsTotal = (float) $payments->sum('amount');
        $balanceForward = $this->calculateBalanceForward(
            $studentSections,
            $academicYear,
            $institutionId,
            $studentId
        );

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

        $allFees = $feeDefaults->map(function ($default) {
            return [
                'fee_id' => $default->school_fee_id,
                'fee_name' => $default->schoolFee?->name ?? 'School Fee',
                'amount' => (float) $default->amount,
                'is_additional' => false,
            ];
        })->merge($additionalFees->map(function ($af) {
            return [
                'fee_id' => $af->id,
                'fee_name' => $af->name,
                'amount' => (float) $af->amount,
                'is_additional' => true,
            ];
        }));

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
                        'fee_name' => $payment->schoolFee?->name,
                    ];
                }),
                'totals' => [
                    'charges' => round($chargesTotal, 2),
                    'discounts' => round($discountsTotal, 2),
                    'payments' => round($paymentsTotal, 2),
                    'balance_forward' => round($balanceForward, 2),
                    'balance' => round($balance, 2),
                ],
                'available_academic_years' => $availableAcademicYears,
            ]
        ]);
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
                    ->get();

                $discountsTotal = (float) $this->applyDiscounts($discounts, $feeAmountMap, $charges)
                    ->sum('amount');
            }

            $payments = (float) StudentPayment::where('institution_id', $institutionId)
                ->where('student_id', $studentId)
                ->where('academic_year', $year)
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

    private function applyDiscounts($discounts, $feeAmountMap, float $chargesTotal)
    {
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
        });
    }
}
