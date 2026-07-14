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

class AssessmentMultiImageAnswerTest extends TestCase
{
    use RefreshDatabase;

    private User $user;
    private Institution $institution;
    private ClassSection $section;
    private Subject $subject;
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

        $this->section = ClassSection::create([
            'institution_id' => $this->institution->id,
            'grade_level' => 'Grade 1',
            'title' => 'Section A',
            'academic_year' => '2026-2027',
        ]);
        $this->subject = Subject::create([
            'institution_id' => $this->institution->id,
            'class_section_id' => $this->section->id,
            'title' => 'Science',
        ]);
        $ecr = SubjectEcr::create([
            'subject_id' => $this->subject->id,
            'title' => 'Activities',
            'percentage' => 100,
        ]);
        $this->item = SubjectEcrItem::create([
            'subject_ecr_id' => $ecr->id,
            'type' => 'activity',
            'status' => 'published',
            'title' => 'Plant Photos',
            'quarter' => '1',
            'academic_year' => '2026-2027',
            'score' => 5,
            'content' => [
                'questions' => [
                    ['type' => 'image_upload', 'question' => 'Upload photos of your plant.', 'points' => 5],
                ],
            ],
        ]);
    }

    private function makeStudent(): Student
    {
        $student = Student::create([
            'first_name' => 'Alice',
            'last_name' => 'Student',
            'gender' => 'female',
            'birthdate' => '2012-01-01',
            'is_active' => true,
        ]);
        StudentSection::create([
            'student_id' => $student->id,
            'section_id' => $this->section->id,
            'academic_year' => '2026-2027',
            'is_active' => true,
        ]);
        return $student;
    }

    public function test_submissions_view_returns_each_image_in_a_multi_upload_answer(): void
    {
        $student = $this->makeStudent();
        $uploads = [
            ['path' => 'inst/student/1/q0/a.jpg', 'url' => 'stale-url-a', 'name' => 'a.jpg', 'mime' => 'image/jpeg', 'size' => 100],
            ['path' => 'inst/student/1/q0/b.jpg', 'url' => 'stale-url-b', 'name' => 'b.jpg', 'mime' => 'image/jpeg', 'size' => 200],
        ];
        StudentAssessmentAttempt::create([
            'student_id' => $student->id,
            'subject_ecr_item_id' => $this->item->id,
            'started_at' => now()->subMinutes(10),
            'submitted_at' => now()->subMinutes(5),
            'answers' => ['0' => $uploads],
            'score' => 0,
            'max_score' => 5,
        ]);

        $response = $this->withHeader('Authorization', 'Bearer test-token')
            ->getJson("/api/assessment-methods/{$this->item->id}/submissions")
            ->assertOk();

        $answer = $response->json('data.submissions.0.per_question.0.answer');
        $this->assertIsArray($answer);
        $this->assertCount(2, $answer);
        $this->assertSame('inst/student/1/q0/a.jpg', $answer[0]['path']);
        $this->assertSame('a.jpg', $answer[0]['name']);
        $this->assertSame('inst/student/1/q0/b.jpg', $answer[1]['path']);
        // URL is refreshed from the stored path, not the stale value captured at upload time.
        $this->assertNotSame('stale-url-a', $answer[0]['url'] ?? 'stale-url-a');
    }

    public function test_submissions_view_still_returns_legacy_single_upload_answer(): void
    {
        $student = $this->makeStudent();
        StudentAssessmentAttempt::create([
            'student_id' => $student->id,
            'subject_ecr_item_id' => $this->item->id,
            'started_at' => now()->subMinutes(10),
            'submitted_at' => now()->subMinutes(5),
            'answers' => ['0' => ['path' => 'inst/student/1/q0/only.jpg', 'url' => 'stale', 'name' => 'only.jpg', 'mime' => 'image/jpeg', 'size' => 100]],
            'score' => 0,
            'max_score' => 5,
        ]);

        $response = $this->withHeader('Authorization', 'Bearer test-token')
            ->getJson("/api/assessment-methods/{$this->item->id}/submissions")
            ->assertOk();

        $answer = $response->json('data.submissions.0.per_question.0.answer');
        $this->assertIsArray($answer);
        $this->assertSame('inst/student/1/q0/only.jpg', $answer['path']);
        $this->assertSame('only.jpg', $answer['name']);
    }
}
