<?php

namespace Tests\Feature\Matatag;

use App\Models\Department;
use App\Support\MatatagTerms;
use Illuminate\Support\Facades\DB;

/**
 * The attendance block, derived from records the school already keeps.
 *
 * The load-bearing claim of this whole service is that it **writes nothing**.
 * There is no MATATAG attendance screen and there must never be one: a second
 * place to type the same figures is a second set of figures that disagree with
 * the first. One test below asserts that by checksum rather than by reading
 * the code.
 */
class MatatagTermAttendanceTest extends MatatagTestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        $this->optIn($this->sectionA1);
    }

    /**
     * Eleven rows, June through April, each stamped with the calendar year it
     * falls in. School years run June-May, so June-December belong to the
     * starting year and January-April to the next.
     */
    public function test_the_table_has_the_eleven_rows_deped_prints_in_deped_order(): void
    {
        $months = $this->as($this->adviserA1)
            ->getJson('/api/matatag/attendance?class_section_id='.$this->sectionA1->id)
            ->assertOk()
            ->json('data.months');

        $this->assertCount(11, $months);

        $this->assertSame(
            ['June', 'July', 'August', 'September', 'October', 'November', 'December',
                'January', 'February', 'March', 'April'],
            array_column($months, 'label'),
        );

        $this->assertSame(
            [1, 1, 1, 1, 2, 2, 2, 3, 3, 3, 3],
            array_column($months, 'term'),
            'September belongs wholly to Term 1 — our documented deviation from the printed form.',
        );

        $this->assertSame(
            [2026, 2026, 2026, 2026, 2026, 2026, 2026, 2027, 2027, 2027, 2027],
            array_column($months, 'year'),
        );
    }

    /**
     * September appears exactly once. DepEd's form prints it twice, split
     * across Terms 1 and 2, because the boundary falls mid-month — we cannot
     * reproduce that split from monthly totals, and an estimate is not
     * something a school can defend to a parent.
     */
    public function test_september_is_counted_once_and_the_terms_reconcile_with_the_year(): void
    {
        $this->seedClassDays([6 => 20, 7 => 21, 8 => 22, 9 => 20, 10 => 21, 11 => 20,
            12 => 15, 1 => 20, 2 => 19, 3 => 21, 4 => 18]);
        $this->seedAttendance($this->learnersA1[0]->id, [
            6 => [20, 0], 7 => [19, 2], 8 => [22, 0], 9 => [18, 2],
            10 => [21, 0], 11 => [20, 0], 12 => [15, 0],
            1 => [20, 0], 2 => [18, 1], 3 => [21, 0], 4 => [17, 1],
        ]);

        $data = $this->as($this->adviserA1)
            ->getJson('/api/matatag/attendance?class_section_id='.$this->sectionA1->id
                .'&student_id='.$this->learnersA1[0]->id)
            ->assertOk()
            ->json('data');

        $this->assertSame(1, collect($data['months'])->where('month', 9)->count());

        $this->assertSame(
            ['class_days' => 83, 'days_present' => 79, 'days_absent' => 4],
            $data['terms'][1],
            'Term 1 is June through September, September included once.',
        );
        $this->assertSame(['class_days' => 56, 'days_present' => 56, 'days_absent' => 0], $data['terms'][2]);
        $this->assertSame(['class_days' => 78, 'days_present' => 76, 'days_absent' => 2], $data['terms'][3]);

        // Every month belongs to exactly one term, so the three terms sum to
        // the year with nothing double-counted and nothing lost.
        $this->assertSame(
            ['class_days' => 217, 'days_present' => 211, 'days_absent' => 6],
            $data['total'],
        );

        $this->assertSame(
            array_sum(array_column($data['months'], 'class_days')),
            $data['total']['class_days'],
        );
    }

    /**
     * `student_attendances` declares no unique index — its migration has none,
     * and the controller that writes it dedupes by hand. Two rows for one
     * learner-month are therefore possible, and a doubled figure on a printed
     * DepEd form is a number a school would have to explain to a parent.
     */
    public function test_duplicate_monthly_rows_are_summed_and_reported(): void
    {
        $student = $this->learnersA1[0];

        $this->seedClassDays([6 => 20]);
        $this->insertAttendanceRow($student->id, 6, 2026, 12, 1);
        $this->insertAttendanceRow($student->id, 6, 2026, 6, 1);

        $data = $this->as($this->adviserA1)
            ->getJson('/api/matatag/attendance?class_section_id='.$this->sectionA1->id
                .'&student_id='.$student->id)
            ->assertOk()
            ->json('data');

        $june = collect($data['months'])->firstWhere('month', 6);

        $this->assertSame(18, $june['days_present'], 'summed, not silently taking one row');
        $this->assertSame(2, $june['days_absent']);

        $this->assertCount(1, $data['warnings'], 'the duplicate must be reported, not swallowed');
        $this->assertSame($student->id, $data['warnings'][0]['student_id']);
        $this->assertSame(2, $data['warnings'][0]['rows']);
        $this->assertStringContainsString('June 2026', $data['warnings'][0]['message']);
    }

    /**
     * `school_days` gained a department column later, so rows exist both with
     * and without one. A Grade 1 report card must not print the senior-high
     * calendar.
     */
    public function test_class_days_come_from_the_sections_own_department(): void
    {
        $elementary = Department::create(['institution_id' => $this->schoolA->id, 'title' => 'Elementary']);
        $seniorHigh = Department::create(['institution_id' => $this->schoolA->id, 'title' => 'Senior High']);

        $this->sectionA1->update(['department_id' => $elementary->id]);

        $this->insertSchoolDay(6, 2026, 20, null);                  // institution-wide
        $this->insertSchoolDay(6, 2026, 18, $elementary->id);        // ours
        $this->insertSchoolDay(6, 2026, 25, $seniorHigh->id);        // somebody else's

        // July has only the institution-wide row, which is the fallback.
        $this->insertSchoolDay(7, 2026, 21, null);

        $months = collect($this->as($this->adviserA1)
            ->getJson('/api/matatag/attendance?class_section_id='.$this->sectionA1->id
                .'&student_id='.$this->learnersA1[0]->id)
            ->assertOk()
            ->json('data.months'));

        $this->assertSame(18, $months->firstWhere('month', 6)['class_days'], "the section's own department wins");
        $this->assertSame(21, $months->firstWhere('month', 7)['class_days'], 'falling back to the school-wide row');
    }

    /** The whole section in one call, for the class-level view. */
    public function test_the_section_view_returns_every_learner(): void
    {
        $this->seedClassDays([6 => 20]);
        $this->seedAttendance($this->learnersA1[0]->id, [6 => [19, 1]]);

        $data = $this->as($this->adviserA1)
            ->getJson('/api/matatag/attendance?class_section_id='.$this->sectionA1->id)
            ->assertOk()
            ->json('data');

        $this->assertCount(3, $data['learners']);

        $marked = collect($data['learners'])->firstWhere('student_id', $this->learnersA1[0]->id);
        $this->assertSame(19, collect($marked['months'])->firstWhere('month', 6)['days_present']);

        // A learner with no attendance rows reads as zero, not as missing.
        $unmarked = collect($data['learners'])->firstWhere('student_id', $this->learnersA1[1]->id);
        $this->assertSame(0, collect($unmarked['months'])->firstWhere('month', 6)['days_present']);
        $this->assertCount(11, $unmarked['months']);
    }

    public function test_a_learner_from_another_section_is_not_readable_through_this_endpoint(): void
    {
        $this->as($this->adviserA1)
            ->getJson('/api/matatag/attendance?class_section_id='.$this->sectionA1->id
                .'&student_id='.$this->learnerB->id)
            ->assertStatus(404)
            ->assertJsonPath('code', 'student_not_on_roster');
    }

    /**
     * The claim that this service only reads, asserted rather than trusted.
     */
    public function test_reading_attendance_writes_nothing_at_all(): void
    {
        $this->seedClassDays([6 => 20, 7 => 21]);
        $this->seedAttendance($this->learnersA1[0]->id, [6 => [19, 1], 7 => [21, 0]]);

        $before = $this->checksum();

        $this->as($this->adviserA1)
            ->getJson('/api/matatag/attendance?class_section_id='.$this->sectionA1->id)
            ->assertOk();
        $this->as($this->adviserA1)
            ->getJson('/api/matatag/attendance?class_section_id='.$this->sectionA1->id
                .'&student_id='.$this->learnersA1[0]->id)
            ->assertOk();

        $this->assertSame($before, $this->checksum(), 'student_attendances and school_days are read-only here');
    }

    // -----------------------------------------------------------------

    private function checksum(): string
    {
        return md5(
            DB::table('student_attendances')->orderBy('id')->get()->toJson()
            .DB::table('school_days')->orderBy('id')->get()->toJson()
        );
    }

    /** @param array<int, int> $days month => total */
    private function seedClassDays(array $days): void
    {
        foreach ($days as $month => $total) {
            $this->insertSchoolDay($month, MatatagTerms::calendarYearFor($month, self::YEAR), $total, null);
        }
    }

    private function insertSchoolDay(int $month, int $year, int $total, ?string $departmentId): void
    {
        DB::table('school_days')->insert([
            'id' => (string) \Illuminate\Support\Str::uuid7(),
            'institution_id' => $this->schoolA->id,
            'department_id' => $departmentId,
            'academic_year' => self::YEAR,
            'month' => $month,
            'year' => $year,
            'total_days' => $total,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    /** @param array<int, array{0: int, 1: int}> $figures month => [present, absent] */
    private function seedAttendance(string $studentId, array $figures): void
    {
        foreach ($figures as $month => [$present, $absent]) {
            $this->insertAttendanceRow(
                $studentId, $month, MatatagTerms::calendarYearFor($month, self::YEAR), $present, $absent
            );
        }
    }

    private function insertAttendanceRow(string $studentId, int $month, int $year, int $present, int $absent): void
    {
        DB::table('student_attendances')->insert([
            'id' => (string) \Illuminate\Support\Str::uuid7(),
            'student_id' => $studentId,
            'class_section_id' => $this->sectionA1->id,
            'academic_year' => self::YEAR,
            'month' => $month,
            'year' => $year,
            'days_present' => $present,
            'days_absent' => $absent,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }
}
