<?php

namespace App\Http\Controllers;

use App\Auth\StudentPortalUser;
use App\Models\GradeLevelDiscount;
use App\Models\GradeLevelDiscountStudentVoid;
use App\Models\SchoolFeeDefault;
use App\Models\Student;
use App\Models\StudentAdditionalFee;
use App\Models\StudentDiscount;
use App\Models\StudentPayment;
use App\Models\StudentSection;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class FinanceDashboardController extends Controller
{
    /**
     * One row per enrolled student for an academic year: what they owe for the year and
     * what is left of it, grouped by grade level for the Finance dashboard.
     *
     * The figures are built the same way `StudentFinanceController::ledger()` builds its
     * totals, so a row here and the student's own ledger agree. The one thing this does
     * not do is materialize new late fees — booking a surcharge is a write, and a listing
     * of the whole school must not perform hundreds of them. Surcharges already charged
     * are counted; one that only becomes due when the ledger is next opened is not.
     */
    public function students(Request $request): JsonResponse
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
            'grade_level' => 'nullable|string|max:255',
            'section_id' => 'nullable|string|max:36',
        ]);

        $academicYear = $validated['academic_year'];
        $gradeFilter = $validated['grade_level'] ?? null;
        $sectionFilter = $validated['section_id'] ?? null;

        // Every enrolment of the institution's students, all years at once: the requested
        // year decides who is on the list, the earlier ones what each brought forward.
        $enrolments = StudentSection::with('classSection')
            ->whereHas('classSection', function ($query) use ($institutionId) {
                $query->where('institution_id', $institutionId);
            })
            ->orderByDesc('created_at')
            ->get();

        // student id => year => placement. First writer wins, and the rows arrive newest
        // first, so an active enrolment beats a stale one and otherwise the latest does —
        // the same choice the ledger makes for the year it shows.
        $placements = [];
        foreach ($enrolments as $enrolment) {
            $year = $enrolment->academic_year;
            $section = $enrolment->classSection;
            if (!$year || !$section) {
                continue;
            }

            $existing = $placements[$enrolment->student_id][$year] ?? null;
            if ($existing && ($existing['is_active'] || !$enrolment->is_active)) {
                continue;
            }

            $placements[$enrolment->student_id][$year] = [
                'is_active' => (bool) $enrolment->is_active,
                'grade_level' => $section->grade_level,
                'section_id' => $section->id,
                'section' => $section->title,
            ];
        }

        // The roster, before the grade/section filters narrow it: the filter dropdowns are
        // built from the whole year, or picking one would empty the list of the others.
        $roster = [];
        $sectionOptions = [];
        foreach ($placements as $studentId => $years) {
            $placement = $years[$academicYear] ?? null;
            if (!$placement) {
                continue;
            }

            $roster[$studentId] = $placement;
            $sectionOptions[$placement['section_id']] = [
                'id' => $placement['section_id'],
                'title' => $placement['section'],
                'grade_level' => $placement['grade_level'],
            ];
        }

        $gradeLevels = collect($roster)->pluck('grade_level')->filter()->unique()
            ->sortBy(fn ($grade) => $this->gradeLevelOrder($grade))
            ->values()
            ->all();

        $sections = collect($sectionOptions)
            ->sortBy(fn ($section) => [$this->gradeLevelOrder($section['grade_level']), $section['title']])
            ->values()
            ->all();

        if ($gradeFilter) {
            $roster = array_filter($roster, fn ($placement) => $placement['grade_level'] === $gradeFilter);
        }
        if ($sectionFilter) {
            $roster = array_filter($roster, fn ($placement) => $placement['section_id'] === $sectionFilter);
        }

        $studentIds = array_keys($roster);
        if (empty($studentIds)) {
            return response()->json([
                'success' => true,
                'data' => [
                    'academic_year' => $academicYear,
                    'grade_levels' => $gradeLevels,
                    'sections' => $sections,
                    'students' => [],
                ]
            ]);
        }

        // Only the years these students were actually enrolled in matter, and only those
        // before the one on screen contribute a balance forward.
        $relevantYears = collect($studentIds)
            ->flatMap(fn ($studentId) => array_keys($placements[$studentId] ?? []))
            ->push($academicYear)
            ->unique()
            ->values();

        $defaults = SchoolFeeDefault::where('institution_id', $institutionId)
            ->whereIn('academic_year', $relevantYears)
            ->get();

        // year => grade => fee id => amount charged per student.
        $defaultMap = [];
        foreach ($defaults as $default) {
            $defaultMap[$default->academic_year][$default->grade_level][$default->school_fee_id] = (float) $default->amount;
        }

        $discountsByStudentYear = [];
        $studentDiscounts = StudentDiscount::where('institution_id', $institutionId)
            ->whereIn('student_id', $studentIds)
            ->whereIn('academic_year', $relevantYears)
            ->whereNull('voided_at')
            ->get();
        foreach ($studentDiscounts as $discount) {
            $discountsByStudentYear[$discount->student_id][$discount->academic_year][] = $discount;
        }

        // Grade-level discounts apply to the whole grade for the year on screen, less the
        // ones voided for an individual student.
        $gradeDiscounts = GradeLevelDiscount::where('institution_id', $institutionId)
            ->where('academic_year', $academicYear)
            ->whereIn('grade_level', collect($roster)->pluck('grade_level')->unique())
            ->get();

        $gradeDiscountVoids = $gradeDiscounts->isEmpty()
            ? collect()
            : GradeLevelDiscountStudentVoid::whereIn('student_id', $studentIds)
                ->whereIn('grade_level_discount_id', $gradeDiscounts->pluck('id'))
                ->get()
                ->groupBy('student_id')
                ->map(fn ($voids) => $voids->pluck('grade_level_discount_id')->all());

        $gradeDiscountsByGrade = $gradeDiscounts->groupBy('grade_level');

        // Ad-hoc charges, cash-basis fees and already-charged late fees are all owed on top
        // of the grade's standard fees. Waived charges are soft-deleted and drop out here.
        $additionalFeeTotals = StudentAdditionalFee::where('institution_id', $institutionId)
            ->whereIn('student_id', $studentIds)
            ->whereIn('academic_year', $relevantYears)
            ->groupBy('student_id', 'academic_year')
            ->selectRaw('student_id, academic_year, SUM(amount) as total, COUNT(*) as fee_count')
            ->get();

        $additionalByStudentYear = [];
        $additionalCountByStudent = [];
        foreach ($additionalFeeTotals as $row) {
            $additionalByStudentYear[$row->student_id][$row->academic_year] = (float) $row->total;
            if ($row->academic_year === $academicYear) {
                $additionalCountByStudent[$row->student_id] = (int) $row->fee_count;
            }
        }

        $paymentTotals = StudentPayment::where('institution_id', $institutionId)
            ->whereIn('student_id', $studentIds)
            ->whereIn('academic_year', $relevantYears)
            ->whereNull('voided_at')
            ->groupBy('student_id', 'academic_year')
            ->selectRaw('student_id, academic_year, SUM(amount) as total')
            ->get();

        $paymentsByStudentYear = [];
        foreach ($paymentTotals as $row) {
            $paymentsByStudentYear[$row->student_id][$row->academic_year] = (float) $row->total;
        }

        $students = Student::whereIn('id', $studentIds)
            ->get(['id', 'lrn', 'first_name', 'middle_name', 'last_name', 'ext_name'])
            ->keyBy('id');

        $targetStart = $this->extractStartYear($academicYear);

        $rows = [];
        foreach ($roster as $studentId => $placement) {
            $student = $students->get($studentId);
            if (!$student) {
                continue;
            }

            $gradeLevel = $placement['grade_level'];
            $feeAmounts = $defaultMap[$academicYear][$gradeLevel] ?? [];
            $standardCharges = array_sum($feeAmounts);
            $additionalCharges = $additionalByStudentYear[$studentId][$academicYear] ?? 0.0;

            $voidedForStudent = $gradeDiscountVoids->get($studentId, []);
            $applicableGradeDiscounts = ($gradeDiscountsByGrade->get($gradeLevel) ?? collect())
                ->reject(fn ($discount) => in_array($discount->id, $voidedForStudent, true));

            $discountTotal = $this->discountTotal(
                $discountsByStudentYear[$studentId][$academicYear] ?? [],
                $feeAmounts,
                $standardCharges
            ) + $this->discountTotal($applicableGradeDiscounts, $feeAmounts, $standardCharges);

            $balanceForward = $this->balanceForwardFor(
                $studentId,
                $placements[$studentId] ?? [],
                $academicYear,
                $targetStart,
                $defaultMap,
                $discountsByStudentYear,
                $additionalByStudentYear,
                $paymentsByStudentYear
            );

            $charges = round($standardCharges + $additionalCharges, 2);

            // Total payable, disassembled. Every discount is priced against the grade's
            // standard fees — a discount can name a school fee but never an additional one —
            // so the whole discount comes off the school-fee side and the student-fee side is
            // its charges as billed. A school a discount overshoots reads negative here rather
            // than being clamped: the parts have to keep adding up to the total, and a
            // write-off larger than the fee it is against is worth seeing.
            $schoolFeesPayable = round($standardCharges - $discountTotal, 2);
            $studentFeesPayable = round($additionalCharges, 2);
            $totalPayable = round($balanceForward + $schoolFeesPayable + $studentFeesPayable, 2);
            $paid = round($paymentsByStudentYear[$studentId][$academicYear] ?? 0.0, 2);

            $rows[] = [
                'id' => $student->id,
                'lrn' => $student->lrn,
                'first_name' => $student->first_name,
                'middle_name' => $student->middle_name,
                'last_name' => $student->last_name,
                'ext_name' => $student->ext_name,
                'display_name' => $this->formatStudentName($student),
                'grade_level' => $gradeLevel,
                'section_id' => $placement['section_id'],
                'section' => $placement['section'],
                // What was charged, split into what the grade bills everyone and what this
                // student was charged on their own. Late fees count as student fees: they are
                // booked as the same kind of row and are listed with them, so the two always
                // add back up to `charges`.
                'school_fees' => round($standardCharges, 2),
                'student_fees' => round($additionalCharges, 2),
                'charges' => $charges,
                'discounts' => round($discountTotal, 2),
                // …and the same split of what is owed. These three are exactly `total_payable`,
                // so a row can be read across and seen to add up.
                'school_fees_payable' => $schoolFeesPayable,
                'student_fees_payable' => $studentFeesPayable,
                'balance_forward' => $balanceForward,
                'total_payable' => $totalPayable,
                'total_paid' => $paid,
                'remaining_balance' => round($totalPayable - $paid, 2),
                // Lets the row show whether there is anything to open before it is opened.
                'other_fee_count' => $additionalCountByStudent[$studentId] ?? 0,
            ];
        }

        // Grade level first, then alphabetical by name within the grade.
        usort($rows, function ($a, $b) {
            return [
                $this->gradeLevelOrder($a['grade_level']),
                mb_strtoupper((string) $a['last_name']),
                mb_strtoupper((string) $a['first_name']),
                mb_strtoupper((string) $a['middle_name']),
            ] <=> [
                $this->gradeLevelOrder($b['grade_level']),
                mb_strtoupper((string) $b['last_name']),
                mb_strtoupper((string) $b['first_name']),
                mb_strtoupper((string) $b['middle_name']),
            ];
        });

        return response()->json([
            'success' => true,
            'data' => [
                'academic_year' => $academicYear,
                'grade_levels' => $gradeLevels,
                'sections' => $sections,
                'students' => $rows,
            ]
        ]);
    }

    /**
     * What a student carried into the year on screen: charges less discounts and payments
     * for every earlier year they were enrolled in.
     */
    private function balanceForwardFor(
        string $studentId,
        array $studentPlacements,
        string $academicYear,
        ?int $targetStart,
        array $defaultMap,
        array $discountsByStudentYear,
        array $additionalByStudentYear,
        array $paymentsByStudentYear
    ): float {
        $balance = 0.0;

        foreach ($studentPlacements as $year => $placement) {
            if ($year === $academicYear) {
                continue;
            }

            if ($targetStart !== null) {
                $yearStart = $this->extractStartYear($year);
                if ($yearStart === null || $yearStart >= $targetStart) {
                    continue;
                }
            } elseif ($year >= $academicYear) {
                continue;
            }

            $feeAmounts = $defaultMap[$year][$placement['grade_level']] ?? [];
            $charges = array_sum($feeAmounts) + ($additionalByStudentYear[$studentId][$year] ?? 0.0);
            $discountTotal = $this->discountTotal(
                $discountsByStudentYear[$studentId][$year] ?? [],
                $feeAmounts,
                array_sum($feeAmounts)
            );
            $payments = $paymentsByStudentYear[$studentId][$year] ?? 0.0;

            $balance += ($charges - $discountTotal - $payments);
        }

        return round($balance, 2);
    }

    /** "LAST NAME, FIRST NAME M." — the form finance lists students in. */
    private function formatStudentName(Student $student): string
    {
        $middleInitial = $student->middle_name
            ? mb_strtoupper(mb_substr(trim($student->middle_name), 0, 1)) . '.'
            : null;

        $given = trim(implode(' ', array_filter([
            $student->first_name,
            $middleInitial,
            $student->ext_name,
        ])));

        $last = trim((string) $student->last_name);
        if ($last === '') {
            return $given;
        }

        return $given === '' ? $last : $last . ', ' . $given;
    }

    /**
     * Sort key putting grade levels in school order (Kinder, then Grade 1–12) rather than
     * the alphabetical order that files "Grade 10" between "Grade 1" and "Grade 2".
     */
    private function gradeLevelOrder(?string $gradeLevel): array
    {
        $label = trim((string) $gradeLevel);
        if ($label === '') {
            return [3, 0, ''];
        }

        if (preg_match('/^kinder\s*(\d+)?$/i', $label, $matches)) {
            return [0, (int) ($matches[1] ?? 0), $label];
        }

        if (preg_match('/^grade\s*(\d+)/i', $label, $matches)) {
            return [1, (int) $matches[1], $label];
        }

        return [2, 0, mb_strtoupper($label)];
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
            // Waiving a student fee soft-deletes it while the payments against it
            // stay on the books, so the name has to survive the delete to label them.
            'additionalFee' => fn ($query) => $query->withTrashed()->select('id', 'name'),
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
        $byFee = [];      // school fee name => ['entries' => n, 'amount' => x]
        $byStudentFee = []; // student fee name => ['entries' => n, 'amount' => x]
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
            // An entry settles either a school fee or a student fee, never both, so
            // it belongs to exactly one of the two fee breakdowns.
            $studentFeeName = $payment->student_additional_fee_id
                ? ($payment->additionalFee?->name ?: 'Unnamed Student Fee')
                : null;
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

            if ($studentFeeName !== null) {
                $byStudentFee[$studentFeeName] ??= ['entries' => 0, 'amount' => 0.0];
                $byStudentFee[$studentFeeName]['entries']++;
                $byStudentFee[$studentFeeName]['amount'] += $amount;
            } else {
                $byFee[$feeName] ??= ['entries' => 0, 'amount' => 0.0];
                $byFee[$feeName]['entries']++;
                $byFee[$feeName]['amount'] += $amount;
            }

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
                'by_student_fee' => $formatBreakdown($byStudentFee, false),
                'by_cashier' => $formatBreakdown($byCashier),
                'by_day' => $dailyRows,
                'transactions' => $transactionRows,
            ],
        ]);
    }

    /**
     * Total value of a set of discounts, priced exactly as the ledger prices them
     * (see StudentFinanceController::applyDiscounts): a discount tied to a fee is capped
     * at that fee's charge, one tied to nothing is priced against the grade's standard
     * charges, and a fixed amount still counts when there is no charge to cap it against.
     *
     * @param  iterable  $discounts  StudentDiscount or GradeLevelDiscount rows
     * @param  array<string, float>  $feeAmounts  fee id => amount charged for the year
     */
    private function discountTotal($discounts, array $feeAmounts, float $chargesTotal): float
    {
        $total = 0.0;
        foreach ($discounts as $discount) {
            $baseAmount = $discount->school_fee_id
                ? (float) ($feeAmounts[$discount->school_fee_id] ?? 0.0)
                : $chargesTotal;

            $amount = $discount->discount_type === 'percentage'
                ? $baseAmount * ((float) $discount->value / 100)
                : (float) $discount->value;

            if ($baseAmount > 0) {
                $amount = min($amount, $baseAmount);
            }

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
