<?php

namespace Tests\Feature;

use App\Models\ClassSection;
use App\Models\Institution;
use App\Models\Student;
use App\Models\StudentAssessmentAttempt;
use App\Models\StudentSection;
use App\Models\StudentSubject;
use App\Models\Subject;
use App\Models\SubjectEcr;
use App\Models\SubjectEcrItem;
use App\Models\User;
use App\Models\UserInstitution;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AssessmentSubmissionsProgressTest extends TestCase
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
            'title' => 'Mathematics',
        ]);
        $ecr = SubjectEcr::create([
            'subject_id' => $this->subject->id,
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

    private function makeStudent(string $firstName, bool $activeInSection = true): Student
    {
        $student = Student::create([
            'first_name' => $firstName,
            'last_name' => 'Student',
            'gender' => 'male',
            'birthdate' => '2012-01-01',
            'is_active' => true,
        ]);
        StudentSection::create([
            'student_id' => $student->id,
            'section_id' => $this->section->id,
            'academic_year' => '2026-2027',
            'is_active' => $activeInSection,
        ]);
        return $student;
    }

    private function submitAttempt(Student $student): StudentAssessmentAttempt
    {
        return StudentAssessmentAttempt::create([
            'student_id' => $student->id,
            'subject_ecr_item_id' => $this->item->id,
            'started_at' => now()->subMinutes(10),
            'submitted_at' => now()->subMinutes(5),
            'answers' => ['0' => ['0']],
            'score' => 1,
            'max_score' => 1,
        ]);
    }

    private function getSubmissions()
    {
        return $this->withHeader('Authorization', 'Bearer test-token')
            ->getJson("/api/assessment-methods/{$this->item->id}/submissions");
    }

    public function test_progress_counts_distinct_submitters_over_active_section_students(): void
    {
        $alice = $this->makeStudent('Alice');
        $this->makeStudent('Bob');
        $this->makeStudent('Carol');
        $this->makeStudent('Dropped', activeInSection: false);

        // Two attempts by the same student count once.
        $this->submitAttempt($alice);
        $this->submitAttempt($alice);

        $this->getSubmissions()
            ->assertOk()
            ->assertJsonPath('data.progress.submitted', 1)
            ->assertJsonPath('data.progress.total_students', 3);
    }

    public function test_progress_uses_explicit_assignments_for_limited_subjects(): void
    {
        $this->subject->update(['is_limited_student' => true]);

        $alice = $this->makeStudent('Alice');
        $bob = $this->makeStudent('Bob');
        $this->makeStudent('NotAssigned');

        foreach ([$alice, $bob] as $student) {
            StudentSubject::create([
                'student_id' => $student->id,
                'subject_id' => $this->subject->id,
                'academic_year' => '2026-2027',
                'is_active' => true,
            ]);
        }

        $this->submitAttempt($alice);

        $this->getSubmissions()
            ->assertOk()
            ->assertJsonPath('data.progress.submitted', 1)
            ->assertJsonPath('data.progress.total_students', 2);
    }
}
