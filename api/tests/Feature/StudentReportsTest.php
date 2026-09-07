<?php

namespace Tests\Feature;

use App\Models\ClassSection;
use App\Models\GradeLevel;
use App\Models\Institution;
use App\Models\Role;
use App\Models\Student;
use App\Models\StudentInstitution;
use App\Models\StudentSection;
use App\Models\User;
use App\Models\UserInstitution;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The Students screen's Printing and Statistics tabs.
 *
 * Two things are worth pinning here. The first is the tenant boundary: both
 * endpoints read the whole school's roll at once, with no student id in the URL
 * to scope them, so a missing `institution_id` filter would hand one school's
 * enrolment to another — the class of bug `SecurityAuthorizationTest` exists
 * for, which is why the fixture below is two schools.
 *
 * The second is that headcounts have to agree with each other. A student who
 * was transferred between sections keeps a deactivated `student_sections` row
 * for the same academic year, and counting that row would show the school more
 * pupils than it has, in both the per-section and the per-grade-level table.
 */
class StudentReportsTest extends TestCase
{
    use RefreshDatabase;

    private Institution $school;

    private Institution $otherSchool;

    protected function setUp(): void
    {
        parent::setUp();

        $this->school = Institution::factory()->create([
            'title' => 'Roster Academy',
            'current_academic_year' => '2026-2027',
        ]);
        $this->otherSchool = Institution::factory()->create([
            'title' => 'Other Academy',
            'current_academic_year' => '2026-2027',
        ]);

        // Grade levels carry the order the reports group by; Grade 2 is created
        // first so a test failing back to alphabetical order would be caught.
        GradeLevel::create(['title' => 'Grade 2', 'sort_order' => 4]);
        GradeLevel::create(['title' => 'Grade 1', 'sort_order' => 3]);

        $this->registrar();
    }

    /* ---------------------------------------------------------------- helpers */

    private function registrar(): User
    {
        $role = Role::create([
            'institution_id' => $this->school->id,
            'title' => 'Registrar',
            'slug' => 'registrar',
        ]);
        $role->syncPermissions(['students.view']);

        $user = User::factory()->create([
            'email' => 'registrar@roster.test',
            'token' => 'registrar-token',
            'token_expiry' => now()->addYear()->toDateTimeString(),
        ]);

        UserInstitution::factory()->create([
            'user_id' => $user->id,
            'institution_id' => $this->school->id,
            'role_id' => $role->id,
            'is_default' => true,
            'is_main' => true,
        ]);

        return $user;
    }

    private function asRegistrar(): self
    {
        return $this->withHeader('Authorization', 'Bearer registrar-token');
    }

    private function section(
        Institution $institution,
        string $gradeLevel,
        string $title,
        string $academicYear = '2026-2027'
    ): ClassSection {
        return ClassSection::create([
            'institution_id' => $institution->id,
            'grade_level' => $gradeLevel,
            'title' => $title,
            'academic_year' => $academicYear,
        ]);
    }

    private function student(
        Institution $institution,
        string $first,
        string $last,
        string $gender
    ): Student {
        $student = Student::create([
            'first_name' => $first,
            'last_name' => $last,
            'gender' => $gender,
            'birthdate' => '2015-06-15',
            'is_active' => true,
        ]);

        StudentInstitution::create([
            'student_id' => $student->id,
            'institution_id' => $institution->id,
            'is_active' => true,
            'academic_year' => '2026-2027',
        ]);

        return $student;
    }

    private function enrol(
        Student $student,
        ClassSection $section,
        bool $active = true,
        string $academicYear = '2026-2027'
    ): StudentSection {
        return StudentSection::create([
            'student_id' => $student->id,
            'section_id' => $section->id,
            'academic_year' => $academicYear,
            'is_active' => $active,
            'is_promoted' => false,
        ]);
    }

    /* ------------------------------------------------------------ statistics */

    public function test_statistics_counts_male_and_female_per_section_and_per_grade_level(): void
    {
        $mabini = $this->section($this->school, 'Grade 1', 'Mabini');
        $rizal = $this->section($this->school, 'Grade 1', 'Rizal');
        $bonifacio = $this->section($this->school, 'Grade 2', 'Bonifacio');

        $this->enrol($this->student($this->school, 'Ana', 'Cruz', 'female'), $mabini);
        $this->enrol($this->student($this->school, 'Ben', 'Diaz', 'male'), $mabini);
        $this->enrol($this->student($this->school, 'Cara', 'Enrile', 'female'), $rizal);
        $this->enrol($this->student($this->school, 'Dino', 'Flores', 'male'), $bonifacio);
        $this->enrol($this->student($this->school, 'Elsa', 'Gomez', 'female'), $bonifacio);

        $data = $this->asRegistrar()->getJson('/api/students/statistics')->assertOk()->json('data');

        $this->assertSame('2026-2027', $data['academic_year']);
        $this->assertSame(['male' => 2, 'female' => 3, 'other' => 0, 'total' => 5], $data['totals']);

        // Sections come back grade level first (by sort_order), then by title.
        $this->assertSame(
            ['Mabini', 'Rizal', 'Bonifacio'],
            array_column($data['by_section'], 'section')
        );
        $this->assertSame(
            [['Grade 1', 1, 1], ['Grade 1', 0, 1], ['Grade 2', 1, 1]],
            array_map(
                fn ($row) => [$row['grade_level'], $row['male'], $row['female']],
                $data['by_section']
            )
        );

        $this->assertSame(
            [
                ['grade_level' => 'Grade 1', 'sections' => 2, 'male' => 1, 'female' => 2, 'total' => 3],
                ['grade_level' => 'Grade 2', 'sections' => 1, 'male' => 1, 'female' => 1, 'total' => 2],
            ],
            array_map(fn ($row) => [
                'grade_level' => $row['grade_level'],
                'sections' => $row['sections'],
                'male' => $row['male'],
                'female' => $row['female'],
                'total' => $row['total'],
            ], $data['by_grade_level'])
        );
    }

    /**
     * The tenant boundary. Nothing in the request names an institution, so the
     * only thing keeping the other school out is the controller's own filter.
     */
    public function test_statistics_never_counts_another_schools_students(): void
    {
        $mine = $this->section($this->school, 'Grade 1', 'Mabini');
        $this->enrol($this->student($this->school, 'Ana', 'Cruz', 'female'), $mine);

        $theirs = $this->section($this->otherSchool, 'Grade 1', 'Their Section');
        $this->enrol($this->student($this->otherSchool, 'Rico', 'Reyes', 'male'), $theirs);

        $data = $this->asRegistrar()->getJson('/api/students/statistics')->assertOk()->json('data');

        $this->assertSame(1, $data['totals']['total']);
        $this->assertSame(['Mabini'], array_column($data['by_section'], 'section'));
    }

    /**
     * A transfer deactivates the old row and writes a new one under the same
     * year. Counting both would inflate the section, the grade level and the
     * school total all at once.
     */
    public function test_a_transferred_student_is_counted_once_in_their_new_section(): void
    {
        $from = $this->section($this->school, 'Grade 1', 'Mabini');
        $to = $this->section($this->school, 'Grade 1', 'Rizal');

        $student = $this->student($this->school, 'Ana', 'Cruz', 'female');
        $this->enrol($student, $from, active: false);
        $this->enrol($student, $to);

        $data = $this->asRegistrar()->getJson('/api/students/statistics')->assertOk()->json('data');

        $this->assertSame(1, $data['totals']['total']);
        $this->assertSame(1, $data['by_grade_level'][0]['total']);

        $bySection = collect($data['by_section'])->keyBy('section');
        $this->assertSame(0, $bySection['Mabini']['total']);
        $this->assertSame(1, $bySection['Rizal']['total']);
    }

    /**
     * An empty section still has to appear, or it silently drops out of the
     * Printing tab's picker and nobody can print its (blank) class list.
     */
    public function test_a_section_with_no_students_is_still_listed(): void
    {
        $this->section($this->school, 'Grade 1', 'Empty');

        $data = $this->asRegistrar()->getJson('/api/students/statistics')->assertOk()->json('data');

        $this->assertSame(['Empty'], array_column($data['by_section'], 'section'));
        $this->assertSame(0, $data['by_section'][0]['total']);
    }

    /**
     * On the roll but in no section: counted nowhere in the tables, so the tab
     * reports them on their own rather than letting the total come up short.
     */
    public function test_students_in_no_section_are_reported_separately(): void
    {
        $mabini = $this->section($this->school, 'Grade 1', 'Mabini');
        $this->enrol($this->student($this->school, 'Ana', 'Cruz', 'female'), $mabini);

        $this->student($this->school, 'Ben', 'Diaz', 'male');
        $this->student($this->school, 'Cara', 'Enrile', 'female');

        $data = $this->asRegistrar()->getJson('/api/students/statistics')->assertOk()->json('data');

        $this->assertSame(1, $data['totals']['total']);
        $this->assertSame(
            ['male' => 1, 'female' => 1, 'other' => 0, 'total' => 2],
            $data['unassigned']
        );
    }

    /**
     * Last year's section, read this year. `is_active` is per academic year, so
     * a past year still reads correctly rather than coming back empty.
     */
    public function test_statistics_reads_a_past_academic_year(): void
    {
        $lastYear = $this->section($this->school, 'Grade 1', 'Mabini', '2025-2026');
        $this->enrol(
            $this->student($this->school, 'Ana', 'Cruz', 'female'),
            $lastYear,
            academicYear: '2025-2026'
        );

        $current = $this->asRegistrar()->getJson('/api/students/statistics')->assertOk()->json('data');
        $this->assertSame(0, $current['totals']['total']);
        $this->assertContains('2025-2026', $current['academic_years']);

        $past = $this->asRegistrar()
            ->getJson('/api/students/statistics?academic_year=2025-2026')
            ->assertOk()
            ->json('data');

        $this->assertSame(1, $past['totals']['total']);
        $this->assertSame(['Mabini'], array_column($past['by_section'], 'section'));
    }

    /* ---------------------------------------------------------------- roster */

    /**
     * The printed order: boys before girls, each run alphabetical by surname —
     * how DepEd's SF1 class list is laid out.
     */
    public function test_a_class_list_puts_the_boys_before_the_girls(): void
    {
        $mabini = $this->section($this->school, 'Grade 1', 'Mabini');

        $this->enrol($this->student($this->school, 'Ana', 'Aquino', 'female'), $mabini);
        $this->enrol($this->student($this->school, 'Ben', 'Zamora', 'male'), $mabini);
        $this->enrol($this->student($this->school, 'Carlo', 'Bautista', 'male'), $mabini);

        $groups = $this->asRegistrar()->getJson('/api/students/roster')->assertOk()->json('data.groups');

        $this->assertCount(1, $groups);
        $this->assertSame(
            ['Bautista, Carlo', 'Zamora, Ben', 'Aquino, Ana'],
            array_column($groups[0]['students'], 'list_name')
        );
        $this->assertSame(2, $groups[0]['male']);
        $this->assertSame(1, $groups[0]['female']);
    }

    public function test_a_class_list_can_be_ordered_alphabetically_instead(): void
    {
        $mabini = $this->section($this->school, 'Grade 1', 'Mabini');

        $this->enrol($this->student($this->school, 'Ana', 'Aquino', 'female'), $mabini);
        $this->enrol($this->student($this->school, 'Ben', 'Zamora', 'male'), $mabini);
        $this->enrol($this->student($this->school, 'Carlo', 'Bautista', 'male'), $mabini);

        $groups = $this->asRegistrar()
            ->getJson('/api/students/roster?sort=name')
            ->assertOk()
            ->json('data.groups');

        $this->assertSame(
            ['Aquino, Ana', 'Bautista, Carlo', 'Zamora, Ben'],
            array_column($groups[0]['students'], 'list_name')
        );
    }

    /**
     * One list per grade level, gathering every section under it — and each
     * student appearing on it once.
     */
    public function test_grouping_by_grade_level_gathers_every_section_under_it(): void
    {
        $mabini = $this->section($this->school, 'Grade 1', 'Mabini');
        $rizal = $this->section($this->school, 'Grade 1', 'Rizal');
        $bonifacio = $this->section($this->school, 'Grade 2', 'Bonifacio');

        $this->enrol($this->student($this->school, 'Ana', 'Aquino', 'female'), $mabini);
        $this->enrol($this->student($this->school, 'Ben', 'Bautista', 'male'), $rizal);
        $this->enrol($this->student($this->school, 'Carlo', 'Cruz', 'male'), $bonifacio);

        $groups = $this->asRegistrar()
            ->getJson('/api/students/roster?group_by=grade_level')
            ->assertOk()
            ->json('data.groups');

        $this->assertSame(['Grade 1', 'Grade 2'], array_column($groups, 'label'));
        $this->assertSame(
            ['Bautista, Ben', 'Aquino, Ana'],
            array_column($groups[0]['students'], 'list_name')
        );
        // Which section each student sits in still travels with them, so the
        // grade-level sheet can carry a Section column.
        $this->assertSame(['Rizal', 'Mabini'], array_column($groups[0]['students'], 'section'));
    }

    public function test_a_roster_can_be_narrowed_to_the_selected_sections(): void
    {
        $mabini = $this->section($this->school, 'Grade 1', 'Mabini');
        $rizal = $this->section($this->school, 'Grade 1', 'Rizal');

        $this->enrol($this->student($this->school, 'Ana', 'Aquino', 'female'), $mabini);
        $this->enrol($this->student($this->school, 'Ben', 'Bautista', 'male'), $rizal);

        $groups = $this->asRegistrar()
            ->getJson('/api/students/roster?section_ids[]='.$rizal->id)
            ->assertOk()
            ->json('data.groups');

        $this->assertCount(1, $groups);
        $this->assertSame('Rizal', $groups[0]['section']);
        $this->assertSame(['Bautista, Ben'], array_column($groups[0]['students'], 'list_name'));
    }

    /**
     * Asking for another school's section by id must not print its students.
     */
    public function test_a_roster_never_prints_another_schools_section(): void
    {
        $theirs = $this->section($this->otherSchool, 'Grade 1', 'Their Section');
        $this->enrol($this->student($this->otherSchool, 'Rico', 'Reyes', 'male'), $theirs);

        $groups = $this->asRegistrar()
            ->getJson('/api/students/roster?section_ids[]='.$theirs->id)
            ->assertOk()
            ->json('data.groups');

        $this->assertSame([], $groups);
    }

    /**
     * `students.gender` is free text and holds 'M' and 'Male' as well as
     * 'male', so the counts have to normalise it rather than match exactly.
     */
    public function test_headcounts_normalise_however_the_gender_was_written(): void
    {
        $mabini = $this->section($this->school, 'Grade 1', 'Mabini');

        $this->enrol($this->student($this->school, 'Ana', 'Aquino', 'F'), $mabini);
        $this->enrol($this->student($this->school, 'Ben', 'Bautista', 'Male'), $mabini);
        $this->enrol($this->student($this->school, 'Carlo', 'Cruz', 'M'), $mabini);
        $this->enrol($this->student($this->school, 'Dina', 'Diaz', 'Female'), $mabini);

        $data = $this->asRegistrar()->getJson('/api/students/statistics')->assertOk()->json('data');

        $this->assertSame(['male' => 2, 'female' => 2, 'other' => 0, 'total' => 4], $data['totals']);
    }

    /**
     * Both endpoints read the whole school's roll, so a signed-in student must
     * not reach either — the routes are declared without `shared`.
     */
    public function test_a_role_without_students_view_is_refused(): void
    {
        $role = Role::create([
            'institution_id' => $this->school->id,
            'title' => 'Cashier',
            'slug' => 'cashier',
        ]);
        $role->syncPermissions(['finance.view']);

        $user = User::factory()->create([
            'email' => 'cashier@roster.test',
            'token' => 'cashier-token',
            'token_expiry' => now()->addYear()->toDateTimeString(),
        ]);
        UserInstitution::factory()->create([
            'user_id' => $user->id,
            'institution_id' => $this->school->id,
            'role_id' => $role->id,
            'is_default' => true,
            'is_main' => true,
        ]);

        $this->withHeader('Authorization', 'Bearer cashier-token')
            ->getJson('/api/students/statistics')
            ->assertForbidden();

        $this->withHeader('Authorization', 'Bearer cashier-token')
            ->getJson('/api/students/roster')
            ->assertForbidden();
    }
}
