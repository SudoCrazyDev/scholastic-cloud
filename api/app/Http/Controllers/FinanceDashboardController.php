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
