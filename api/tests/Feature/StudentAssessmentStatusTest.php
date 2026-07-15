<?php

namespace Tests\Feature;

use App\Models\ClassSection;
use App\Models\Institution;
use App\Models\Student;
use App\Models\StudentAssessmentAttempt;
use App\Models\StudentSection;
use App\Models\Subject;
use App\Models\SubjectEcr;
use App\Models\SubjectEcrItem;
use App\Models\User;
use App\Models\UserInstitution;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Regression: a submitted assessment must report attempt_status 'submitted'
 * even when the student still has retakes left (quizzes default to 3 attempts).
 * Previously it reported 'not_started', so the portal showed "Take assessment"
 * for work the student had already turned in.
 */
class StudentAssessmentStatusTest extends TestCase
{
    use RefreshDatabase;

    private User $user;
    private Student $student;
    private SubjectEcr $ecr;

    protected function setUp(): void
    {
        parent::setUp();

        $institution = Institution::factory()->create();
        $this->user = User::factory()->create([
            'token' => 'test-token',
            'token_expiry' => now()->addDay()->toDateTimeString(),
        ]);
        UserInstitution::factory()->create([
            'user_id' => $this->user->id,
            'institution_id' => $institution->id,
            'is_default' => true,
            'is_main' => true,
        ]);

        $section = ClassSection::create([
            'institution_id' => $institution->id,
            'grade_level' => 'Grade 1',
            'title' => 'Section A',
            'academic_year' => '2026-2027',
        ]);
        $subject = Subject::create([
            'institution_id' => $institution->id,
            'class_section_id' => $section->id,
            'title' => 'Science',
        ]);
        $this->ecr = SubjectEcr::create([
            'subject_id' => $subject->id,
            'title' => 'Quizzes',
            'percentage' => 100,
        ]);

        $this->student = Student::create([
            'user_id' => $this->user->id,
            'first_name' => 'Alice',
            'last_name' => 'Student',
            'gender' => 'female',
            'birthdate' => '2012-01-01',
            'is_active' => true,
        ]);
        StudentSection::create([
            'student_id' => $this->student->id,
            'section_id' => $section->id,
            'academic_year' => '2026-2027',
            'is_active' => true,
        ]);
    }

    private function makeItem(string $type, array $settings = []): SubjectEcrItem
    {
        return SubjectEcrItem::create([
            'subject_ecr_id' => $this->ecr->id,
            'type' => $type,
            'status' => 'published',
            'title' => ucfirst($type) . ' 1',
            'quarter' => '1',
            'academic_year' => '2026-2027',
            'score' => 1,
            'settings' => $settings ?: null,
            'content' => [
                'questions' => [
                    ['type' => 'true_false', 'question' => 'The sky is blue.', 'answer' => 'True', 'points' => 1],
                ],
            ],
        ]);
    }

    private function submitAttempt(SubjectEcrItem $item): StudentAssessmentAttempt
    {
        return StudentAssessmentAttempt::create([
            'student_id' => $this->student->id,
            'subject_ecr_item_id' => $item->id,
            'started_at' => now()->subMinutes(10),
            'submitted_at' => now()->subMinutes(5),
            'answers' => ['0' => 'True'],
            'score' => 1,
            'max_score' => 1,
        ]);
    }

    public function test_list_reports_submitted_when_retakes_remain(): void
    {
        $item = $this->makeItem('quiz'); // quizzes default to 3 attempts
        $this->submitAttempt($item);

        $row = $this->withHeader('Authorization', 'Bearer test-token')
            ->getJson('/api/student-assessments')
            ->assertOk()
            ->json('data.0');

        $this->assertSame('submitted', $row['attempt_status']);
        $this->assertTrue($row['can_retake']);
        $this->assertSame(1, $row['attempts_used']);
        $this->assertSame(3, $row['attempts_allowed']);
        $this->assertEquals(1, $row['attempt_score']);
    }

    public function test_show_reports_submitted_when_retakes_remain(): void
    {
        $item = $this->makeItem('quiz');
        $this->submitAttempt($item);

        $data = $this->withHeader('Authorization', 'Bearer test-token')
            ->getJson("/api/student-assessments/{$item->id}")
            ->assertOk()
            ->json('data');

        $this->assertSame('submitted', $data['attempt_status']);
        $this->assertTrue($data['can_retake']);
        $this->assertNotNull($data['attempt']);
        $this->assertEquals(1, $data['attempt']['score']);
    }

    public function test_exam_reports_submitted_with_no_retake(): void
    {
        $item = $this->makeItem('exam');
        $this->submitAttempt($item);

        $row = $this->withHeader('Authorization', 'Bearer test-token')
            ->getJson('/api/student-assessments')
            ->assertOk()
            ->json('data.0');

        $this->assertSame('submitted', $row['attempt_status']);
        $this->assertFalse($row['can_retake']);
    }

    public function test_in_progress_retake_wins_over_earlier_submission(): void
    {
        $item = $this->makeItem('quiz');
        $this->submitAttempt($item);
        StudentAssessmentAttempt::create([
            'student_id' => $this->student->id,
            'subject_ecr_item_id' => $item->id,
            'started_at' => now(),
            'submitted_at' => null,
            'answers' => [],
            'score' => null,
            'max_score' => 1,
        ]);

        $row = $this->withHeader('Authorization', 'Bearer test-token')
            ->getJson('/api/student-assessments')
            ->assertOk()
            ->json('data.0');

        $this->assertSame('in_progress', $row['attempt_status']);
    }

    public function test_untaken_assessment_reports_not_started(): void
    {
        $this->makeItem('quiz');

        $row = $this->withHeader('Authorization', 'Bearer test-token')
            ->getJson('/api/student-assessments')
            ->assertOk()
            ->json('data.0');

        $this->assertSame('not_started', $row['attempt_status']);
    }
}
