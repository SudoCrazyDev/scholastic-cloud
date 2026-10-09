<?php

namespace Tests\Feature;

use App\Models\ClassSection;
use App\Models\Institution;
use App\Models\ReportCardTemplate;
use App\Models\Role;
use App\Models\Subject;
use App\Models\User;
use App\Models\UserInstitution;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * A school's own report card designs, assigned to grade levels.
 *
 * Two schools, because a template is tenant data: one school's Grade 11 card
 * must never be what another school's Grade 11 adviser prints.
 */
class ReportCardTemplateTest extends TestCase
{
    use RefreshDatabase;

    private Institution $schoolA;

    private Institution $schoolB;

    protected function setUp(): void
    {
        parent::setUp();

        $this->schoolA = Institution::factory()->create(['title' => 'School A']);
        $this->schoolB = Institution::factory()->create(['title' => 'School B']);

        $this->makeStaff($this->schoolA, 'principal', 'principal-a@rct.test', 'token-a');
        $this->makeStaff($this->schoolB, 'principal', 'principal-b@rct.test', 'token-b');
        $this->makeStaff($this->schoolA, 'subject-teacher', 'teacher-a@rct.test', 'teacher-token-a');
    }

    private function makeStaff(Institution $institution, string $slug, string $email, string $token): User
    {
        // Role::booted() syncs the seeded permission set for a known system slug.
        $role = Role::factory()->create(['title' => ucfirst($slug), 'slug' => $slug]);

        $user = User::factory()->create([
            'email' => $email,
            'token' => $token,
            'token_expiry' => now()->addYear()->toDateTimeString(),
        ]);

        UserInstitution::factory()->create([
            'user_id' => $user->id,
            'institution_id' => $institution->id,
            'role_id' => $role->id,
            'is_default' => true,
            'is_main' => true,
        ]);

        return $user;
    }

    private function as(string $token)
    {
        return $this->withHeader('Authorization', 'Bearer '.$token);
    }

    private function createTemplate(string $token, array $overrides = [])
    {
        return $this->as($token)->postJson('/api/report-card-templates', array_merge([
            'name' => 'Senior High Card',
            'layout' => 'shs_semestral',
            'settings' => ['school_subtitle' => 'General Santos City Chapter', 'show_deped_header' => true],
            'grade_levels' => ['Grade 11'],
        ], $overrides));
    }

    public function test_a_principal_creates_a_template_and_assigns_it_to_grade_levels(): void
    {
        $this->createTemplate('token-a', ['grade_levels' => ['Grade 11', '  grade   12 ']])
            ->assertCreated()
            ->assertJsonPath('data.layout', 'shs_semestral')
            ->assertJsonPath('data.settings.school_subtitle', 'General Santos City Chapter')
            ->assertJsonPath('data.grade_levels', ['Grade 11', 'grade 12']);

        $this->as('token-a')->getJson('/api/report-card-templates')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('layouts.0.value', 'shs_semestral');
    }

    public function test_kinder_1_and_kinder_2_share_one_kindergarten_template(): void
    {
        $id = $this->createTemplate('token-a', [
            'name' => 'Kindergarten Progress Report',
            'layout' => 'kinder_trifold',
            'settings' => ['chapter' => 'General Santos City', 'title_style' => 'image'],
            'grade_levels' => ['Kinder 1', 'Kinder 2'],
        ])
            ->assertCreated()
            ->assertJsonPath('data.layout', 'kinder_trifold')
            ->assertJsonPath('data.grade_levels', ['Kinder 1', 'Kinder 2'])
            ->json('data.id');

        foreach (['Kinder 1', 'kinder 2'] as $gradeLevel) {
            $this->as('teacher-token-a')
                ->getJson('/api/report-card-templates/for-grade-level?grade_level='.urlencode($gradeLevel))
                ->assertOk()
                ->assertJsonPath('data.id', $id)
                ->assertJsonPath('data.settings.chapter', 'General Santos City');
        }
    }

    public function test_the_school_can_assign_the_grade_levels_its_own_sections_use(): void
    {
        foreach (['Kinder 1', 'kinder  1', 'Kinder 1', 'Kinder 2'] as $index => $gradeLevel) {
            ClassSection::create([
                'institution_id' => $this->schoolA->id,
                'grade_level' => $gradeLevel,
                'title' => 'Section '.$index,
            ]);
        }
        ClassSection::create(['institution_id' => $this->schoolB->id, 'grade_level' => 'Nursery', 'title' => 'Other']);

        $gradeLevels = $this->as('token-a')->getJson('/api/report-card-templates')
            ->assertOk()
            ->json('grade_levels');

        $this->assertContains('Kinder 1', $gradeLevels);
        $this->assertContains('Kinder 2', $gradeLevels);
        $this->assertCount(1, array_filter($gradeLevels, fn ($g) => mb_strtolower($g) === 'kinder 1'));
        $this->assertNotContains('Nursery', $gradeLevels);
    }

    public function test_a_grade_level_resolves_to_its_template_whatever_the_spelling(): void
    {
        $id = $this->createTemplate('token-a')->json('data.id');

        $this->as('teacher-token-a')
            ->getJson('/api/report-card-templates/for-grade-level?grade_level='.urlencode('grade  11'))
            ->assertOk()
            ->assertJsonPath('data.id', $id);

        $this->as('teacher-token-a')
            ->getJson('/api/report-card-templates/for-grade-level?grade_level='.urlencode('Grade 10'))
            ->assertOk()
            ->assertJsonPath('data', null);
    }

    public function test_assigning_a_grade_level_moves_it_off_the_other_template(): void
    {
        $first = $this->createTemplate('token-a')->json('data.id');
        $second = $this->createTemplate('token-a', ['name' => 'Second', 'grade_levels' => ['GRADE 11']])->json('data.id');

        $this->assertSame([], ReportCardTemplate::find($first)->gradeLevels->pluck('grade_level')->all());

        $this->as('teacher-token-a')
            ->getJson('/api/report-card-templates/for-grade-level?grade_level=Grade%2011')
            ->assertJsonPath('data.id', $second);
    }

    public function test_deleting_a_template_returns_its_grade_levels_to_the_standard_card(): void
    {
        $id = $this->createTemplate('token-a')->json('data.id');

        $this->as('token-a')->deleteJson("/api/report-card-templates/{$id}")->assertOk();

        $this->as('token-a')
            ->getJson('/api/report-card-templates/for-grade-level?grade_level=Grade%2011')
            ->assertJsonPath('data', null);
    }

    public function test_another_school_neither_sees_nor_edits_the_template(): void
    {
        $id = $this->createTemplate('token-a')->json('data.id');

        $this->as('token-b')->getJson('/api/report-card-templates')->assertOk()->assertJsonCount(0, 'data');
        $this->as('token-b')
            ->getJson('/api/report-card-templates/for-grade-level?grade_level=Grade%2011')
            ->assertJsonPath('data', null);
        $this->as('token-b')->putJson("/api/report-card-templates/{$id}", ['name' => 'Hijacked'])->assertNotFound();
        $this->as('token-b')->deleteJson("/api/report-card-templates/{$id}")->assertNotFound();

        // School B assigning its own Grade 11 leaves School A's assignment alone.
        $this->createTemplate('token-b')->assertCreated();
        $this->as('teacher-token-a')
            ->getJson('/api/report-card-templates/for-grade-level?grade_level=Grade%2011')
            ->assertJsonPath('data.id', $id);
    }

    public function test_a_teacher_without_settings_cannot_manage_templates(): void
    {
        $this->createTemplate('teacher-token-a')->assertForbidden();
    }

    public function test_an_unknown_layout_and_nested_settings_are_refused(): void
    {
        $this->createTemplate('token-a', ['layout' => 'mystery'])->assertUnprocessable();
        $this->createTemplate('token-a', ['settings' => ['school_name' => ['nested' => 'x']]])->assertUnprocessable();
    }

    public function test_a_subject_keeps_its_semester_and_report_card_category(): void
    {
        $section = ClassSection::create([
            'institution_id' => $this->schoolA->id,
            'grade_level' => 'Grade 11',
            'title' => 'HUMSS A',
        ]);

        $subject = Subject::create([
            'institution_id' => $this->schoolA->id,
            'class_section_id' => $section->id,
            'title' => 'Oral Communication in Context',
            'subject_type' => 'parent',
            'grading_type' => 'numerical',
        ]);

        $this->as('token-a')->putJson("/api/subjects/{$subject->id}", [
            'semester' => 2,
            'report_card_category' => 'specialized',
        ])->assertOk();

        $subject->refresh();
        $this->assertSame(2, $subject->semester);
        $this->assertSame('specialized', $subject->report_card_category);

        $this->as('token-a')->putJson("/api/subjects/{$subject->id}", ['semester' => 3])->assertUnprocessable();
    }
}
