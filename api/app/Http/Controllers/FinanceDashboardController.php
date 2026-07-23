<?php

namespace App\Http\Controllers;

use App\Auth\StudentPortalUser;
use App\Models\GradeLevelDiscount;
use App\Models\SchoolFee;
use App\Models\SchoolFeeDefault;
use App\Models\StudentAdditionalFee;
use App\Models\StudentDiscount;
use App\Models\StudentPayment;
use App\Models\StudentSection;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class FinanceDashboardController extends Controller
{
    /**
     * Get finance dashboard summary for an academic year.
     */
    public function summary(Request $request): JsonResponse
    {
        if ($this->isStudentUser($request)) {
            return response()->json([
                'success' => false,
                'message' => 'Students are not allowed to access finance dashboard'
            ], 403);
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (!$institutionId) {
            return response()->json([
                'success' => false,
                'message' => 'User does not have any institution assigned'
            ], 400);
        }

        $validated = $request->validate([
            'academic_year' => 'required|string|max:255',
        ]);

        $academicYear = $validated['academic_year'];

        $fees = SchoolFee::where('institution_id', $institutionId)
            ->orderBy('name')
            ->get(['id', 'name']);

        $studentGradeRows = DB::table('student_sections')
            ->join('class_sections', 'student_sections.section_id', '=', 'class_sections.id')
            ->where('class_sections.institution_id', $institutionId)
            ->where('student_sections.academic_year', $academicYear)
            ->select('student_sections.student_id', 'class_sections.grade_level')
            ->distinct()
            ->get();

        if ($studentGradeRows->isEmpty()) {
            return response()->json([
                'success' => true,
                'data' => [
                    'academic_year' => $academicYear,
                    'fees' => $fees,
                    'grades' => [],
                ]
            ]);
        }

        $studentGradeMap = [];
        $gradeStudentMap = [];
        foreach ($studentGradeRows as $row) {
            if (!isset($studentGradeMap[$row->student_id])) {
                $studentGradeMap[$row->student_id] = $row->grade_level;
            }
            $gradeStudentMap[$row->grade_level][] = $row->student_id;
        }

        foreach ($gradeStudentMap as $grade => $students) {
            $gradeStudentMap[$grade] = array_values(array_unique($students));
        }

        $studentIds = collect(array_keys($studentGradeMap));

        $studentSections = StudentSection::with('classSection')
            ->whereIn('student_id', $studentIds)
            ->whereHas('classSection', function ($query) use ($institutionId) {
                $query->where('institution_id', $institutionId);
            })
            ->get();

        $relevantYears = $studentSections->pluck('academic_year')->filter()->unique()->values();
        if (!$relevantYears->contains($academicYear)) {
            $relevantYears->push($academicYear);
        }

        $defaults = SchoolFeeDefault::where('institution_id', $institutionId)
            ->whereIn('academic_year', $relevantYears)
            ->get();

        $defaultMap = [];
        $chargesPerStudent = [];
        foreach ($defaults as $default) {
            $defaultMap[$default->academic_year][$default->grade_level][$default->school_fee_id] = (float) $default->amount;
        }

        foreach ($defaultMap as $year => $gradeDefaults) {
            foreach ($gradeDefaults as $grade => $feeDefaults) {
                $chargesPerStudent[$year][$grade] = array_sum($feeDefaults);
            }
        }

        $studentYearGrade = [];
        foreach ($studentSections as $section) {
            $year = $section->academic_year;
            $studentId = $section->student_id;
            if (!$year || isset($studentYearGrade[$studentId][$year])) {
                continue;
            }
            $studentYearGrade[$studentId][$year] = $section->classSection?->grade_level;
        }

        $discounts = StudentDiscount::where('institution_id', $institutionId)
            ->whereIn('student_id', $studentIds)
            ->whereIn('academic_year', $relevantYears)
            ->get();

        $discountsByStudentYear = [];
        foreach ($discounts as $discount) {
            $discountsByStudentYear[$discount->student_id][$discount->academic_year][] = $discount;
        }

        $payments = StudentPayment::where('institution_id', $institutionId)
            ->whereIn('student_id', $studentIds)
            ->whereIn('academic_year', $relevantYears)
            ->get();

        $paymentsByStudentYear = [];
        $paymentsByGradeFee = [];
        $paymentsTotalByGrade = [];
        $paymentsUnassignedByGrade = [];
        foreach ($payments as $payment) {
            $studentId = $payment->student_id;
            $year = $payment->academic_year;
            $amount = (float) $payment->amount;
            $paymentsByStudentYear[$studentId][$year] = ($paymentsByStudentYear[$studentId][$year] ?? 0) + $amount;

            if ($year === $academicYear) {
                $gradeLevel = $studentGradeMap[$studentId] ?? null;
                if ($gradeLevel) {
                    $paymentsTotalByGrade[$gradeLevel] = ($paymentsTotalByGrade[$gradeLevel] ?? 0) + $amount;
                    if ($payment->school_fee_id) {
                        $paymentsByGradeFee[$gradeLevel][$payment->school_fee_id] =
                            ($paymentsByGradeFee[$gradeLevel][$payment->school_fee_id] ?? 0) + $amount;
                    } else {
                        $paymentsUnassignedByGrade[$gradeLevel] =
                            ($paymentsUnassignedByGrade[$gradeLevel] ?? 0) + $amount;
                    }
                }
            }
        }

        $studentBalanceForward = [];
        $targetStart = $this->extractStartYear($academicYear);
        foreach ($studentIds as $studentId) {
            $balance = 0.0;
            $years = array_keys($studentYearGrade[$studentId] ?? []);
            foreach ($years as $year) {
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

                $gradeLevel = $studentYearGrade[$studentId][$year] ?? null;
                if (!$gradeLevel) {
                    continue;
                }

                $feeDefaults = $defaultMap[$year][$gradeLevel] ?? [];
                $charges = $chargesPerStudent[$year][$gradeLevel] ?? 0.0;
                $discountList = $discountsByStudentYear[$studentId][$year] ?? [];
                $discountTotal = $this->calculateDiscountTotal($discountList, $feeDefaults, $charges);
                $paymentsTotal = $paymentsByStudentYear[$studentId][$year] ?? 0.0;

                $balance += ($charges - $discountTotal - $paymentsTotal);
            }

            $studentBalanceForward[$studentId] = round($balance, 2);
        }

        $grades = [];
        $gradeLevels = collect(array_keys($gradeStudentMap))->sort()->values()->all();
        foreach ($gradeLevels as $gradeLevel) {
            $students = $gradeStudentMap[$gradeLevel] ?? [];
            $studentCount = count($students);
            $feeDefaults = $defaultMap[$academicYear][$gradeLevel] ?? [];
            $byFee = [];
            $chargesTotal = 0.0;
            foreach ($fees as $fee) {
                $feeAmount = $feeDefaults[$fee->id] ?? 0.0;
                $payable = $feeAmount * $studentCount;
                $byFee[$fee->id] = round($payable, 2);
                $chargesTotal += $payable;
            }

            $chargesPerStudentCurrent = $chargesPerStudent[$academicYear][$gradeLevel] ?? 0.0;
            $discountTotal = 0.0;
            $balanceForwardTotal = 0.0;
            foreach ($students as $studentId) {
                $discountList = $discountsByStudentYear[$studentId][$academicYear] ?? [];
                $discountTotal += $this->calculateDiscountTotal($discountList, $feeDefaults, $chargesPerStudentCurrent);
                $balanceForwardTotal += $studentBalanceForward[$studentId] ?? 0.0;
            }

            $payableTotal = $chargesTotal - $discountTotal + $balanceForwardTotal;

            $paymentsByFee = [];
            foreach ($fees as $fee) {
                $paymentsByFee[$fee->id] = round($paymentsByGradeFee[$gradeLevel][$fee->id] ?? 0.0, 2);
            }

            $grades[] = [
                'grade_level' => $gradeLevel,
                'student_count' => $studentCount,
                'payable' => [
                    'total' => round($payableTotal, 2),
                    'by_fee' => $byFee,
                    'balance_forward' => round($balanceForwardTotal, 2),
                    'discounts' => round($discountTotal, 2),
                ],
                'payments' => [
                    'total' => round($paymentsTotalByGrade[$gradeLevel] ?? 0.0, 2),
                    'by_fee' => $paymentsByFee,
                    'unassigned' => round($paymentsUnassignedByGrade[$gradeLevel] ?? 0.0, 2),
                ],
            ];
        }

        return response()->json([
            'success' => true,
            'data' => [
                'academic_year' => $academicYear,
                'fees' => $fees,
                'grades' => $grades,
            ]
        ]);
    }

    /**
     * Monthly/quarterly payment collection breakdown for the school year (June–March).
     */
    public function collections(Request $request): JsonResponse
    {
        if ($this->isStudentUser($request)) {
            return response()->json(['success' => false, 'message' => 'Forbidden'], 403);
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return response()->json(['success' => false, 'message' => 'No institution assigned'], 400);
        }

        $validated = $request->validate([
            'academic_year' => 'required|string|max:255',
        ]);

        $academicYear = $validated['academic_year'];
        $startYear = $this->extractStartYear($academicYear);
        if (! $startYear) {
            return response()->json(['success' => false, 'message' => 'Invalid academic year format'], 422);
        }

        $schoolMonths = [
            ['month' => 6, 'year' => $startYear, 'label' => 'June'],
            ['month' => 7, 'year' => $startYear, 'label' => 'July'],
            ['month' => 8, 'year' => $startYear, 'label' => 'August'],
            ['month' => 9, 'year' => $startYear, 'label' => 'September'],
            ['month' => 10, 'year' => $startYear, 'label' => 'October'],
            ['month' => 11, 'year' => $startYear, 'label' => 'November'],
            ['month' => 12, 'year' => $startYear, 'label' => 'December'],
            ['month' => 1, 'year' => $startYear + 1, 'label' => 'January'],
            ['month' => 2, 'year' => $startYear + 1, 'label' => 'February'],
            ['month' => 3, 'year' => $startYear + 1, 'label' => 'March'],
        ];

        $payments = StudentPayment::where('institution_id', $institutionId)
            ->where('academic_year', $academicYear)
            ->get();

        $monthlyTotals = [];
        foreach ($schoolMonths as $sm) {
            $monthlyTotals[$sm['month'] . '-' . $sm['year']] = [
                'month' => $sm['month'],
                'year' => $sm['year'],
                'label' => $sm['label'] . ' ' . $sm['year'],
                'total' => 0.0,
                'count' => 0,
                'by_method' => [],
            ];
        }

        foreach ($payments as $payment) {
            $paymentDate = $payment->payment_date;
            if (! $paymentDate) {
                continue;
            }
            $m = (int) $paymentDate->format('n');
            $y = (int) $paymentDate->format('Y');
            $key = $m . '-' . $y;

            if (isset($monthlyTotals[$key])) {
                $amount = (float) $payment->amount;
                $monthlyTotals[$key]['total'] = round($monthlyTotals[$key]['total'] + $amount, 2);
                $monthlyTotals[$key]['count']++;
                $method = $payment->payment_method ?: 'Unspecified';
                $monthlyTotals[$key]['by_method'][$method] =
                    round(($monthlyTotals[$key]['by_method'][$method] ?? 0) + $amount, 2);
            }
        }

        $monthly = array_values($monthlyTotals);
        $grandTotal = array_sum(array_column($monthly, 'total'));

        $quarters = [
            ['label' => 'Q1 (Jun–Aug)', 'months' => [0, 1, 2]],
            ['label' => 'Q2 (Sep–Nov)', 'months' => [3, 4, 5]],
            ['label' => 'Q3 (Dec–Feb)', 'months' => [6, 7, 8]],
            ['label' => 'Q4 (Mar)', 'months' => [9]],
        ];

        $quarterly = [];
        foreach ($quarters as $q) {
            $total = 0.0;
            $count = 0;
            $byMethod = [];
            foreach ($q['months'] as $idx) {
                $total += $monthly[$idx]['total'];
                $count += $monthly[$idx]['count'];
                foreach ($monthly[$idx]['by_method'] as $method => $amt) {
                    $byMethod[$method] = round(($byMethod[$method] ?? 0) + $amt, 2);
                }
            }
            $quarterly[] = [
                'label' => $q['label'],
                'total' => round($total, 2),
                'count' => $count,
                'by_method' => $byMethod,
            ];
        }

        return response()->json([
            'success' => true,
            'data' => [
                'academic_year' => $academicYear,
                'grand_total' => round($grandTotal, 2),
                'monthly' => $monthly,
                'quarterly' => $quarterly,
            ],
        ]);
    }

    /**
     * Detailed, printable collection report for an arbitrary date range (defaults to a single day).
     *
     * Reports transaction / entry counts, amount collected, and breakdowns by payment method,
     * fee type, cashier, and day. Voided entries are excluded from collected totals but reported
     * separately so the figures reconcile.
     */
    public function collectionsReport(Request $request): JsonResponse
    {
        if ($this->isStudentUser($request)) {
            return response()->json(['success' => false, 'message' => 'Forbidden'], 403);
        }

        $institutionId = $this->resolveInstitutionId($request);
        if (! $institutionId) {
            return response()->json(['success' => false, 'message' => 'No institution assigned'], 400);
        }

        $validated = $request->validate([
            'start_date' => 'required|date',
            'end_date' => 'required|date|after_or_equal:start_date',
        ]);

        $startDate = \Illuminate\Support\Carbon::parse($validated['start_date'])->startOfDay();
        $endDate = \Illuminate\Support\Carbon::parse($validated['end_date'])->startOfDay();

        $institution = \App\Models\Institution::find($institutionId);

        $payments = StudentPayment::with([
            'student:id,lrn,first_name,middle_name,last_name,ext_name',
            'schoolFee:id,name',
            'receivedBy:id,first_name,last_name',
            'paymentTransaction:id,or_number,receipt_number,payment_method',
        ])
            ->where('institution_id', $institutionId)
            ->whereBetween('payment_date', [$startDate->toDateString(), $endDate->toDateString()])
            ->orderBy('payment_date')
            ->orderBy('created_at')
            ->get();

        $totalCollected = 0.0;
        $entryCount = 0;
        $voidedCount = 0;
        $voidedAmount = 0.0;

        $byMethod = [];   // method => ['entries' => n, 'amount' => x, 'txns' => Set]
        $byFee = [];      // fee name => ['entries' => n, 'amount' => x]
        $byDay = [];      // Y-m-d => ['entries' => n, 'amount' => x, 'txns' => Set]
        $byCashier = [];  // name => ['entries' => n, 'amount' => x, 'txns' => Set]

        $txnKeys = [];        // unique transaction keys (non-voided)
        $studentKeys = [];    // unique paying students (non-voided)
        $transactions = [];   // grouped transaction rows for the detailed listing

        foreach ($payments as $payment) {
            $isVoided = $payment->voided_at !== null;
            $amount = (float) $payment->amount;

            if ($isVoided) {
                $voidedCount++;
                $voidedAmount += $amount;

                continue;
            }

            $dateKey = $payment->payment_date ? $payment->payment_date->format('Y-m-d') : 'unknown';
            $txnId = $payment->payment_transaction_id;
            $txnKey = $txnId ?: 'entry:' . $payment->id;
            $method = $payment->payment_method
                ?: ($payment->paymentTransaction?->payment_method ?: 'Unspecified');
            $feeName = $payment->schoolFee?->name ?: 'General / Other';
            $cashier = $payment->receivedBy
                ? trim($payment->receivedBy->first_name . ' ' . $payment->receivedBy->last_name)
                : 'Unknown';
            $cashier = $cashier !== '' ? $cashier : 'Unknown';

            $totalCollected += $amount;
            $entryCount++;
            $txnKeys[$txnKey] = true;
            if ($payment->student_id) {
                $studentKeys[$payment->student_id] = true;
            }

            $byMethod[$method] ??= ['entries' => 0, 'amount' => 0.0, 'txns' => []];
            $byMethod[$method]['entries']++;
            $byMethod[$method]['amount'] += $amount;
            $byMethod[$method]['txns'][$txnKey] = true;

            $byFee[$feeName] ??= ['entries' => 0, 'amount' => 0.0];
            $byFee[$feeName]['entries']++;
            $byFee[$feeName]['amount'] += $amount;

            $byDay[$dateKey] ??= ['entries' => 0, 'amount' => 0.0, 'txns' => []];
            $byDay[$dateKey]['entries']++;
            $byDay[$dateKey]['amount'] += $amount;
            $byDay[$dateKey]['txns'][$txnKey] = true;

            $byCashier[$cashier] ??= ['entries' => 0, 'amount' => 0.0, 'txns' => []];
            $byCashier[$cashier]['entries']++;
            $byCashier[$cashier]['amount'] += $amount;
            $byCashier[$cashier]['txns'][$txnKey] = true;

            if (! isset($transactions[$txnKey])) {
                $studentName = $payment->student
                    ? trim(implode(' ', array_filter([
                        $payment->student->last_name . ',',
                        $payment->student->first_name,
                        $payment->student->middle_name,
                        $payment->student->ext_name,
                    ])))
                    : 'Unknown';

                $transactions[$txnKey] = [
                    'date' => $dateKey,
                    'or_number' => $payment->or_number
                        ?: ($payment->paymentTransaction?->or_number ?: null),
                    'receipt_number' => $payment->receipt_number
                        ?: ($payment->paymentTransaction?->receipt_number ?: null),
                    'student' => $studentName,
                    'lrn' => $payment->student?->lrn,
                    'method' => $method,
                    'cashier' => $cashier,
                    'entries' => 0,
                    'amount' => 0.0,
                ];
            }
            $transactions[$txnKey]['entries']++;
            $transactions[$txnKey]['amount'] += $amount;
        }

        $formatBreakdown = function (array $group, bool $withTxns = true) {
            $rows = [];
            foreach ($group as $key => $data) {
                $rows[] = array_filter([
                    'label' => $key,
                    'entries' => $data['entries'],
                    'transactions' => $withTxns && isset($data['txns']) ? count($data['txns']) : null,
                    'amount' => round($data['amount'], 2),
                ], fn ($v) => $v !== null);
            }
            usort($rows, fn ($a, $b) => $b['amount'] <=> $a['amount']);

            return $rows;
        };

        $dailyRows = [];
        foreach ($byDay as $key => $data) {
            $dailyRows[] = [
                'label' => $key,
                'transactions' => count($data['txns']),
                'entries' => $data['entries'],
                'amount' => round($data['amount'], 2),
            ];
        }
        usort($dailyRows, fn ($a, $b) => strcmp($a['label'], $b['label']));

        $transactionRows = array_values($transactions);
        foreach ($transactionRows as &$row) {
            $row['amount'] = round($row['amount'], 2);
        }
        unset($row);
        usort($transactionRows, function ($a, $b) {
            return [$a['date'], $a['or_number'] ?? '', $a['receipt_number'] ?? '']
                <=> [$b['date'], $b['or_number'] ?? '', $b['receipt_number'] ?? ''];
        });

        $transactionCount = count($txnKeys);

        return response()->json([
            'success' => true,
            'data' => [
                'start_date' => $startDate->toDateString(),
                'end_date' => $endDate->toDateString(),
                'institution' => $institution ? [
                    'title' => $institution->title,
                    'abbr' => $institution->abbr,
                    'address' => $institution->address,
                ] : null,
                'summary' => [
                    'total_collected' => round($totalCollected, 2),
                    'transaction_count' => $transactionCount,
                    'entry_count' => $entryCount,
                    'student_count' => count($studentKeys),
                    'voided_count' => $voidedCount,
                    'voided_amount' => round($voidedAmount, 2),
                    'average_per_transaction' => $transactionCount > 0
                        ? round($totalCollected / $transactionCount, 2)
                        : 0.0,
                    'method_count' => count($byMethod),
                ],
                'by_method' => $formatBreakdown($byMethod),
                'by_fee' => $formatBreakdown($byFee, false),
                'by_cashier' => $formatBreakdown($byCashier),
                'by_day' => $dailyRows,
                'transactions' => $transactionRows,
            ],
        ]);
    }

    private function calculateDiscountTotal(array $discounts, array $feeDefaults, float $chargesTotal): float
    {
        $total = 0.0;
        foreach ($discounts as $discount) {
            $baseAmount = $chargesTotal;
            if ($discount->school_fee_id) {
                $baseAmount = $feeDefaults[$discount->school_fee_id] ?? 0.0;
            }

            if ($baseAmount <= 0) {
                continue;
            }

            if ($discount->discount_type === 'percentage') {
                $amount = $baseAmount * ((float) $discount->value / 100);
            } else {
                $amount = (float) $discount->value;
            }

            $amount = min($amount, $baseAmount);
            $total += $amount;
        }

        return round($total, 2);
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

    private function resolveInstitutionId(Request $request): ?string
    {
        $user = $request->user();
        if (!$user) {
            return null;
        }

        $institutionId = $user->getDefaultInstitutionId();
        if (!$institutionId) {
            $firstUserInstitution = $user->userInstitutions()->first();
            if ($firstUserInstitution) {
                $institutionId = $firstUserInstitution->institution_id;
            }
        }

        return $institutionId;
    }

    private function isStudentUser(Request $request): bool
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
}
