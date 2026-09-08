<?php

namespace Tests\Feature;

use App\Models\ClassSection;
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
 * The Records tab's "without a section" filter on GET /students.
 *
 * The filter's whole job is to find the newly enrolled who have not been put in
 * a section yet, so what counts as "in a section" has to match what the grid's
 * Current Section column shows — both read the active `student_sections` rows.
 * The case that pulls them apart is a transfer: it leaves a deactivated row
 * behind for the same year, and reading rows without regard to `is_active`
 * would call a transferred student unassigned while the grid names their new
 * section on the very same row.
 */
class StudentSectionFilterTest extends TestCase
{
    use RefreshDatabase;

    private Institution $school;

    private Institution $otherSchool;

    private ClassSection $section;

    protected function setUp(): void
    {
        parent::setUp();

        $this->school = Institution::factory()->create([
            'title' => 'Filter Academy',
            'current_academic_year' => '2026-2027',
        ]);
        $this->otherSchool = Institution::factory()->create(['title' => 'Other Academy']);

        $this->section = $this->sectionFor($this->school, 'Mabini');

        $role = Role::create([
            'institution_id' => $this->school->id,
            'title' => 'Registrar',
            'slug' => 'registrar',
        ]);
        $role->syncPermissions(['students.view']);

        $user = User::factory()->create([
            'email' => 'registrar@filter.test',
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
    }

    private function sectionFor(Institution $institution, string $title): ClassSection
    {
        return ClassSection::create([
            'institution_id' => $institution->id,
            'grade_level' => 'Grade 1',
            'title' => $title,
            'academic_year' => '2026-2027',
        ]);
    }

    private function student(string $last, ?Institution $institution = null): Student
    {
        $student = Student::create([
            'first_name' => 'Test',
            'last_name' => $last,
            'gender' => 'female',
            'birthdate' => '2015-06-15',
            'is_active' => true,
        ]);

        StudentInstitution::create([
            'student_id' => $student->id,
            'institution_id' => ($institution ?? $this->school)->id,
            'is_active' => true,
            'academic_year' => '2026-2027',
        ]);

        return $student;
    }

    private function enrol(Student $student, ClassSection $section, bool $active = true): void
    {
        StudentSection::create([
            'student_id' => $student->id,
            'section_id' => $section->id,
            'academic_year' => '2026-2027',
            'is_active' => $active,
            'is_promoted' => false,
        ]);
    }

    /** @return array<string> the surnames the filter returned */
    private function surnames(string $query = ''): array
    {
        $rows = $this->withHeader('Authorization', 'Bearer registrar-token')
            ->getJson('/api/students?per_page=100'.($query ? '&'.$query : ''))
            ->assertOk()
            ->json('data');

        $surnames = array_column($rows, 'last_name');
        sort($surnames);

        return $surnames;
    }

    public function test_without_a_section_returns_only_the_unassigned(): void
    {
        $this->enrol($this->student('Assigned'), $this->section);
        $this->student('Waiting');

        $this->assertSame(['Assigned', 'Waiting'], $this->surnames());
        $this->assertSame(['Waiting'], $this->surnames('section_status=unassigned'));
        $this->assertSame(['Assigned'], $this->surnames('section_status=assigned'));
    }

    /**
     * A transfer deactivates the old row and writes a new active one. The
     * student is in a section — the new one — and must not be offered up as
     * waiting for an assignment.
     */
    public function test_a_transferred_student_still_counts_as_having_a_section(): void
    {
        $student = $this->student('Transferred');
        $this->enrol($student, $this->section, active: false);
        $this->enrol($student, $this->sectionFor($this->school, 'Rizal'));

        $this->assertSame([], $this->surnames('section_status=unassigned'));
        $this->assertSame(['Transferred'], $this->surnames('section_status=assigned'));
    }

    /**
     * The mirror case: taken out of a section and not put in another. Their
     * Current Section column reads empty, so the filter has to find them.
     */
    public function test_a_student_left_with_only_a_deactivated_enrolment_is_unassigned(): void
    {
        $student = $this->student('Removed');
        $this->enrol($student, $this->section, active: false);

        $this->assertSame(['Removed'], $this->surnames('section_status=unassigned'));
        $this->assertSame([], $this->surnames('section_status=assigned'));
    }

    /**
     * Every student the filter calls unassigned is one the grid draws with an
     * empty Current Section, and the other way round. The two are read from the
     * same rows and this is the property that keeps them in step.
     */
    public function test_the_filter_agrees_with_the_current_section_the_grid_shows(): void
    {
        $this->enrol($this->student('Assigned'), $this->section);
        $this->student('Waiting');

        $moved = $this->student('Transferred');
        $this->enrol($moved, $this->section, active: false);
        $this->enrol($moved, $this->sectionFor($this->school, 'Rizal'));

        $rows = $this->withHeader('Authorization', 'Bearer registrar-token')
            ->getJson('/api/students?per_page=100&section_status=unassigned')
            ->assertOk()
            ->json('data');

        foreach ($rows as $row) {
            $this->assertNull($row['current_section'], $row['last_name'].' was listed as unassigned but the grid would name a section');
        }

        $assigned = $this->withHeader('Authorization', 'Bearer registrar-token')
            ->getJson('/api/students?per_page=100&section_status=assigned')
            ->assertOk()
            ->json('data');

        foreach ($assigned as $row) {
            $this->assertNotNull($row['current_section'], $row['last_name'].' was listed as assigned but the grid would show no section');
        }
    }

    public function test_the_filter_narrows_the_search_rather_than_replacing_it(): void
    {
        $this->student('Waiting');
        $this->student('Pending');
        $this->enrol($this->student('Waitlisted'), $this->section);

        $this->assertSame(
            ['Waiting'],
            $this->surnames('section_status=unassigned&search=Waiting')
        );
    }

    public function test_another_schools_unassigned_students_are_never_listed(): void
    {
        $this->student('Waiting');
        $this->student('Outsider', $this->otherSchool);

        $this->assertSame(['Waiting'], $this->surnames('section_status=unassigned'));
    }

    /**
     * An unrecognised value is ignored rather than erroring, so a stale link or
     * a hand-typed query still returns the roll instead of a 422.
     */
    public function test_an_unrecognised_filter_value_lists_everyone(): void
    {
        $this->enrol($this->student('Assigned'), $this->section);
        $this->student('Waiting');

        $this->assertSame(['Assigned', 'Waiting'], $this->surnames('section_status=bogus'));
    }
}
