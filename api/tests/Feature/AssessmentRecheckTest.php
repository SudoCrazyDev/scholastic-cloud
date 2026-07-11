<?php

namespace Tests\Feature;

use App\Models\ClassSection;
use App\Models\Institution;
use App\Models\Student;
use App\Models\StudentAssessmentAttempt;
use App\Models\StudentEcrItemScore;
use App\Models\Subject;
use App\Models\SubjectEcr;
use App\Models\SubjectEcrItem;
use App\Models\User;
use App\Models\UserInstitution;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AssessmentRecheckTest extends TestCase
{
    use RefreshDatabase;

    private User $user;
    private Institution $institution;
    private Student $student;
    private SubjectEcrItem $item;

    protected function setUp(): void
    {
        parent::setUp();

        $this->institution = Institution::factory()->create();
        $this->user = User::factory()->create([
            'token' => 'test-token',
            'token_expiry' => now()->addDay()->toDateTimeString(),
        ]);
        UserInstitution::factory()->create([
            'user_id' => $this->user->id,
            'institution_id' => $this->institution->id,
            'is_default' => true,
            'is_main' => true,
        ]);

        $this->student = Student::create([
            'first_name' => 'Test',
            'last_name' => 'Student',
            'gender' => 'male',
            'birthdate' => '2012-01-01',
            'is_active' => true,
        ]);

        $section = ClassSection::create([
            'institution_id' => $this->institution->id,
            'grade_level' => 'Grade 1',
            'title' => 'Section A',
            'academic_year' => '2026-2027',
        ]);
        $subject = Subject::create([
            'institution_id' => $this->institution->id,
            'class_section_id' => $section->id,
            'title' => 'Mathematics',
        ]);
        $ecr = SubjectEcr::create([
            'subject_id' => $subject->id,
            'title' => 'Quizzes',
            'percentage' => 100,
        ]);
        $this->item = SubjectEcrItem::create([
            'subject_ecr_id' => $ecr->id,
            'type' => 'quiz',
            'status' => 'published',
            'title' => 'Shapes Quiz',
            'quarter' => '1',
            'academic_year' => '2026-2027',
            'score' => 1,
            'content' => [
                'questions' => [
                    ['type' => 'fill_in_the_blanks', 'question' => 'A circle has ___ sides.', 'blanks' => ['0'], 'points' => 1],
                ],
            ],
        ]);
    }

    private function makeAttempt(float $storedScore): StudentAssessmentAttempt
    {
        return StudentAssessmentAttempt::create([
            'student_id' => $this->student->id,
            'subject_ecr_item_id' => $this->item->id,
            'started_at' => now()->subMinutes(10),
            'submitted_at' => now()->subMinutes(5),
            'answers' => ['0' => ['0']],
            'score' => $storedScore,
            'max_score' => 1,
        ]);
    }

    private function postRecheck()
    {
        return $this->withHeader('Authorization', 'Bearer test-token')
            ->postJson("/api/assessment-methods/{$this->item->id}/submissions/recheck");
    }

    public function test_recheck_updates_stale_scores_and_ecr_item_score(): void
    {
        // Simulate an attempt graded before a scoring fix: answer is correct, stored score is 0.
        $attempt = $this->makeAttempt(0);
        StudentEcrItemScore::create([
            'student_id' => $this->student->id,
            'subject_ecr_item_id' => $this->item->id,
            'score' => 0,
        ]);

        $response = $this->postRecheck();

        $response->assertOk()
            ->assertJsonPath('data.updated', 1)
            ->assertJsonPath('data.total', 1);

        $this->assertEquals(1.0, (float) $attempt->fresh()->score);
        $this->assertEquals(1.0, (float) StudentEcrItemScore::where('student_id', $this->student->id)
            ->where('subject_ecr_item_id', $this->item->id)
            ->value('score'));
    }

    public function test_recheck_reports_zero_updates_when_scores_already_correct(): void
    {
        $this->makeAttempt(1);

        $response = $this->postRecheck();

        $response->assertOk()
            ->assertJsonPath('data.updated', 0)
            ->assertJsonPath('data.total', 1);
    }

    public function test_recheck_requires_item_from_own_institution(): void
    {
        $otherInstitution = Institution::factory()->create();
        $otherSection = ClassSection::create([
            'institution_id' => $otherInstitution->id,
            'grade_level' => 'Grade 1',
            'title' => 'Section B',
            'academic_year' => '2026-2027',
        ]);
        $otherSubject = Subject::create([
            'institution_id' => $otherInstitution->id,
            'class_section_id' => $otherSection->id,
            'title' => 'Science',
        ]);
        $otherEcr = SubjectEcr::create([
            'subject_id' => $otherSubject->id,
            'title' => 'Quizzes',
            'percentage' => 100,
        ]);
        $otherItem = SubjectEcrItem::create([
            'subject_ecr_id' => $otherEcr->id,
            'type' => 'quiz',
            'status' => 'published',
            'title' => 'Foreign Quiz',
            'quarter' => '1',
            'academic_year' => '2026-2027',
            'score' => 1,
            'content' => ['questions' => []],
        ]);

        $response = $this->withHeader('Authorization', 'Bearer test-token')
            ->postJson("/api/assessment-methods/{$otherItem->id}/submissions/recheck");

        $response->assertStatus(403);
    }
}
