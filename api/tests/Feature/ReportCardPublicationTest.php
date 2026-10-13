<?php

namespace Tests\Feature;

use App\Models\ClassSection;
use App\Models\Institution;
use App\Models\Role;
use App\Models\Student;
use App\Models\StudentAdviserComment;
use App\Models\StudentAttendance;
use App\Models\StudentAuth;
use App\Models\StudentInstitution;
use App\Models\StudentRunningGrade;
use App\Models\StudentSection;
use App\Models\Subject;
use App\Models\User;
use App\Models\UserInstitution;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * A teacher publishes a learner's report card to the student portal, one
 * learner at a time, and can take it back.
 *
 * Two schools, because a card is tenant data, and two learners in one section,
 * because the portal must never show one learner another's card.
 */
class ReportCardPublicationTest extends TestCase
{
    use RefreshDatabase;

    private Institution $school;

    private Institution $otherSchool;

    private User $adviser;

    private User $otherTeacher;

    private User $otherPrincipal;

    private ClassSection $section;

    private ClassSection $otherSection;

    private Student $ana;

    private Student $ben;

    private Subject $math;

    private Subject $otherSubject;

    protected function setUp(): void
    {
        parent::setUp();

        $this->school = Institution::factory()->create(['title' => 'School A']);
        $this->otherSchool = Institution::factory()->create(['title' => 'School B']);

        // A role with no permissions at all: the adviser publishes because they
        // advise the section, not because of anything a role grants.
        $this->adviser = $this->makeStaff($this->school, 'no-access', 'adviser@rcp.test');
        $this->otherTeacher = $this->makeStaff($this->school, 'no-access', 'other@rcp.test');
        $this->otherPrincipal = $this->makeStaff($this->otherSchool, 'principal', 'principal-b@rcp.test');
        $this->makeStaff($this->school, 'principal', 'principal-a@rcp.test', 'Maria', 'Santos', 'Cruz');

        $this->section = ClassSection::create([
            'institution_id' => $this->school->id,
            'grade_level' => 'Grade 7',
            'title' => '7-A',
            'adviser' => $this->adviser->id,
            'academic_year' => '2026-2027',
        ]);
        $this->otherSection = ClassSection::create([
            'institution_id' => $this->school->id,
            'grade_level' => 'Grade 8',
            'title' => '8-A',
            'academic_year' => '2026-2027',
        ]);

        $this->math = Subject::create([
            'institution_id' => $this->school->id,
            'class_section_id' => $this->section->id,
            'subject_type' => 'parent',
            'title' => 'Mathematics',
        ]);
        $this->otherSubject = Subject::create([
            'institution_id' => $this->school->id,
            'class_section_id' => $this->otherSection->id,
            'subject_type' => 'parent',
            'title' => 'Science',
        ]);

        $this->ana = $this->makeStudent('Ana', 'ana@rcp.test');
        $this->ben = $this->makeStudent('Ben', 'ben@rcp.test');

        foreach ([$this->ana, $this->ben] as $student) {
            StudentSection::create([
                'student_id' => $student->id,
                'section_id' => $this->section->id,
                'academic_year' => '2026-2027',
                'is_active' => true,
            ]);
            StudentAttendance::create([
                'student_id' => $student->id,
                'class_section_id' => $this->section->id,
                'academic_year' => '2026-2027',
                'month' => 6,
                'year' => 2026,
                'days_present' => $student->is($this->ana) ? 20 : 15,
                'days_absent' => 0,
            ]);
        }

        StudentRunningGrade::create([
            'student_id' => $this->ana->id,
            'subject_id' => $this->math->id,
            'quarter' => '1',
            'grade' => 90,
            'final_grade' => 90,
            'academic_year' => '2026-2027',
        ]);
        StudentRunningGrade::create([
            'student_id' => $this->ana->id,
            'subject_id' => $this->otherSubject->id,
            'quarter' => '1',
            'grade' => 70,
            'final_grade' => 70,
            'academic_year' => '2026-2027',
        ]);
    }

    private function makeStaff(
        Institution $institution,
        string $slug,
        string $email,
        string $first = 'Staff',
        string $last = 'Member',
        string $middle = '',
    ): User {
        $role = Role::firstOrCreate(['slug' => $slug], ['title' => ucfirst($slug)]);

        $user = User::factory()->create([
            'email' => $email,
            'first_name' => $first,
            'middle_name' => $middle,
            'last_name' => $last,
            'token' => 'token-'.$email,
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

    private function makeStudent(string $first, string $email): Student
    {
        $student = Student::create([
            'first_name' => $first,
            'last_name' => 'Reyes',
            'gender' => 'female',
            'birthdate' => '2013-01-01',
            'is_active' => true,
        ]);

        StudentInstitution::create([
            'student_id' => $student->id,
            'institution_id' => $this->school->id,
            'is_active' => true,
        ]);

        StudentAuth::create([
            'student_id' => $student->id,
            'email' => $email,
            'password' => Hash::make('student-password'),
            'is_new' => false,
            'token' => 'portal-'.$email,
            'token_expiry' => now()->addYear()->toDateTimeString(),
        ]);

        return $student;
    }

    private function asUser(User $user): self
    {
        return $this->withHeader('Authorization', 'Bearer '.$user->token);
    }

    private function asStudent(Student $student): self
    {
        return $this->withHeader('Authorization', 'Bearer '.StudentAuth::where('student_id', $student->id)->value('token'));
    }

    private function publish(User $user, array $studentIds, bool $published = true, string $type = 'report-card', ?ClassSection $section = null)
    {
        return $this->asUser($user)->putJson('/api/report-card-publications', [
            'class_section_id' => ($section ?? $this->section)->id,
            'card_type' => $type,
            'student_ids' => $studentIds,
            'published' => $published,
        ]);
    }

    public function test_a_card_is_hidden_from_the_student_until_the_adviser_publishes_it(): void
    {
        $this->asStudent($this->ana)->getJson('/api/my/report-cards')
            ->assertOk()
            ->assertJsonCount(0, 'data');

        $this->publish($this->adviser, [$this->ana->id])
            ->assertOk()
            ->assertJsonPath('data.changed', 1);

        $this->asUser($this->adviser)
            ->getJson('/api/report-card-publications?class_section_id='.$this->section->id.'&card_type=report-card')
            ->assertOk()
            ->assertJsonPath('data.can_publish', true)
            ->assertJsonPath('data.published.'.$this->ana->id.'.published_by', 'Staff Member')
            ->assertJsonMissingPath('data.published.'.$this->ben->id);

        $cards = $this->asStudent($this->ana)->getJson('/api/my/report-cards')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.card_type', 'report-card')
            ->assertJsonPath('data.0.class_section.title', '7-A')
            ->json('data');

        $this->asStudent($this->ben)->getJson('/api/my/report-cards')
            ->assertOk()
            ->assertJsonCount(0, 'data');

        $card = $this->asStudent($this->ana)->getJson('/api/my/report-cards/'.$cards[0]['id'])
            ->assertOk()
            ->assertJsonPath('data.principal_name', 'MARIA C. SANTOS')
            ->assertJsonPath('data.card.student.id', $this->ana->id)
            ->assertJsonPath('data.card.class_section.adviser_user.id', $this->adviser->id)
            ->assertJsonCount(1, 'data.card.subjects')
            ->json('data.card');

        // Only this section's grades, and only her own attendance.
        $this->assertSame([$this->math->id], array_column($card['grades'], 'subject_id'));
        $this->assertSame([$this->ana->id], array_column($card['attendances'], 'student_id'));
        $this->assertCount(12, $card['school_days']);
        $this->assertArrayNotHasKey('token', $card['class_section']['adviser_user']);
    }

    public function test_unpublishing_takes_the_card_back(): void
    {
        $this->publish($this->adviser, [$this->ana->id, $this->ben->id])->assertJsonPath('data.changed', 2);
        // Publishing again is a no-op rather than a duplicate.
        $this->publish($this->adviser, [$this->ana->id])->assertJsonPath('data.changed', 0);

        $id = $this->asStudent($this->ana)->getJson('/api/my/report-cards')->json('data.0.id');

        $this->publish($this->adviser, [$this->ana->id], false)->assertJsonPath('data.changed', 1);

        $this->asStudent($this->ana)->getJson('/api/my/report-cards')->assertJsonCount(0, 'data');
        $this->asStudent($this->ana)->getJson('/api/my/report-cards/'.$id)->assertNotFound();
        $this->asStudent($this->ben)->getJson('/api/my/report-cards')->assertJsonCount(1, 'data');
    }

    public function test_a_student_cannot_open_another_learners_card(): void
    {
        $this->publish($this->adviser, [$this->ben->id]);
        $bensCard = $this->asStudent($this->ben)->getJson('/api/my/report-cards')->json('data.0.id');

        $this->asStudent($this->ana)->getJson('/api/my/report-cards/'.$bensCard)->assertNotFound();
    }

    public function test_only_the_adviser_or_a_report_card_manager_may_publish(): void
    {
        $this->publish($this->otherTeacher, [$this->ana->id])->assertForbidden();
        $this->asUser($this->otherTeacher)
            ->getJson('/api/report-card-publications?class_section_id='.$this->section->id.'&card_type=report-card')
            ->assertForbidden();

        // Another school's principal cannot even find the section.
        $this->publish($this->otherPrincipal, [$this->ana->id])->assertNotFound();

        // A student cannot publish their own card.
        $this->asStudent($this->ana)->putJson('/api/report-card-publications', [
            'class_section_id' => $this->section->id,
            'card_type' => 'report-card',
            'student_ids' => [$this->ana->id],
            'published' => true,
        ])->assertForbidden();

        $this->asStudent($this->ana)->getJson('/api/my/report-cards')->assertJsonCount(0, 'data');
    }

    public function test_a_learner_not_on_the_roster_is_skipped(): void
    {
        $outsider = $this->makeStudent('Cara', 'cara@rcp.test');

        $this->publish($this->adviser, [$this->ana->id, $outsider->id])
            ->assertOk()
            ->assertJsonPath('data.changed', 1)
            ->assertJsonPath('data.skipped', 1);

        $this->asStudent($outsider)->getJson('/api/my/report-cards')->assertJsonCount(0, 'data');
    }

    public function test_staff_cannot_use_the_portal_endpoint(): void
    {
        $this->asUser($this->adviser)->getJson('/api/my/report-cards')->assertForbidden();
    }

    public function test_the_performance_report_carries_the_advisers_saved_comments(): void
    {
        StudentAdviserComment::create([
            'student_id' => $this->ana->id,
            'class_section_id' => $this->section->id,
            'academic_year' => '2026-2027',
            'quarter' => '1',
            'comment' => 'Reads aloud with confidence.',
        ]);

        $this->publish($this->adviser, [$this->ana->id], true, 'performance-report');

        $id = $this->asStudent($this->ana)->getJson('/api/my/report-cards')
            ->assertJsonPath('data.0.card_type', 'performance-report')
            ->json('data.0.id');

        $this->asStudent($this->ana)->getJson('/api/my/report-cards/'.$id)
            ->assertOk()
            ->assertJsonPath('data.comments.1', 'Reads aloud with confidence.')
            ->assertJsonPath('data.principal_name', '');
    }

    public function test_a_student_reads_only_their_own_attendance_and_placement(): void
    {
        $attendance = $this->asStudent($this->ana)
            ->getJson('/api/student-attendances?class_section_id='.$this->section->id)
            ->assertOk()
            ->json('data');
        $this->assertSame([$this->ana->id], array_column($attendance, 'student_id'));

        $bensRow = StudentAttendance::where('student_id', $this->ben->id)->value('id');
        $this->asStudent($this->ana)->getJson('/api/student-attendances/'.$bensRow)->assertNotFound();

        $roster = $this->asStudent($this->ana)
            ->getJson('/api/student-sections?section_id='.$this->section->id)
            ->assertOk()
            ->json('data');
        $this->assertSame([$this->ana->id], array_column($roster, 'id'));

        $bensPlacement = StudentSection::where('student_id', $this->ben->id)->value('id');
        $this->asStudent($this->ana)->getJson('/api/student-sections/'.$bensPlacement)->assertNotFound();
    }
}
