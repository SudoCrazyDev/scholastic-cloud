<?php

namespace App\Services\Matatag;

use App\Models\ClassSection;
use App\Support\MatatagTerms;
use Illuminate\Support\Facades\DB;

/**
 * The attendance block of the progress report, derived from records the
 * platform already holds.
 *
 * **This service writes nothing.** There is no MATATAG attendance entry screen
 * and there must never be one: a school already records monthly attendance in
 * `student_attendances` and class days in `school_days`, and a second place to
 * type the same figures is a second set of figures that disagree with the
 * first. Every method here is a read.
 *
 * ## Two traps in the tables it reads
 *
 * **`student_attendances` has no unique index.** Its migration declares none,
 * and `StudentAttendanceController::bulkUpsert` dedupes by hand — so nothing
 * at the database level stops two rows for one learner-month. Summing them
 * silently would print a doubled attendance total on a DepEd form a parent is
 * handed, so duplicates are summed *and reported*: every response carries a
 * `warnings` array naming the learner and month, and the caller is expected to
 * surface it rather than swallow it.
 *
 * **`school_days` is per-department.** A department column was added later, so
 * rows exist both with and without one. The class days for a section are its
 * department's rows where they exist and the institution-wide rows otherwise,
 * mirroring how `SchoolDayController` resolves them — a senior-high calendar
 * must not be printed on a Grade 1 report card.
 *
 * ## The September deviation
 *
 * DepEd's form prints September twice, split across Terms 1 and 2, because the
 * term boundary falls mid-month. We print it once, wholly in Term 1.
 *
 * This is deliberate and documented. `student_attendances` holds one row per
 * learner per month and the schema has no daily academic register anywhere —
 * `realtime_attendance` is a name-matched biometric feed, not a register — so
 * a mid-month split could only ever be an estimate. A number a school cannot
 * reproduce or defend to a parent is worse than a boundary that is merely
 * different from the printed form. Per-term and annual totals reconcile
 * exactly because every month belongs to exactly one term.
 */
class TermAttendance
{
    /**
     * Every learner in a section, with the eleven printed rows each.
     *
     * Three queries whatever the section's size: one for class days, one for
     * attendance, one for the roster the caller passes in. A section is at
     * most ~50 learners × 11 months.
     *
     * @param  \Illuminate\Support\Collection<int, object>  $roster  from ResolvesMatatagSection
     */
    public function forSection(ClassSection $section, string $academicYear, $roster): array
    {
        $classDays = $this->classDays($section, $academicYear);
        $rows = MatatagTerms::monthRows($academicYear);

        $studentIds = $roster->pluck('id')->all();
        $warnings = [];
        $attendance = $this->attendanceFor($section, $academicYear, $studentIds, $warnings);

        $learners = [];

        foreach ($roster as $student) {
            $learners[] = [
                'student_id' => $student->id,
                'months' => $this->monthsFor($attendance[$student->id] ?? [], $rows, $classDays),
                'terms' => $this->termTotals($attendance[$student->id] ?? [], $rows, $classDays),
            ];
        }

        return [
            'academic_year' => $academicYear,
            'months' => array_map(fn ($row) => $row + [
                'label' => $this->monthLabel($row['month']),
                'class_days' => $classDays[$this->key($row['month'], $row['year'])] ?? 0,
            ], $rows),
            'learners' => $learners,
            'warnings' => $warnings,
        ];
    }

    /**
     * One learner's block, in the shape the report card prints.
     */
    public function forStudent(ClassSection $section, string $academicYear, string $studentId): array
    {
        $classDays = $this->classDays($section, $academicYear);
        $rows = MatatagTerms::monthRows($academicYear);
        $warnings = [];
        $attendance = $this->attendanceFor($section, $academicYear, [$studentId], $warnings);
        $own = $attendance[$studentId] ?? [];

        return [
            'academic_year' => $academicYear,
            'student_id' => $studentId,
            'months' => $this->monthsFor($own, $rows, $classDays),
            'terms' => $this->termTotals($own, $rows, $classDays),
            'total' => $this->total($own, $rows, $classDays),
            'warnings' => $warnings,
        ];
    }

    /**
     * The class days for each month of the year, resolved for this section's
     * department.
     *
     * @return array<string, int> "year-month" => days
     */
    public function classDays(ClassSection $section, string $academicYear): array
    {
        $rows = DB::table('school_days')
            ->where('institution_id', $section->institution_id)
            ->where('academic_year', $academicYear)
            ->when(
                $section->department_id !== null,
                // The section's own department, falling back to the rows that
                // name no department at all. Another department's calendar is
                // never a fallback.
                fn ($q) => $q->where(fn ($w) => $w
                    ->where('department_id', $section->department_id)
                    ->orWhereNull('department_id')),
                fn ($q) => $q->whereNull('department_id'),
            )
            ->orderByRaw('department_id IS NULL')   // department rows first
            ->get(['month', 'year', 'total_days', 'department_id']);

        $out = [];

        foreach ($rows as $row) {
            $key = $this->key((int) $row->month, (int) $row->year);

            // Ordered so the department's own row arrives first; the
            // institution-wide row must not overwrite it.
            if (! array_key_exists($key, $out)) {
                $out[$key] = (int) $row->total_days;
            }
        }

        return $out;
    }

    /**
     * Monthly present/absent per learner, with duplicate rows summed.
     *
     * @param  array<int, string>  $studentIds
     * @param  array<int, array<string, mixed>>  $warnings  out-param
     * @return array<string, array<string, array{present: int, absent: int}>>
     */
    private function attendanceFor(
        ClassSection $section,
        string $academicYear,
        array $studentIds,
        array &$warnings,
    ): array {
        if ($studentIds === []) {
            return [];
        }

        $rows = DB::table('student_attendances')
            ->where('class_section_id', $section->id)
            ->where('academic_year', $academicYear)
            ->whereIn('student_id', $studentIds)
            ->selectRaw('student_id, month, year, SUM(days_present) as present, SUM(days_absent) as absent, COUNT(*) as rows_found')
            ->groupBy('student_id', 'month', 'year')
            ->get();

        $out = [];

        foreach ($rows as $row) {
            if ($row->month === null || $row->year === null) {
                continue;
            }

            $key = $this->key((int) $row->month, (int) $row->year);

            $out[$row->student_id][$key] = [
                'present' => (int) $row->present,
                'absent' => (int) $row->absent,
            ];

            if ((int) $row->rows_found > 1) {
                // Summed, not silently — `student_attendances` has no unique
                // index, and a doubled figure on a printed DepEd form is a
                // number a school would have to explain to a parent.
                $warnings[] = [
                    'student_id' => $row->student_id,
                    'month' => (int) $row->month,
                    'year' => (int) $row->year,
                    'rows' => (int) $row->rows_found,
                    'message' => 'Attendance for '.$this->monthLabel((int) $row->month).' '.$row->year
                        .' is recorded on '.$row->rows_found.' separate rows. They have been added '
                        .'together; check the monthly attendance screen if the total looks wrong.',
                ];
            }
        }

        return $out;
    }

    /**
     * @param  array<string, array{present: int, absent: int}>  $own
     * @param  array<int, array{term: int, month: int, year: int}>  $rows
     * @param  array<string, int>  $classDays
     * @return array<int, array<string, mixed>>
     */
    private function monthsFor(array $own, array $rows, array $classDays): array
    {
        return array_map(function (array $row) use ($own, $classDays) {
            $key = $this->key($row['month'], $row['year']);
            $figures = $own[$key] ?? ['present' => 0, 'absent' => 0];

            return [
                'term' => $row['term'],
                'month' => $row['month'],
                'year' => $row['year'],
                'label' => $this->monthLabel($row['month']),
                'class_days' => $classDays[$key] ?? 0,
                'days_present' => $figures['present'],
                'days_absent' => $figures['absent'],
            ];
        }, $rows);
    }

    /**
     * @return array<int, array<string, int>>
     */
    private function termTotals(array $own, array $rows, array $classDays): array
    {
        $totals = [];

        foreach (MatatagTerms::values() as $term) {
            $totals[$term] = ['class_days' => 0, 'days_present' => 0, 'days_absent' => 0];
        }

        foreach ($rows as $row) {
            $key = $this->key($row['month'], $row['year']);
            $figures = $own[$key] ?? ['present' => 0, 'absent' => 0];

            $totals[$row['term']]['class_days'] += $classDays[$key] ?? 0;
            $totals[$row['term']]['days_present'] += $figures['present'];
            $totals[$row['term']]['days_absent'] += $figures['absent'];
        }

        return $totals;
    }

    /**
     * @return array<string, int>
     */
    private function total(array $own, array $rows, array $classDays): array
    {
        $total = ['class_days' => 0, 'days_present' => 0, 'days_absent' => 0];

        foreach ($this->termTotals($own, $rows, $classDays) as $term) {
            foreach ($total as $field => $value) {
                $total[$field] = $value + $term[$field];
            }
        }

        return $total;
    }

    private function key(int $month, int $year): string
    {
        return $year.'-'.$month;
    }

    /**
     * The month's English name.
     *
     * Built from the number rather than from a date, because `config/app.php`
     * hardcodes UTC while the schools are in Asia/Manila, and anything that
     * goes near `now()` here would be a day out for four hours of every day.
     */
    private function monthLabel(int $month): string
    {
        return [
            1 => 'January', 2 => 'February', 3 => 'March', 4 => 'April',
            5 => 'May', 6 => 'June', 7 => 'July', 8 => 'August',
            9 => 'September', 10 => 'October', 11 => 'November', 12 => 'December',
        ][$month] ?? (string) $month;
    }
}
