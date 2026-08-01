<?php

namespace Tests\Feature;

use App\Models\ClassSection;
use App\Models\Institution;
use App\Models\Student;
use App\Models\StudentInstitution;
use App\Models\StudentRunningGrade;
use App\Models\Subject;
use App\Models\SubjectEcr;
use App\Models\SubjectEcrItem;
use App\Models\User;
use App\Models\UserInstitution;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * A grade item saved without a school year is invisible to every year-scoped
 * query, including the running-grade calculation, which then sums nothing and
 * reports a calculated grade of zero for a class whose scores are all entered.
 */
class GradeItemAcademicYearTest extends TestCase
{
    use RefreshDatabase;

    private Institution $institution;
    private Subject $subject;
    private SubjectEcr $ecr;
    private Student $student;

    protected function setUp(): void
    {
        parent::setUp();

        $this->institution = Institution::factory()->create([
            'current_academic_year' => '2020-2021',
        ]);
        $user = User::factory()->create([
            'token' => 'grade-item-year-token',
            'token_expiry' => now()->addDay()->toDateTimeString(),
        ]);
        UserInstitution::factory()->create([
            'user_id' => $user->id,
            'institution_id' => $this->institution->id,
            'is_default' => true,
            'is_main' => true,
        ]);

        $section = ClassSection::create([
            'institution_id' => $this->institution->id,
            'grade_level' => 'Grade 7',
            'title' => 'Section A',
            'academic_year' => '2026-2027',
        ]);
        $this->subject = Subject::create([
            'institution_id' => $this->institution->id,
            'class_section_id' => $section->id,
            'title' => 'Mathematics',
        ]);
        $this->ecr = SubjectEcr::create([
            'subject_id' => $this->subject->id,
            'title' => 'Written Works',
            'percentage' => 100,
        ]);

        $this->student = Student::create([
            'first_name' => 'Year',
            'last_name' => 'Learner',
            'gender' => 'male',
            'birthdate' => '2013-01-01',
            'is_active' => true,
        ]);
        StudentInstitution::create([
            'student_id' => $this->student->id,
            'institution_id' => $this->institution->id,
            'is_active' => true,
        ]);
    }

    private function createGradeItem(array $overrides = [])
    {
        return $this->withHeader('Authorization', 'Bearer grade-item-year-token')
            ->postJson('/api/subjects-ecr-items', array_merge([
                'subject_ecr_id' => $this->ecr->id,
                'type' => 'quiz',
                'title' => 'Quiz 1',
                'quarter' => '1',
                'score' => 10,
            ], $overrides));
    }

    private function postScore(string $itemId, float $score)
    {
        return $this->withHeader('Authorization', 'Bearer grade-item-year-token')
            ->postJson('/api/student-ecr-item-scores', [
                'student_id' => $this->student->id,
                'subject_ecr_item_id' => $itemId,
                'score' => $score,
            ]);
    }

    public function test_grade_item_created_without_a_year_takes_the_sections_year(): void
    {
        $itemId = $this->createGradeItem()->assertStatus(201)->json('data.id');

        $this->assertSame('2026-2027', SubjectEcrItem::find($itemId)->academic_year);
    }

    public function test_an_explicit_year_is_kept(): void
    {
        $itemId = $this->createGradeItem(['academic_year' => '2025-2026'])->assertStatus(201)->json('data.id');

        $this->assertSame('2025-2026', SubjectEcrItem::find($itemId)->academic_year);
    }

    public function test_entered_score_produces_a_running_grade_under_the_sections_year(): void
    {
        $itemId = $this->createGradeItem()->assertStatus(201)->json('data.id');

        $this->postScore($itemId, 8)->assertStatus(201);

        $runningGrades = StudentRunningGrade::where('student_id', $this->student->id)
            ->where('subject_id', $this->subject->id)
            ->get();

        $this->assertCount(1, $runningGrades, 'The score must not strand a second row under another year.');
        $this->assertSame('2026-2027', $runningGrades[0]->academic_year);
        $this->assertEquals(80, $runningGrades[0]->grade);
    }

    public function test_a_legacy_item_with_no_year_still_counts_towards_the_grade(): void
    {
        // Rows that predate the year being stamped on creation.
        $legacy = SubjectEcrItem::create([
            'subject_ecr_id' => $this->ecr->id,
            'type' => 'quiz',
            'status' => 'published',
            'title' => 'Legacy Quiz',
            'quarter' => '1',
            'academic_year' => null,
            'score' => 10,
        ]);

        $this->postScore($legacy->id, 7)->assertStatus(201);

        $runningGrade = StudentRunningGrade::where('student_id', $this->student->id)
            ->where('subject_id', $this->subject->id)
            ->firstOrFail();

        $this->assertSame('2026-2027', $runningGrade->academic_year);
        $this->assertEquals(70, $runningGrade->grade);
    }
}
