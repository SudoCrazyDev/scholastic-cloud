<?php

namespace Tests\Feature;

use App\Models\ClassSection;
use App\Models\Institution;
use App\Models\Role;
use App\Models\Student;
use App\Models\StudentAuth;
use App\Models\StudentInstitution;
use App\Models\StudentRunningGrade;
use App\Models\Subject;
use App\Models\User;
use App\Models\UserInstitution;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * Regressions for the findings in docs/SECURITY_AUDIT.md.
 *
 * Every case here is something the API allowed at the time of the audit:
 * handing out other people's session tokens, letting one school reach into
 * another's records, and accepting unlimited login attempts. They are grouped
 * in one file because they share a two-school fixture — the shape most of
 * these bugs needed in order to show up at all.
 */
class SecurityAuthorizationTest extends TestCase
{
    use RefreshDatabase;

    private Institution $schoolA;

    private Institution $schoolB;

    private User $principalA;

    private User $principalB;

    private Student $studentA;

    private Student $studentB;

    protected function setUp(): void
    {
        parent::setUp();

        $this->schoolA = Institution::factory()->create(['title' => 'School A']);
        $this->schoolB = Institution::factory()->create(['title' => 'School B']);

        $this->principalA = $this->makePrincipal($this->schoolA, 'a@audit.test', 'token-a');
        $this->principalB = $this->makePrincipal($this->schoolB, 'b@audit.test', 'token-b');

        $this->studentA = $this->makeStudent($this->schoolA, 'student-a@audit.test');
        $this->studentB = $this->makeStudent($this->schoolB, 'student-b@audit.test');
    }

    private function makePrincipal(Institution $institution, string $email, string $token): User
    {
        // Role::booted() syncs the seeded permission set for a known system
        // slug, so this principal holds exactly what a real one does.
        $role = Role::factory()->create(['title' => 'Principal', 'slug' => 'principal']);

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

    private function makeStudent(Institution $institution, string $email): Student
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

    private function asStudentA()
    {
        return $this->withHeader('Authorization', 'Bearer portal-student-a@audit.test');
    }

    private function makeGrade(Student $student, float $grade): StudentRunningGrade
    {
        $institutionId = $student->studentInstitutions()->value('institution_id');

        $section = ClassSection::create([
            'institution_id' => $institutionId,
            'grade_level' => 'Grade 7',
            'title' => 'Section Rizal',
        ]);

        $subject = Subject::create([
            'institution_id' => $institutionId,
            'class_section_id' => $section->id,
            'title' => 'Mathematics',
            'subject_type' => 'parent',
            'grading_type' => 'numerical',
        ]);

        return StudentRunningGrade::create([
            'student_id' => $student->id,
            'subject_id' => $subject->id,
            'quarter' => 1,
            'grade' => $grade,
            'academic_year' => '2025-2026',
        ]);
    }

    private function asPrincipalA()
    {
        return $this->withHeader('Authorization', 'Bearer token-a');
    }

    // ── C1: session tokens must never be serialized ───────────────────────

    public function test_the_staff_directory_never_hands_out_api_tokens(): void
    {
        $response = $this->asPrincipalA()->getJson('/api/staffs');

        $response->assertOk();

        // The token column used to ride along in every serialized user, which
        // turned "list my colleagues" into "collect everyone's live session".
        $this->assertStringNotContainsString('token-b', $response->getContent());
        foreach ($response->json('data') ?? [] as $staff) {
            $this->assertArrayNotHasKey('token', $staff);
            $this->assertArrayNotHasKey('token_expiry', $staff);
        }
    }

    public function test_a_serialized_user_carries_no_credentials(): void
    {
        $serialized = $this->principalA->fresh()->toArray();

        $this->assertArrayNotHasKey('token', $serialized);
        $this->assertArrayNotHasKey('token_expiry', $serialized);
        $this->assertArrayNotHasKey('password', $serialized);
    }

    public function test_a_serialized_student_login_carries_no_credentials(): void
    {
        $serialized = StudentAuth::where('student_id', $this->studentA->id)->first()->toArray();

        $this->assertArrayNotHasKey('token', $serialized);
        $this->assertArrayNotHasKey('token_expiry', $serialized);
        $this->assertArrayNotHasKey('password', $serialized);
    }

    // ── C2: student portal credentials are institution-scoped ─────────────

    public function test_a_principal_cannot_seize_another_schools_student_portal_account(): void
    {
        $response = $this->asPrincipalA()->postJson("/api/students/{$this->studentB->id}/auth", [
            'email' => 'attacker@audit.test',
            'password' => 'newpassword',
        ]);

        $response->assertForbidden();

        $this->assertSame(
            'student-b@audit.test',
            StudentAuth::where('student_id', $this->studentB->id)->value('email'),
        );
    }

    public function test_a_principal_can_still_manage_their_own_students_portal_account(): void
    {
        $response = $this->asPrincipalA()->postJson("/api/students/{$this->studentA->id}/auth", [
            'email' => 'student-a-new@audit.test',
            'password' => 'newpassword',
        ]);

        $response->assertOk();
        $this->assertSame(
            'student-a-new@audit.test',
            StudentAuth::where('student_id', $this->studentA->id)->value('email'),
        );
    }

    public function test_resetting_portal_credentials_ends_the_students_existing_session(): void
    {
        StudentAuth::where('student_id', $this->studentA->id)
            ->update(['token' => 'student-live-token', 'token_expiry' => now()->addYear()]);

        $this->asPrincipalA()->postJson("/api/students/{$this->studentA->id}/auth", [
            'email' => 'student-a@audit.test',
            'password' => 'rotated-password',
        ])->assertOk();

        $this->assertNull(StudentAuth::where('student_id', $this->studentA->id)->value('token'));
    }

    // ── H2: a named institution must be one the caller belongs to ─────────

    public function test_proficiency_refuses_an_institution_the_caller_does_not_belong_to(): void
    {
        $response = $this->asPrincipalA()->getJson('/api/proficiency?'.http_build_query([
            'academic_year' => '2025-2026',
            'institution_id' => $this->schoolB->id,
        ]));

        $response->assertForbidden();
    }

    public function test_proficiency_still_answers_for_the_callers_own_institution(): void
    {
        $response = $this->asPrincipalA()->getJson('/api/proficiency?'.http_build_query([
            'academic_year' => '2025-2026',
            'institution_id' => $this->schoolA->id,
        ]));

        $response->assertOk();
    }

    public function test_sf9_refuses_to_print_another_schools_student(): void
    {
        $response = $this->asPrincipalA()->postJson('/api/sf9/generate', [
            'student_id' => $this->studentB->id,
            'academic_year' => '2025-2026',
            'institution_id' => $this->schoolB->id,
        ]);

        $response->assertForbidden();
    }

    // ── H3: password resets issue a secret, not a known constant ──────────

    public function test_a_staff_password_reset_issues_a_random_secret_and_ends_their_session(): void
    {
        $colleague = $this->makePrincipal($this->schoolA, 'colleague@audit.test', 'token-colleague');

        $response = $this->asPrincipalA()
            ->postJson("/api/staffs/{$colleague->id}/reset-password");

        $response->assertOk();

        $temporary = $response->json('data.temporary_password');
        $this->assertIsString($temporary);
        $this->assertNotSame('password', $temporary);

        $colleague->refresh();
        $this->assertTrue(Hash::check($temporary, $colleague->password));
        // The old literal was guessable; the point of the change is that it
        // no longer is, and that the reset closes any session already open.
        $this->assertFalse(Hash::check('password', $colleague->password));
        $this->assertNull($colleague->token);
    }

    // ── C3: the `shared` audience must not hand students write access ─────

    public function test_a_student_cannot_create_a_running_grade(): void
    {
        // `student-running-grades` is declared `consolidated-grades,view,shared`
        // so the portal can read grades. The apiResource also carries store,
        // update and destroy, which the shared bypass used to wave through.
        $response = $this->asStudentA()->postJson('/api/student-running-grades', [
            'student_id' => $this->studentA->id,
            'subject_id' => (string) \Illuminate\Support\Str::uuid(),
            'quarter' => 1,
            'grade' => 100,
            'academic_year' => '2025-2026',
        ]);

        $response->assertForbidden();
        $this->assertDatabaseCount('student_running_grades', 0);
    }

    public function test_a_student_cannot_delete_a_running_grade(): void
    {
        $grade = $this->makeGrade($this->studentA, 75);

        $this->asStudentA()
            ->deleteJson("/api/student-running-grades/{$grade->id}")
            ->assertForbidden();

        $this->assertDatabaseHas('student_running_grades', ['id' => $grade->id]);
    }

    public function test_a_student_reading_grades_sees_only_their_own(): void
    {
        $this->makeGrade($this->studentA, 88);
        $this->makeGrade($this->studentB, 61);

        $response = $this->asStudentA()->getJson('/api/student-running-grades');

        $response->assertOk();

        $studentIds = collect($response->json('data'))->pluck('student_id')->unique();
        $this->assertSame([$this->studentA->id], $studentIds->values()->all());
    }

    public function test_a_student_cannot_read_another_students_grade_by_id(): void
    {
        $othersGrade = $this->makeGrade($this->studentB, 61);

        $this->asStudentA()
            ->getJson("/api/student-running-grades/{$othersGrade->id}")
            ->assertForbidden();
    }

    public function test_a_shared_route_declared_manage_still_accepts_a_student_write(): void
    {
        // The fix keys on the declared ability, so routes that genuinely take a
        // student write (`finance,manage,shared`) must keep working. A 422 from
        // validation is the proof it got past the middleware; a 403 would mean
        // the fix went too far.
        $this->asStudentA()
            ->postJson('/api/student-online-payments/checkout', [])
            ->assertStatus(422);
    }

    public function test_staff_can_still_write_grades(): void
    {
        $grade = $this->makeGrade($this->studentA, 75);

        $this->asPrincipalA()
            ->deleteJson("/api/student-running-grades/{$grade->id}")
            ->assertOk();

        $this->assertDatabaseMissing('student_running_grades', ['id' => $grade->id]);
    }

    // ── H1: login is gated on activity and rate limited ───────────────────

    public function test_a_deactivated_student_cannot_sign_in(): void
    {
        $this->studentA->update(['is_active' => false]);

        $this->postJson('/api/login', [
            'email' => 'student-a@audit.test',
            'password' => 'student-password',
        ])->assertForbidden();
    }

    public function test_repeated_failed_logins_are_throttled(): void
    {
        // Five attempts a minute against one address; the sixth is refused
        // whether or not the password happens to be right.
        for ($attempt = 1; $attempt <= 5; $attempt++) {
            $this->postJson('/api/login', [
                'email' => 'a@audit.test',
                'password' => 'wrong-password',
            ])->assertUnauthorized();
        }

        $this->postJson('/api/login', [
            'email' => 'a@audit.test',
            'password' => 'wrong-password',
        ])->assertStatus(429);
    }
}
