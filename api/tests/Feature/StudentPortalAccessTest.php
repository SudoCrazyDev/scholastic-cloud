<?php

namespace Tests\Feature;

use App\Models\Institution;
use App\Models\Role;
use App\Models\Student;
use App\Models\StudentAuth;
use App\Models\StudentInstitution;
use App\Models\User;
use App\Models\UserInstitution;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * The institution-wide switch that temporarily closes the student portal.
 *
 * Two schools and a student in each, because the interesting cases are about
 * scope: one school closing its portal must not reach another school's students,
 * and a student enrolled in both must keep the door that is still open.
 */
class StudentPortalAccessTest extends TestCase
{
    use RefreshDatabase;

    private Institution $schoolA;

    private Institution $schoolB;

    private Student $studentA;

    private Student $studentB;

    protected function setUp(): void
    {
        parent::setUp();

        $this->schoolA = Institution::factory()->create(['title' => 'School A']);
        $this->schoolB = Institution::factory()->create(['title' => 'School B']);

        $this->makePrincipal($this->schoolA, 'principal-a@portal.test', 'token-a');
        $this->makePrincipal($this->schoolB, 'principal-b@portal.test', 'token-b');

        $this->studentA = $this->makeStudent($this->schoolA, 'student-a@portal.test');
        $this->studentB = $this->makeStudent($this->schoolB, 'student-b@portal.test');
    }

    private function makePrincipal(Institution $institution, string $email, string $token): User
    {
        // Role::booted() syncs the seeded permission set for a known system
        // slug, so this principal holds the settings module a real one does.
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

    private function loginAsStudentA()
    {
        return $this->postJson('/api/login', [
            'email' => 'student-a@portal.test',
            'password' => 'student-password',
        ]);
    }

    public function test_a_student_cannot_sign_in_while_their_school_closed_the_portal(): void
    {
        $this->schoolA->update([
            'student_portal_enabled' => false,
            'student_portal_disabled_message' => 'Portal reopens Monday, after report cards.',
        ]);

        $this->loginAsStudentA()
            ->assertForbidden()
            ->assertJson(['message' => 'Portal reopens Monday, after report cards.']);
    }

    public function test_the_generic_notice_is_shown_when_the_school_wrote_none(): void
    {
        $this->schoolA->update(['student_portal_enabled' => false]);

        $this->loginAsStudentA()
            ->assertForbidden()
            ->assertJson(['message' => Institution::STUDENT_PORTAL_DISABLED_MESSAGE]);
    }

    public function test_closing_the_portal_does_not_touch_another_schools_students(): void
    {
        $this->schoolA->update(['student_portal_enabled' => false]);

        $this->postJson('/api/login', [
            'email' => 'student-b@portal.test',
            'password' => 'student-password',
        ])->assertOk();
    }

    public function test_a_past_enrolment_at_an_open_school_does_not_undo_the_blackout(): void
    {
        // History from a school the student has left. Only one enrolment may be
        // active at a time, so the inactive row is what a transfer leaves behind.
        StudentInstitution::create([
            'student_id' => $this->studentA->id,
            'institution_id' => $this->schoolB->id,
            'is_active' => false,
        ]);

        $this->schoolA->update(['student_portal_enabled' => false]);

        $this->loginAsStudentA()->assertForbidden();
    }

    public function test_the_school_the_student_now_attends_is_the_one_that_decides(): void
    {
        // Transferred out of the closed school and into the open one.
        StudentInstitution::where('student_id', $this->studentA->id)->update(['is_active' => false]);
        StudentInstitution::create([
            'student_id' => $this->studentA->id,
            'institution_id' => $this->schoolB->id,
            'is_active' => true,
        ]);

        $this->schoolA->update(['student_portal_enabled' => false]);

        $this->loginAsStudentA()->assertOk();
    }

    public function test_staff_can_still_sign_in_while_the_student_portal_is_closed(): void
    {
        $this->schoolA->update(['student_portal_enabled' => false]);

        $this->postJson('/api/login', [
            'email' => 'principal-a@portal.test',
            'password' => 'password',
        ])->assertOk();
    }

    public function test_closing_the_portal_signs_out_students_already_signed_in(): void
    {
        // A live student session, in the state a real one is in mid-browse.
        $this->withHeader('Authorization', 'Bearer portal-student-a@portal.test')
            ->getJson('/api/profile')
            ->assertOk();

        $this->withHeader('Authorization', 'Bearer token-a')
            ->putJson('/api/student-portal-access', ['student_portal_enabled' => false])
            ->assertOk()
            ->assertJsonPath('data.student_portal_enabled', false)
            ->assertJsonPath('data.students_signed_out', 1);

        // The session is gone rather than running until its token expires.
        $this->assertNull(StudentAuth::where('student_id', $this->studentA->id)->value('token'));
        $this->withHeader('Authorization', 'Bearer portal-student-a@portal.test')
            ->getJson('/api/profile')
            ->assertUnauthorized();

        // The other school's students were left alone.
        $this->assertNotNull(StudentAuth::where('student_id', $this->studentB->id)->value('token'));
    }

    public function test_reopening_the_portal_lets_students_sign_in_again(): void
    {
        $this->schoolA->update(['student_portal_enabled' => false]);

        $this->withHeader('Authorization', 'Bearer token-a')
            ->putJson('/api/student-portal-access', ['student_portal_enabled' => true])
            ->assertOk()
            ->assertJsonPath('data.student_portal_enabled', true);

        $this->loginAsStudentA()->assertOk();
    }

    public function test_reopening_keeps_the_notice_the_school_wrote(): void
    {
        $this->withHeader('Authorization', 'Bearer token-a')
            ->putJson('/api/student-portal-access', [
                'student_portal_enabled' => false,
                'student_portal_disabled_message' => 'Back after exams.',
            ])->assertOk();

        $this->withHeader('Authorization', 'Bearer token-a')
            ->putJson('/api/student-portal-access', [
                'student_portal_enabled' => true,
                'student_portal_disabled_message' => 'Back after exams.',
            ])->assertOk()
            ->assertJsonPath('data.student_portal_disabled_message', 'Back after exams.');
    }

    public function test_a_student_can_neither_read_nor_flip_the_switch_that_locks_them_out(): void
    {
        $asStudent = fn () => $this->withHeader('Authorization', 'Bearer portal-student-a@portal.test');

        $asStudent()->getJson('/api/student-portal-access')->assertForbidden();
        $asStudent()->putJson('/api/student-portal-access', ['student_portal_enabled' => false])
            ->assertForbidden();

        $this->assertTrue((bool) $this->schoolA->fresh()->student_portal_enabled);
    }

    public function test_one_school_cannot_close_another_schools_portal(): void
    {
        // The endpoint takes no institution id: it always acts on the caller's
        // own school, so School B's principal can only ever close School B.
        $this->withHeader('Authorization', 'Bearer token-b')
            ->putJson('/api/student-portal-access', ['student_portal_enabled' => false])
            ->assertOk();

        $this->assertTrue((bool) $this->schoolA->fresh()->student_portal_enabled);
        $this->assertFalse((bool) $this->schoolB->fresh()->student_portal_enabled);
    }
}
