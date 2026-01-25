<?php

namespace App\Http\Controllers;

use App\Models\Student;
use App\Models\StudentSection;
use App\Models\SchoolFeeDefault;
use App\Models\StudentPayment;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class StudentFinanceController extends Controller
{
    /**
     * Get a student's ledger for an academic year.
     */
    public function ledger(Request $request, string $studentId): JsonResponse
    {
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

        $chargesTotal = (float) $feeDefaults->sum('amount');
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

        $entries = $entries->merge($chargeEntries)->merge($paymentEntries);

        $entries = $entries->sortBy(function ($entry) {
            $typeOrder = [
                'balance_forward' => 0,
                'charge' => 1,
                'payment' => 2,
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

        $balance = $balanceForward + $chargesTotal - $paymentsTotal;

        return response()->json([
            'success' => true,
            'data' => [
                'student' => $student,
                'academic_year' => $academicYear,
                'grade_level' => $gradeLevel,
                'entries' => $entries,
                'totals' => [
                    'charges' => round($chargesTotal, 2),
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

        $chargesTotal = (float) $feeDefaults->sum('amount');
        $paymentsTotal = (float) $payments->sum('amount');
        $balanceForward = $this->calculateBalanceForward(
            $studentSections,
            $academicYear,
            $institutionId,
            $studentId
        );

        $balance = $balanceForward + $chargesTotal - $paymentsTotal;

        return response()->json([
            'success' => true,
            'data' => [
                'student' => $student,
                'academic_year' => $academicYear,
                'grade_level' => $gradeLevel,
                'fees' => $feeDefaults->map(function ($default) {
                    return [
                        'fee_id' => $default->school_fee_id,
                        'fee_name' => $default->schoolFee?->name ?? 'School Fee',
                        'amount' => (float) $default->amount,
                    ];
                }),
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

        $institutionId = $user->getDefaultInstitutionId();
        if (!$institutionId) {
            $firstUserInstitution = $user->userInstitutions()->first();
            if ($firstUserInstitution) {
                $institutionId = $firstUserInstitution->institution_id;
            }
        }

        return $institutionId;
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
            if ($gradeLevel) {
                $charges = (float) SchoolFeeDefault::where('institution_id', $institutionId)
                    ->where('grade_level', $gradeLevel)
                    ->where('academic_year', $year)
                    ->sum('amount');
            }

            $payments = (float) StudentPayment::where('institution_id', $institutionId)
                ->where('student_id', $studentId)
                ->where('academic_year', $year)
                ->sum('amount');

            $balanceForward += ($charges - $payments);
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
}
