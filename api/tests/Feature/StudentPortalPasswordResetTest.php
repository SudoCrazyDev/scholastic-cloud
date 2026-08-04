<?php

namespace Tests\Feature;

use App\Models\Institution;
use App\Models\Role;
use App\Models\Student;
use App\Models\StudentAuth;
use App\Models\StudentAuthLog;
use App\Models\StudentInstitution;
use App\Models\User;
use App\Models\UserInstitution;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * A subject teacher may set a student's portal login up and reset its password.
 *
 * The interesting cases are all about the edge of that grant: the teacher holds
 * `students` read-only, so the tests check they can create a login and reset one
 * while still being unable to point a login that already exists at another email
 * — which would otherwise be a route to signing in as the student.
 *
 * Two schools, because a permission that ignored institution scope would let a
 * teacher reset a password for a child they have never taught.
 */
class StudentPortalPasswordResetTest extends TestCase
{
    use RefreshDatabase;

    private Institution $schoolA;

    private Institution $schoolB;

    private Student $studentA;

    private Student $studentB;

    private User $teacherA;

    protected function setUp(): void
    {
        parent::setUp();

        $this->schoolA = Institution::factory()->create(['title' => 'School A']);
        $this->schoolB = Institution::factory()->create(['title' => 'School B']);

        $this->teacherA = $this->makeStaff($this->schoolA, 'subject-teacher', 'teacher-a@reset.test', 'teacher-a-token');

        $this->studentA = $this->makeStudent($this->schoolA, 'student-a@reset.test');
        $this->studentB = $this->makeStudent($this->schoolB, 'student-b@reset.test');
    }

    /**
     * Role::booted() syncs the seeded set for a known system slug, so a role
     * built here holds what the real one does.
     */
    private function makeStaff(Institution $institution, string $slug, string $email, string $token): User
    {
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

    private function makeStudent(Institution $institution, string $email, bool $withLogin = true): Student
    {
        $student = Student::create([
            'first_name' => 'Test',
            'last_name' => 'Student',
            'gender' => 'male',
            'birthdate' => '2010-01-01',
            'is_active' => true,
        ]);

        StudentInstitution::create([
            'student_id' => $student->id,
            'institution_id' => $institution->id,
            'is_active' => true,
        ]);

        if ($withLogin) {
            StudentAuth::create([
                'student_id' => $student->id,
                'email' => $email,
                'password' => Hash::make('student-password'),
                'is_new' => false,
                'token' => 'portal-'.$email,
                'token_expiry' => now()->addYear()->toDateTimeString(),
            ]);
        }

        return $student;
    }

    private function asTeacherA(): self
    {
        return $this->withHeader('Authorization', 'Bearer teacher-a-token');
    }

    private function resetUrl(Student $student): string
    {
        return "/api/students/{$student->id}/auth/reset-password";
    }

    public function test_a_subject_teacher_can_reset_a_portal_password(): void
    {
        $before = StudentAuth::where('student_id', $this->studentA->id)->first();

        $this->asTeacherA()
            ->postJson($this->resetUrl($this->studentA), ['password' => 'brand-new-pass'])
            ->assertOk()
            ->assertJson(['success' => true]);

        $after = StudentAuth::where('student_id', $this->studentA->id)->first();

        $this->assertTrue(Hash::check('brand-new-pass', $after->password));
        $this->assertNotSame($before->password, $after->password);
        $this->assertSame('student-a@reset.test', $after->email);
    }

    public function test_a_reset_ends_the_session_the_student_already_had(): void
    {
        $this->asTeacherA()
            ->postJson($this->resetUrl($this->studentA), ['password' => 'brand-new-pass'])
            ->assertOk();

        $auth = StudentAuth::where('student_id', $this->studentA->id)->first();

        $this->assertNull($auth->token);
        $this->assertNull($auth->token_expiry);
        // Signed in on a password someone else chose, so the portal asks them to
        // set their own.
        $this->assertTrue($auth->is_new);
    }

    public function test_a_reset_is_recorded_against_the_teacher_who_did_it(): void
    {
        $this->asTeacherA()
            ->postJson($this->resetUrl($this->studentA), ['password' => 'brand-new-pass'])
            ->assertOk();

        $log = StudentAuthLog::where('student_id', $this->studentA->id)->latest('created_at')->first();

        $this->assertNotNull($log);
        $this->assertSame('reset_password', $log->action);
        $this->assertSame($this->teacherA->id, $log->performed_by);
        $this->assertSame('student-a@reset.test', $log->new_email);
    }

    public function test_a_subject_teacher_cannot_change_the_email_a_login_belongs_to(): void
    {
        // The endpoint that writes the email is a different one, held by whoever
        // manages student records. Without this the grant would be a way to move
        // a student's login to an address the teacher controls.
        $this->asTeacherA()
            ->postJson("/api/students/{$this->studentA->id}/auth", [
                'email' => 'teacher-owns-this@reset.test',
                'password' => 'brand-new-pass',
            ])
            ->assertForbidden();

        $this->assertSame(
            'student-a@reset.test',
            StudentAuth::where('student_id', $this->studentA->id)->value('email')
        );
    }

    /**
     * The reset endpoint never creates: there is no password to replace and no
     * address to replace it against. Creating is the other endpoint, below.
     */
    public function test_the_reset_endpoint_refuses_a_student_who_has_no_login(): void
    {
        $noLogin = $this->makeStudent($this->schoolA, 'unused@reset.test', withLogin: false);

        $this->asTeacherA()
            ->postJson($this->resetUrl($noLogin), ['password' => 'brand-new-pass'])
            ->assertNotFound();

        $this->assertDatabaseMissing('student_auth', ['student_id' => $noLogin->id]);
    }

    public function test_a_subject_teacher_can_create_a_login_for_a_student_who_has_none(): void
    {
        $noLogin = $this->makeStudent($this->schoolA, 'unused@reset.test', withLogin: false);

        $this->asTeacherA()
            ->postJson("/api/students/{$noLogin->id}/auth", [
                'email' => 'brand-new@reset.test',
                'password' => 'first-password',
            ])
            ->assertOk()
            ->assertJson(['success' => true]);

        $auth = StudentAuth::where('student_id', $noLogin->id)->first();

        $this->assertNotNull($auth);
        $this->assertSame('brand-new@reset.test', $auth->email);
        $this->assertTrue(Hash::check('first-password', $auth->password));
        // Handed a password someone else chose, so the portal asks for their own.
        $this->assertTrue($auth->is_new);

        $log = StudentAuthLog::where('student_id', $noLogin->id)->latest('created_at')->first();
        $this->assertSame('created', $log->action);
        $this->assertSame($this->teacherA->id, $log->performed_by);
    }

    public function test_a_teacher_cannot_create_a_login_at_another_school(): void
    {
        $noLogin = $this->makeStudent($this->schoolB, 'unused-b@reset.test', withLogin: false);

        $this->asTeacherA()
            ->postJson("/api/students/{$noLogin->id}/auth", [
                'email' => 'teacher-a-picked-this@reset.test',
                'password' => 'first-password',
            ])
            ->assertForbidden();

        $this->assertDatabaseMissing('student_auth', ['student_id' => $noLogin->id]);
    }

    public function test_a_role_holding_neither_permission_cannot_create_a_login(): void
    {
        $this->makeStaff($this->schoolA, 'hr', 'hr-create@reset.test', 'hr-create-token');
        $noLogin = $this->makeStudent($this->schoolA, 'unused@reset.test', withLogin: false);

        $this->withHeader('Authorization', 'Bearer hr-create-token')
            ->postJson("/api/students/{$noLogin->id}/auth", [
                'email' => 'hr-picked-this@reset.test',
                'password' => 'first-password',
            ])
            ->assertForbidden();

        $this->assertDatabaseMissing('student_auth', ['student_id' => $noLogin->id]);
    }

    public function test_a_teacher_cannot_reset_a_password_at_another_school(): void
    {
        $this->asTeacherA()
            ->postJson($this->resetUrl($this->studentB), ['password' => 'brand-new-pass'])
            ->assertForbidden();

        $this->assertTrue(
            Hash::check('student-password', StudentAuth::where('student_id', $this->studentB->id)->value('password'))
        );
    }

    public function test_a_role_holding_neither_permission_is_refused(): void
    {
        $this->makeStaff($this->schoolA, 'hr', 'hr@reset.test', 'hr-token');

        $this->withHeader('Authorization', 'Bearer hr-token')
            ->postJson($this->resetUrl($this->studentA), ['password' => 'brand-new-pass'])
            ->assertForbidden();
    }

    public function test_a_signed_in_student_cannot_reset_anyones_password(): void
    {
        $login = $this->postJson('/api/login', [
            'email' => 'student-a@reset.test',
            'password' => 'student-password',
        ])->assertOk();

        $token = $login->json('token');
        $this->assertNotEmpty($token);

        $this->withHeader('Authorization', "Bearer {$token}")
            ->postJson($this->resetUrl($this->studentA), ['password' => 'chosen-by-me'])
            ->assertForbidden();
    }

    /**
     * The modal decides what to offer from this call, so a teacher who cannot
     * read it is shown the "no login yet" dead end for a student who has one.
     */
    public function test_a_subject_teacher_can_read_whether_a_student_has_a_login(): void
    {
        $this->asTeacherA()
            ->getJson("/api/students/{$this->studentA->id}/auth")
            ->assertOk()
            ->assertJsonPath('data.email', 'student-a@reset.test');
    }

    public function test_reading_a_student_without_a_login_is_a_404_not_a_403(): void
    {
        $noLogin = $this->makeStudent($this->schoolA, 'unused@reset.test', withLogin: false);

        $this->asTeacherA()
            ->getJson("/api/students/{$noLogin->id}/auth")
            ->assertNotFound();
    }

    public function test_a_principal_keeps_both_paths(): void
    {
        $this->makeStaff($this->schoolA, 'principal', 'principal@reset.test', 'principal-token');

        $this->withHeader('Authorization', 'Bearer principal-token')
            ->postJson($this->resetUrl($this->studentA), ['password' => 'brand-new-pass'])
            ->assertOk();

        $this->withHeader('Authorization', 'Bearer principal-token')
            ->postJson("/api/students/{$this->studentA->id}/auth", [
                'email' => 'moved@reset.test',
                'password' => 'another-pass',
            ])
            ->assertOk();

        $this->assertSame(
            'moved@reset.test',
            StudentAuth::where('student_id', $this->studentA->id)->value('email')
        );
    }
}
