<?php

namespace Tests\Feature;

use App\Models\AssessmentQuestion;
use App\Models\ClassSection;
use App\Models\Institution;
use App\Models\Role;
use App\Models\Student;
use App\Models\StudentAssessmentAttempt;
use App\Models\StudentSection;
use App\Models\Subject;
use App\Models\SubjectEcr;
use App\Models\SubjectEcrItem;
use App\Models\Topic;
use App\Models\User;
use App\Models\UserInstitution;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Teaching Activity — the principal's view of what teachers have put up and
 * what students have handed in.
 *
 * The cases that matter here are the ones where a number would libel somebody:
 * an assessment counted in a submission denominator that no student could ever
 * submit, a lesson credited to the wrong teacher, or another school's staff
 * appearing in this school's list.
 */
class TeachingActivityMonitorTest extends TestCase
{
    use RefreshDatabase;

    private const YEAR = '2026-2027';

    private Institution $school;

    private Institution $otherSchool;

    private User $principal;

    private User $teacher;

    private ClassSection $section;

    protected function setUp(): void
    {
        parent::setUp();

        $this->school = Institution::factory()->create([
            'title' => 'Monitor High',
            'current_academic_year' => self::YEAR,
        ]);
        $this->otherSchool = Institution::factory()->create(['title' => 'Other High']);

        $this->principal = $this->makeUser('principal@monitor.test', 'principal-token', $this->school, 'principal');
        $this->teacher = $this->makeUser('teacher@monitor.test', 'teacher-token', $this->school, 'subject-teacher');

        $this->section = $this->makeSection($this->school, 'Grade 7', 'Rizal');
    }

    // ── Fixture helpers ─────────────────────────────────────────────────────

    private function makeUser(string $email, string $token, Institution $institution, string $roleSlug): User
    {
        // Role::booted() syncs the built-in permission set for a known slug,
        // so these roles hold exactly what the real ones do.
        $role = Role::firstOrCreate(
            ['slug' => $roleSlug, 'institution_id' => null],
            ['title' => ucfirst($roleSlug), 'is_system' => true],
        );

        $user = User::factory()->create([
            'first_name' => ucfirst(explode('@', $email)[0]),
            'last_name' => 'Monitor',
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

    private function makeSection(Institution $institution, string $gradeLevel, string $title): ClassSection
    {
        return ClassSection::create([
            'institution_id' => $institution->id,
            'grade_level' => $gradeLevel,
            'title' => $title,
            'academic_year' => self::YEAR,
        ]);
    }

    private function makeSubject(ClassSection $section, string $title, ?User $adviser): Subject
    {
        return Subject::create([
            'institution_id' => $section->institution_id,
            'class_section_id' => $section->id,
            'title' => $title,
            'adviser' => $adviser?->id,
        ]);
    }

    private function makeStudent(ClassSection $section, string $firstName): Student
    {
        $student = Student::create([
            'first_name' => $firstName,
            'last_name' => 'Learner',
            'gender' => 'female',
            'birthdate' => '2012-05-05',
            'is_active' => true,
        ]);

        StudentSection::create([
            'student_id' => $student->id,
            'section_id' => $section->id,
            'academic_year' => self::YEAR,
            'is_active' => true,
        ]);

        return $student;
    }

    /**
     * A lesson with `$fileCount` uploaded attachments plus a rich-text block,
     * shaped exactly as the lesson editor stores it.
     */
    private function makeLesson(Subject $subject, string $title, ?User $creator, int $fileCount = 0, bool $published = true): Topic
    {
        $blocks = [['id' => 'b0', 'type' => 'rich_text', 'html' => '<p>Read the chapter.</p>']];

        for ($i = 0; $i < $fileCount; $i++) {
            $blocks[] = [
                'id' => 'f'.$i,
                'type' => 'file',
                'path' => $subject->institution_id.'/subjects/'.$subject->id.'/lessons/handout-'.$i.'.pdf',
                'url' => 'https://example.test/handout-'.$i.'.pdf',
                'name' => 'Handout '.$i.'.pdf',
                'mime' => 'application/pdf',
                'size' => 1024,
            ];
        }

        $topic = new Topic([
            'subject_id' => $subject->id,
            'quarter' => '1',
            'title' => $title,
            'content' => $blocks,
            'order' => 1,
            'is_published' => $published,
        ]);
        $topic->created_by_user_id = $creator?->id;
        $topic->save();

        return $topic;
    }

    /**
     * @param  array<int, array<string, mixed>>  $questions
     */
    private function makeAssessment(
        Subject $subject,
        string $title,
        ?User $creator,
        array $questions = [],
        string $status = 'published'
    ): SubjectEcrItem {
        $ecr = SubjectEcr::firstOrCreate(
            ['subject_id' => $subject->id, 'title' => 'Written Works'],
            ['percentage' => 100],
        );

        $item = new SubjectEcrItem([
            'subject_ecr_id' => $ecr->id,
            'type' => 'quiz',
            'status' => $status,
            'title' => $title,
            'quarter' => '1',
            'academic_year' => self::YEAR,
            'score' => 10,
            'content' => $questions === [] ? [] : ['questions' => $questions],
        ]);
        $item->created_by_user_id = $creator?->id;
        $item->save();

        return $item;
    }

    private function submit(Student $student, SubjectEcrItem $item): StudentAssessmentAttempt
    {
        return StudentAssessmentAttempt::create([
            'student_id' => $student->id,
            'subject_ecr_item_id' => $item->id,
            'started_at' => now()->subMinutes(20),
            'submitted_at' => now()->subMinutes(5),
            'answers' => ['0' => 'A'],
            'score' => 8,
            'max_score' => 10,
        ]);
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function oneQuestion(): array
    {
        return [['type' => 'single_choice', 'question' => 'Pick one.', 'choices' => ['A', 'B'], 'answer' => 'A', 'points' => 10]];
    }

    private function overview(array $query = [])
    {
        return $this->withHeader('Authorization', 'Bearer principal-token')
            ->getJson('/api/teaching-activity/overview'.($query ? '?'.http_build_query($query) : ''));
    }

    // ── Cases ───────────────────────────────────────────────────────────────

    public function test_overview_reports_each_teachers_lessons_uploads_and_assessments(): void
    {
        $subject = $this->makeSubject($this->section, 'Mathematics 7', $this->teacher);
        $this->makeLesson($subject, 'Fractions', $this->teacher, fileCount: 2);
        $this->makeLesson($subject, 'Decimals (draft)', $this->teacher, fileCount: 1, published: false);
        $this->makeAssessment($subject, 'Quiz 1', $this->teacher, $this->oneQuestion());

        $response = $this->overview()->assertOk();

        $row = collect($response->json('data.teachers'))->firstWhere('user_id', $this->teacher->id);

        $this->assertNotNull($row, 'The subject teacher should have a row.');
        $this->assertSame(1, $row['subjects_count']);
        $this->assertSame(2, $row['lessons']['total']);
        $this->assertSame(1, $row['lessons']['published']);
        $this->assertSame(3, $row['lessons']['files'], 'Both lessons\' attachments should be counted.');
        $this->assertSame(2, $row['lessons']['with_files'], 'Both lessons carry at least one file.');
        $this->assertSame(1, $row['assessments']['total']);
        $this->assertSame(1, $row['assessments']['with_questions']);
        $this->assertSame('recorded', $row['attribution']);

        $this->assertSame(3, $response->json('data.totals.lesson_files'));
        $this->assertSame(self::YEAR, $response->json('data.academic_year'));
    }

    public function test_submission_rate_counts_only_published_assessments_with_questions(): void
    {
        $subject = $this->makeSubject($this->section, 'Science 7', $this->teacher);
        $alice = $this->makeStudent($this->section, 'Alice');
        $bob = $this->makeStudent($this->section, 'Bob');
        $this->makeStudent($this->section, 'Carol');

        $quiz = $this->makeAssessment($subject, 'Quiz 1', $this->teacher, $this->oneQuestion());
        $this->submit($alice, $quiz);
        $this->submit($bob, $quiz);

        // Neither of these can be submitted online, so neither belongs in the
        // denominator: a paper task recorded as a gradebook column, and a quiz
        // still in draft.
        $this->makeAssessment($subject, 'Recitation (paper)', $this->teacher);
        $this->makeAssessment($subject, 'Quiz 2 (draft)', $this->teacher, $this->oneQuestion(), status: 'draft');

        $row = collect($this->overview()->assertOk()->json('data.teachers'))
            ->firstWhere('user_id', $this->teacher->id);

        $this->assertSame(3, $row['submissions']['expected'], 'Three students, one online quiz.');
        $this->assertSame(2, $row['submissions']['received']);
        $this->assertSame(66.7, $row['submissions']['rate']);
        $this->assertSame(3, $row['assessments']['total']);
        $this->assertSame(1, $row['assessments']['online']);
        $this->assertSame(
            1,
            $row['assessments']['published_without_questions'],
            'The paper task is published with nothing to answer, which is reported on its own.'
        );
    }

    public function test_a_teacher_who_has_posted_nothing_still_appears(): void
    {
        $this->makeSubject($this->section, 'Filipino 7', $this->teacher);

        $row = collect($this->overview()->assertOk()->json('data.teachers'))
            ->firstWhere('user_id', $this->teacher->id);

        $this->assertNotNull($row, 'An empty row is the point of the screen.');
        $this->assertSame(0, $row['lessons']['total']);
        $this->assertSame(0, $row['assessments']['total']);
        $this->assertNull($row['submissions']['rate']);
        $this->assertSame(1, $row['empty_subjects']['lessons']);
        $this->assertSame(1, $this->overview()->json('data.totals.teachers_with_nothing'));
    }

    public function test_a_lesson_with_no_recorded_creator_is_credited_to_the_adviser_and_flagged(): void
    {
        $subject = $this->makeSubject($this->section, 'English 7', $this->teacher);
        $this->makeLesson($subject, 'Legacy lesson', creator: null, fileCount: 1);

        $row = collect($this->overview()->assertOk()->json('data.teachers'))
            ->firstWhere('user_id', $this->teacher->id);

        $this->assertSame(1, $row['lessons']['total']);
        $this->assertSame(
            'adviser',
            $row['attribution'],
            'A guess has to be labelled as one — nobody watched this teacher write it.'
        );
    }

    public function test_a_recorded_creator_is_credited_instead_of_the_adviser(): void
    {
        $cover = $this->makeUser('cover@monitor.test', 'cover-token', $this->school, 'subject-teacher');
        $subject = $this->makeSubject($this->section, 'Values 7', $this->teacher);

        $this->makeLesson($subject, 'Covered lesson', $cover);

        $rows = collect($this->overview()->assertOk()->json('data.teachers'));

        $this->assertSame(1, $rows->firstWhere('user_id', $cover->id)['lessons']['total']);
        $this->assertSame(
            0,
            $rows->firstWhere('user_id', $this->teacher->id)['lessons']['total'],
            'The adviser did not write it, so it is not theirs.'
        );
    }

    public function test_v2_assessments_count_their_question_rows(): void
    {
        $subject = $this->makeSubject($this->section, 'MAPEH 7', $this->teacher);
        $this->makeStudent($this->section, 'Alice');

        $item = $this->makeAssessment($subject, 'Quiz v2', $this->teacher);
        $item->forceFill(['content_version' => 2])->save();
        AssessmentQuestion::create([
            'subject_ecr_item_id' => $item->id,
            'position' => 0,
            'type' => 'essay',
            'question' => 'Explain rhythm.',
            'points' => 10,
            'config' => [],
        ]);

        $row = collect($this->overview()->assertOk()->json('data.teachers'))
            ->firstWhere('user_id', $this->teacher->id);

        $this->assertSame(1, $row['assessments']['with_questions']);
        $this->assertSame(1, $row['submissions']['expected'], 'A v2 quiz with a question is takeable.');
    }

    public function test_another_schools_teachers_and_work_are_never_reported(): void
    {
        $outsider = $this->makeUser('outsider@monitor.test', 'outsider-token', $this->otherSchool, 'subject-teacher');
        $otherSection = $this->makeSection($this->otherSchool, 'Grade 8', 'Bonifacio');
        $otherSubject = $this->makeSubject($otherSection, 'Mathematics 8', $outsider);
        $this->makeLesson($otherSubject, 'Their lesson', $outsider, fileCount: 3);
        $this->makeAssessment($otherSubject, 'Their quiz', $outsider, $this->oneQuestion());

        $response = $this->overview()->assertOk();

        $this->assertNull(
            collect($response->json('data.teachers'))->firstWhere('user_id', $outsider->id),
            'A teacher from another school must not appear.'
        );
        $this->assertSame(0, $response->json('data.totals.lesson_files'));
        $this->assertSame(0, $response->json('data.totals.assessments'));

        $this->withHeader('Authorization', 'Bearer principal-token')
            ->getJson("/api/teaching-activity/teachers/{$outsider->id}")
            ->assertNotFound();
    }

    public function test_a_role_without_the_module_is_refused(): void
    {
        $this->withHeader('Authorization', 'Bearer teacher-token')
            ->getJson('/api/teaching-activity/overview')
            ->assertForbidden()
            ->assertJsonPath('required_permission', 'teaching-activity.view');
    }

    public function test_quarter_filter_narrows_to_that_grading_period(): void
    {
        $subject = $this->makeSubject($this->section, 'TLE 7', $this->teacher);
        $this->makeLesson($subject, 'Quarter 1 lesson', $this->teacher);
        $second = $this->makeLesson($subject, 'Quarter 2 lesson', $this->teacher);
        $second->forceFill(['quarter' => '2'])->save();

        $row = collect($this->overview(['quarter' => '2'])->assertOk()->json('data.teachers'))
            ->firstWhere('user_id', $this->teacher->id);

        $this->assertSame(1, $row['lessons']['total']);
    }

    public function test_assessment_submissions_names_the_students_who_have_not_submitted(): void
    {
        $subject = $this->makeSubject($this->section, 'Araling Panlipunan 7', $this->teacher);
        $alice = $this->makeStudent($this->section, 'Alice');
        $this->makeStudent($this->section, 'Bob');

        $item = $this->makeAssessment($subject, 'Quiz 1', $this->teacher, $this->oneQuestion());
        $this->submit($alice, $item);

        $response = $this->withHeader('Authorization', 'Bearer principal-token')
            ->getJson("/api/teaching-activity/assessments/{$item->id}/submissions")
            ->assertOk();

        $this->assertSame(2, $response->json('data.submissions.expected'));
        $this->assertSame(1, $response->json('data.submissions.received'));
        $this->assertSame(1, $response->json('data.submissions.not_started'));

        $students = collect($response->json('data.students'));
        $this->assertSame('submitted', $students->firstWhere('name', 'Alice Learner')['status']);
        $this->assertSame(
            'not_started',
            $students->firstWhere('name', 'Bob Learner')['status'],
            'A student who never opened it has to be a row, not an absence.'
        );
    }

    public function test_teacher_detail_lists_the_files_attached_to_each_lesson(): void
    {
        $subject = $this->makeSubject($this->section, 'Science 7', $this->teacher);
        $this->makeLesson($subject, 'Photosynthesis', $this->teacher, fileCount: 2);

        $response = $this->withHeader('Authorization', 'Bearer principal-token')
            ->getJson("/api/teaching-activity/teachers/{$this->teacher->id}")
            ->assertOk();

        $lesson = collect($response->json('data.lessons'))->firstWhere('title', 'Photosynthesis');

        $this->assertCount(2, $lesson['files']);
        $this->assertSame('Handout 0.pdf', $lesson['files'][0]['name']);
        $this->assertNotNull($lesson['files'][0]['url'], 'A file the principal cannot open is not evidence of anything.');
        $this->assertSame(1, $response->json('data.teacher.lessons.total'));
    }

    public function test_creating_a_lesson_records_who_made_it(): void
    {
        $subject = $this->makeSubject($this->section, 'Music 7', $this->teacher);

        $this->withHeader('Authorization', 'Bearer teacher-token')
            ->postJson('/api/topics', [
                'subject_id' => $subject->id,
                'title' => 'Time signatures',
                'quarter' => '1',
            ])
            ->assertCreated();

        $this->assertSame(
            $this->teacher->id,
            Topic::where('title', 'Time signatures')->value('created_by_user_id')
        );
    }

    public function test_a_client_cannot_credit_a_lesson_to_someone_else(): void
    {
        $subject = $this->makeSubject($this->section, 'Art 7', $this->teacher);

        $this->withHeader('Authorization', 'Bearer teacher-token')
            ->postJson('/api/topics', [
                'subject_id' => $subject->id,
                'title' => 'Colour theory',
                'created_by_user_id' => $this->principal->id,
            ])
            ->assertCreated();

        $this->assertSame(
            $this->teacher->id,
            Topic::where('title', 'Colour theory')->value('created_by_user_id'),
            'Attribution comes from the session, never from the request body.'
        );
    }
}
