<?php

namespace Tests\Feature;

use App\Models\ClassSection;
use App\Models\GradingScale;
use App\Models\Institution;
use App\Models\Subject;
use App\Models\User;
use App\Models\UserInstitution;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Regression: PUT /subjects/{id} used to null `adviser` whenever the request
 * omitted the field. The grading-type switch on assigned-subjects/:id sends a
 * partial body, so flipping a subject to Non-Numerical unassigned its teacher —
 * the subject then vanished from that teacher's "My Assigned Subjects" list and
 * they could no longer build assessment methods or lessons for it.
 */
class SubjectAdviserPreservedTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private User $teacher;

    private Subject $subject;

    private GradingScale $scale;

    protected function setUp(): void
    {
        parent::setUp();

        $institution = Institution::factory()->create();

        $this->admin = User::factory()->create([
            'email' => 'admin.adviser-test@example.com',
            'token' => 'admin-token',
            'token_expiry' => now()->addDay()->toDateTimeString(),
        ]);
        UserInstitution::factory()->create([
            'user_id' => $this->admin->id,
            'institution_id' => $institution->id,
            'is_default' => true,
            'is_main' => true,
        ]);

        $this->teacher = User::factory()->create(['email' => 'teacher.adviser-test@example.com']);

        $section = ClassSection::create([
            'institution_id' => $institution->id,
            'grade_level' => 'Grade 7',
            'title' => 'Section A',
            'academic_year' => '2026-2027',
        ]);

        $this->subject = Subject::create([
            'institution_id' => $institution->id,
            'class_section_id' => $section->id,
            'title' => 'Araling Panlipunan 7',
            'adviser' => $this->teacher->id,
        ]);

        $this->scale = GradingScale::create([
            'institution_id' => $institution->id,
            'name' => 'Letter grades',
        ]);
    }

    public function test_switching_to_non_numerical_keeps_the_subject_teacher(): void
    {
        $response = $this->withHeader('Authorization', 'Bearer admin-token')
            ->putJson("/api/subjects/{$this->subject->id}", [
                'grading_type' => 'non_numerical',
                'grading_scale_id' => $this->scale->id,
            ]);

        $response->assertOk();

        $this->subject->refresh();
        $this->assertSame('non_numerical', $this->subject->grading_type);
        $this->assertSame($this->scale->id, $this->subject->grading_scale_id);
        $this->assertSame($this->teacher->id, $this->subject->adviser);
    }

    public function test_the_subject_stays_in_the_teachers_assigned_subjects(): void
    {
        $this->withHeader('Authorization', 'Bearer admin-token')
            ->putJson("/api/subjects/{$this->subject->id}", [
                'grading_type' => 'non_numerical',
                'grading_scale_id' => $this->scale->id,
            ])->assertOk();

        $this->teacher->forceFill([
            'token' => 'teacher-token',
            'token_expiry' => now()->addDay()->toDateTimeString(),
        ])->save();

        $response = $this->withHeader('Authorization', 'Bearer teacher-token')
            ->getJson('/api/users/my/subjects');

        $response->assertOk();
        $this->assertContains(
            $this->subject->id,
            collect($response->json('data'))->pluck('id')->all()
        );
    }

    public function test_an_explicitly_empty_adviser_still_clears_it(): void
    {
        $this->withHeader('Authorization', 'Bearer admin-token')
            ->putJson("/api/subjects/{$this->subject->id}", [
                'title' => 'Araling Panlipunan 7',
                'adviser' => '',
            ])->assertOk();

        $this->assertNull($this->subject->refresh()->adviser);
    }
}
