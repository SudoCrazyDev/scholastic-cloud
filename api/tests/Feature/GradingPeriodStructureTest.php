<?php

namespace Tests\Feature;

use App\Models\ClassSection;
use App\Models\Institution;
use App\Models\InstitutionAcademicYear;
use App\Models\Role;
use App\Models\Subject;
use App\Models\User;
use App\Models\UserInstitution;
use App\Support\GradingPeriods;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * DepEd's newer structure divides the school year into 3 terms instead of 4
 * quarters, and institutions adopt it on a school-year boundary. The structure is
 * therefore recorded per academic year so a year already graded on 4 quarters
 * keeps reporting that way.
 */
class GradingPeriodStructureTest extends TestCase
{
    use RefreshDatabase;

    private Institution $institution;

    protected function setUp(): void
    {
        parent::setUp();

        GradingPeriods::flushCache();

        $this->institution = Institution::factory()->create([
            'current_academic_year' => '2026-2027',
        ]);
    }

    private function makeUserWithRole(string $roleSlug, string $token): User
    {
        $role = Role::firstOrCreate(['slug' => $roleSlug], ['title' => ucfirst($roleSlug)]);
        $user = User::factory()->create([
            'token' => $token,
            'token_expiry' => now()->addDay()->toDateTimeString(),
        ]);
        UserInstitution::factory()->create([
            'user_id' => $user->id,
            'institution_id' => $this->institution->id,
            'role_id' => $role->id,
            'is_default' => true,
            'is_main' => true,
        ]);

        return $user;
    }

    private function academicYear(string $year, string $type, bool $isCurrent = false): InstitutionAcademicYear
    {
        return InstitutionAcademicYear::create([
            'institution_id' => $this->institution->id,
            'year' => $year,
            'grading_period_type' => $type,
            'is_current' => $isCurrent,
        ]);
    }

    public function test_quarter_structure_has_four_periods_and_quarter_labels(): void
    {
        $config = GradingPeriods::config(GradingPeriods::QUARTER);

        $this->assertSame('quarter', $config['type']);
        $this->assertSame(4, $config['count']);
        $this->assertSame('Quarter', $config['noun']);
        $this->assertSame(['1', '2', '3', '4'], array_column($config['periods'], 'value'));
        $this->assertSame('1st Quarter', $config['periods'][0]['label']);
        $this->assertSame('Q4', $config['periods'][3]['short']);
    }

    public function test_term_structure_has_three_periods_and_term_labels(): void
    {
        $config = GradingPeriods::config(GradingPeriods::TERM);

        $this->assertSame('term', $config['type']);
        $this->assertSame(3, $config['count']);
        $this->assertSame('Term', $config['noun']);
        $this->assertSame(['1', '2', '3'], array_column($config['periods'], 'value'));
        $this->assertSame('1st Term', $config['periods'][0]['label']);
        $this->assertSame('T3', $config['periods'][2]['short']);
    }

    public function test_unknown_or_missing_type_falls_back_to_quarters(): void
    {
        $this->assertSame(GradingPeriods::QUARTER, GradingPeriods::normalizeType(null));
        $this->assertSame(GradingPeriods::QUARTER, GradingPeriods::normalizeType('semester'));
        $this->assertSame(4, GradingPeriods::count(null));
    }

    public function test_structure_is_resolved_per_academic_year(): void
    {
        $this->academicYear('2025-2026', 'quarter');
        $this->academicYear('2026-2027', 'term', true);

        $this->assertSame(
            'quarter',
            GradingPeriods::forInstitution($this->institution->id, '2025-2026'),
            'A year already graded on quarters must keep reporting as quarters.'
        );
        $this->assertSame(
            'term',
            GradingPeriods::forInstitution($this->institution->id, '2026-2027')
        );
    }

    public function test_resolution_without_a_year_uses_the_current_one(): void
    {
        $this->academicYear('2025-2026', 'quarter');
        $this->academicYear('2026-2027', 'term', true);

        $this->assertSame('term', GradingPeriods::forInstitution($this->institution->id));
    }

    public function test_unregistered_year_falls_back_to_the_current_year(): void
    {
        $this->academicYear('2026-2027', 'term', true);

        $this->assertSame(
            'term',
            GradingPeriods::forInstitution($this->institution->id, '2019-2020')
        );
    }

    public function test_existing_columns_default_to_quarters(): void
    {
        $year = InstitutionAcademicYear::create([
            'institution_id' => $this->institution->id,
            'year' => '2024-2025',
            'is_current' => false,
        ]);

        $this->assertSame('quarter', $year->fresh()->grading_period_type);
    }

    public function test_period_beyond_the_configured_count_is_rejected(): void
    {
        $this->assertTrue(GradingPeriods::isValidPeriod('quarter', 4));
        $this->assertFalse(GradingPeriods::isValidPeriod('term', 4));
        $this->assertTrue(GradingPeriods::isValidPeriod('term', 3));
        $this->assertFalse(GradingPeriods::isValidPeriod('term', 0));
    }

    public function test_grading_periods_endpoint_returns_the_years_structure(): void
    {
        $this->academicYear('2025-2026', 'quarter');
        $this->academicYear('2026-2027', 'term', true);

        $this->makeUserWithRole('subject-teacher', 'grading-periods-token');

        $this->withHeader('Authorization', 'Bearer grading-periods-token')
            ->getJson('/api/grading-periods?academic_year=2026-2027')
            ->assertOk()
            ->assertJsonPath('data.type', 'term')
            ->assertJsonPath('data.count', 3);

        $this->withHeader('Authorization', 'Bearer grading-periods-token')
            ->getJson('/api/grading-periods?academic_year=2025-2026')
            ->assertOk()
            ->assertJsonPath('data.type', 'quarter')
            ->assertJsonPath('data.count', 4);
    }

    public function test_principal_can_switch_a_year_between_quarters_and_terms(): void
    {
        $this->academicYear('2026-2027', 'quarter', true);
        $this->makeUserWithRole('principal', 'principal-token');

        $this->withHeader('Authorization', 'Bearer principal-token')
            ->putJson("/api/institutions/{$this->institution->id}/academic-years/grading-periods", [
                'year' => '2026-2027',
                'grading_period_type' => 'term',
            ])
            ->assertOk()
            ->assertJsonPath('data.grading_period_type', 'term');

        $this->assertDatabaseHas('institution_academic_years', [
            'institution_id' => $this->institution->id,
            'year' => '2026-2027',
            'grading_period_type' => 'term',
        ]);
    }

    public function test_non_admin_role_cannot_switch_the_structure(): void
    {
        $this->academicYear('2026-2027', 'quarter', true);
        $this->makeUserWithRole('subject-teacher', 'teacher-token');

        $this->withHeader('Authorization', 'Bearer teacher-token')
            ->putJson("/api/institutions/{$this->institution->id}/academic-years/grading-periods", [
                'year' => '2026-2027',
                'grading_period_type' => 'term',
            ])
            ->assertForbidden();
    }

    public function test_invalid_structure_value_is_rejected(): void
    {
        $this->academicYear('2026-2027', 'quarter', true);
        $this->makeUserWithRole('principal', 'principal-token-2');

        $this->withHeader('Authorization', 'Bearer principal-token-2')
            ->putJson("/api/institutions/{$this->institution->id}/academic-years/grading-periods", [
                'year' => '2026-2027',
                'grading_period_type' => 'trimester',
            ])
            ->assertStatus(422);
    }

    public function test_setting_an_existing_year_as_current_keeps_its_structure(): void
    {
        $this->academicYear('2025-2026', 'quarter');
        $this->academicYear('2026-2027', 'term', true);

        $this->makeUserWithRole('principal', 'principal-token-3');

        // No grading_period_type supplied — switching the current year back must not
        // silently re-label the grades already entered under it.
        $this->withHeader('Authorization', 'Bearer principal-token-3')
            ->putJson("/api/institutions/{$this->institution->id}/academic-year", [
                'current_academic_year' => '2025-2026',
            ])
            ->assertOk();

        $this->assertDatabaseHas('institution_academic_years', [
            'institution_id' => $this->institution->id,
            'year' => '2025-2026',
            'grading_period_type' => 'quarter',
            'is_current' => true,
        ]);
    }

    public function test_new_year_can_be_created_directly_as_term_based(): void
    {
        $this->makeUserWithRole('principal', 'principal-token-4');

        $this->withHeader('Authorization', 'Bearer principal-token-4')
            ->putJson("/api/institutions/{$this->institution->id}/academic-year", [
                'current_academic_year' => '2027-2028',
                'grading_period_type' => 'term',
            ])
            ->assertOk();

        $this->assertDatabaseHas('institution_academic_years', [
            'institution_id' => $this->institution->id,
            'year' => '2027-2028',
            'grading_period_type' => 'term',
        ]);
    }

    public function test_term_based_section_rejects_a_fourth_period_in_consolidated_grades(): void
    {
        $this->academicYear('2026-2027', 'term', true);
        $this->makeUserWithRole('principal', 'consolidated-token');

        $section = ClassSection::create([
            'institution_id' => $this->institution->id,
            'grade_level' => 'Grade 7',
            'title' => 'Section A',
            'academic_year' => '2026-2027',
        ]);

        $this->withHeader('Authorization', 'Bearer consolidated-token')
            ->getJson("/api/section-consolidated-grades?section_id={$section->id}&quarter=4")
            ->assertStatus(422);

        $this->withHeader('Authorization', 'Bearer consolidated-token')
            ->getJson("/api/section-consolidated-grades?section_id={$section->id}&quarter=3")
            ->assertOk()
            ->assertJsonPath('data.grading_periods.type', 'term')
            ->assertJsonPath('data.grading_periods.count', 3);
    }

    public function test_term_based_subject_rejects_a_fourth_period_final_grade(): void
    {
        $this->academicYear('2026-2027', 'term', true);
        $user = $this->makeUserWithRole('subject-teacher', 'final-grade-token');

        $section = ClassSection::create([
            'institution_id' => $this->institution->id,
            'grade_level' => 'Grade 7',
            'title' => 'Section A',
            'academic_year' => '2026-2027',
        ]);
        $subject = Subject::create([
            'institution_id' => $this->institution->id,
            'class_section_id' => $section->id,
            'adviser' => $user->id,
            'subject_type' => 'parent',
            'title' => 'Mathematics',
            'order' => 1,
        ]);

        $student = \App\Models\Student::create([
            'first_name' => 'Term',
            'last_name' => 'Learner',
            'gender' => 'female',
            'birthdate' => '2013-05-05',
            'is_active' => true,
        ]);

        $this->withHeader('Authorization', 'Bearer final-grade-token')
            ->postJson('/api/student-running-grades/upsert-final-grade', [
                'student_id' => $student->id,
                'subject_id' => $subject->id,
                'quarter' => 4,
                'final_grade' => 88,
                'academic_year' => '2026-2027',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('quarter');

        $this->withHeader('Authorization', 'Bearer final-grade-token')
            ->postJson('/api/student-running-grades/upsert-final-grade', [
                'student_id' => $student->id,
                'subject_id' => $subject->id,
                'quarter' => 3,
                'final_grade' => 88,
                'academic_year' => '2026-2027',
            ])
            ->assertSuccessful();
    }

    /**
     * The premise the whole MATATAG module rests on, pinned here rather than
     * in that module's own tests — because what has to keep working is *this*
     * system, and this is the file that owns it.
     *
     * `GradingPeriods::forInstitution()` resolves quarter-versus-term per
     * (institution, academic year), school-wide, and
     * `institution_academic_years` is UNIQUE (institution_id, year) with no
     * grade-level dimension to add one to. So a K-12 school cannot put Grades
     * 1 to 3 on three MATATAG terms by flipping that flag: it would make
     * `count()` return 3 for the whole school, and `assertValidPeriod()` would
     * start throwing at every Grade 10 teacher entering Quarter 4.
     *
     * MATATAG therefore owns its own fixed three-term concept and never calls
     * `GradingPeriods`. If someone later "simplifies" by wiring the two
     * together, this test is what fails.
     */
    public function test_opting_a_grade_1_section_into_matatag_leaves_the_school_on_quarters(): void
    {
        $this->academicYear('2026-2027', 'quarter', true);
        $user = $this->makeUserWithRole('subject-teacher', 'matatag-premise-token');

        $grade1 = ClassSection::create([
            'institution_id' => $this->institution->id,
            'grade_level' => 'Grade 1',
            'title' => 'Sampaguita',
            'adviser' => $user->id,
            'academic_year' => '2026-2027',
        ]);

        \App\Models\MatatagSectionCurriculum::create([
            'institution_id' => $this->institution->id,
            'class_section_id' => $grade1->id,
            'academic_year' => '2026-2027',
            'curriculum_version_id' => \App\Models\MatatagCurriculumVersion::where(
                'code', 'deped-matatag-ks1-grade-1-v1'
            )->value('id'),
            'grade_level' => 'Grade 1',
            'enabled' => true,
        ]);

        GradingPeriods::flushCache();

        $this->assertSame(
            'quarter',
            GradingPeriods::forInstitution($this->institution->id, '2026-2027'),
            'MATATAG must not touch how the rest of the school is graded.',
        );
        $this->assertSame(4, GradingPeriods::count($this->institution->id, '2026-2027'));

        $this->assertSame(
            'quarter',
            InstitutionAcademicYear::where('institution_id', $this->institution->id)
                ->where('year', '2026-2027')
                ->value('grading_period_type'),
            'the stored structure is untouched',
        );

        // And a Grade 10 teacher can still enter Quarter 4 in the same school
        // and the same year.
        $grade10 = ClassSection::create([
            'institution_id' => $this->institution->id,
            'grade_level' => 'Grade 10',
            'title' => 'Einstein',
            'academic_year' => '2026-2027',
        ]);
        $subject = Subject::create([
            'institution_id' => $this->institution->id,
            'class_section_id' => $grade10->id,
            'adviser' => $user->id,
            'subject_type' => 'parent',
            'title' => 'Mathematics',
            'order' => 1,
        ]);
        $student = \App\Models\Student::create([
            'first_name' => 'Quarter',
            'last_name' => 'Learner',
            'gender' => 'male',
            'birthdate' => '2010-05-05',
            'is_active' => true,
        ]);

        $this->withHeader('Authorization', 'Bearer matatag-premise-token')
            ->postJson('/api/student-running-grades/upsert-final-grade', [
                'student_id' => $student->id,
                'subject_id' => $subject->id,
                'quarter' => 4,
                'final_grade' => 88,
                'academic_year' => '2026-2027',
            ])
            ->assertSuccessful();
    }
}
