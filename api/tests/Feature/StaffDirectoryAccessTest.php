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
 * Who may read the staff directory.
 *
 * `StaffController::index/show` deliberately admit any staff account and gate
 * only the writes: the timetable, staff schedules, ZK user mapping, the
 * attendance-request modal and the subject-teacher picker on My Class Sections
 * all have to name a co-worker without holding the `staffs` module. Declaring
 * the whole `staffs` resource behind `module:staffs,view` shadowed those
 * guards, and a subject teacher reassigning one of their own subjects could
 * not search for the colleague to hand it to.
 */
class StaffDirectoryAccessTest extends TestCase
{
    use RefreshDatabase;

    private Institution $school;

    private User $teacher;

    private User $principal;

    protected function setUp(): void
    {
        parent::setUp();

        $this->school = Institution::factory()->create(['title' => 'Directory High']);

        // Role::booted() syncs the seeded permission set for a known system
        // slug, so these hold exactly what the real roles do — a Subject
        // Teacher without `staffs.view`, a Principal with `staffs.manage`.
        $this->teacher = $this->makeStaff('subject-teacher', 'Subject Teacher', 'teacher@directory.test', 'token-teacher');
        $this->principal = $this->makeStaff('principal', 'Principal', 'principal@directory.test', 'token-principal');
    }

    private function makeStaff(string $slug, string $title, string $email, string $token): User
    {
        $role = Role::firstWhere('slug', $slug)
            ?? Role::factory()->create(['title' => $title, 'slug' => $slug]);

        $user = User::factory()->create([
            'last_name' => 'Cruz',
            'email' => $email,
            'token' => $token,
            'token_expiry' => now()->addYear()->toDateTimeString(),
        ]);

        UserInstitution::factory()->create([
            'user_id' => $user->id,
            'institution_id' => $this->school->id,
            'role_id' => $role->id,
            'is_default' => true,
            'is_main' => true,
        ]);

        return $user;
    }

    private function asTeacher()
    {
        return $this->withHeader('Authorization', 'Bearer token-teacher');
    }

    public function test_a_subject_teacher_without_the_staffs_module_can_search_the_directory(): void
    {
        $this->assertFalse($this->teacher->hasModuleAccess('staffs', 'view'));

        $response = $this->asTeacher()->getJson('/api/staffs?limit=20&search=Cruz');

        $response->assertOk();
        $this->assertContains(
            $this->principal->id,
            array_column($response->json('data') ?? [], 'id'),
        );
    }

    public function test_a_subject_teacher_can_open_a_colleagues_record(): void
    {
        $this->asTeacher()
            ->getJson("/api/staffs/{$this->principal->id}")
            ->assertOk();
    }

    public function test_a_subject_teacher_still_cannot_change_staff_records(): void
    {
        $this->asTeacher()
            ->postJson('/api/staffs', ['first_name' => 'New', 'last_name' => 'Hire'])
            ->assertForbidden();

        $this->asTeacher()
            ->putJson("/api/staffs/{$this->principal->id}", ['last_name' => 'Renamed'])
            ->assertForbidden();

        $this->asTeacher()
            ->deleteJson("/api/staffs/{$this->principal->id}")
            ->assertForbidden();

        $this->asTeacher()
            ->postJson("/api/staffs/{$this->principal->id}/reset-password")
            ->assertForbidden();

        $this->assertSame('Cruz', $this->principal->fresh()->last_name);
    }

    public function test_the_student_portal_cannot_read_the_staff_directory(): void
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
            'institution_id' => $this->school->id,
            'is_active' => true,
        ]);

        StudentAuth::create([
            'student_id' => $student->id,
            'email' => 'pupil@directory.test',
            'password' => Hash::make('student-password'),
            'is_new' => false,
            'token' => 'portal-pupil',
            'token_expiry' => now()->addYear()->toDateTimeString(),
        ]);

        // Opening the read to staff must not open it to the portal — the
        // module middleware used to be what turned students away here.
        $this->withHeader('Authorization', 'Bearer portal-pupil')
            ->getJson('/api/staffs')
            ->assertForbidden();
    }
}
