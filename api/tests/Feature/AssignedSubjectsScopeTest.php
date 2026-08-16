<?php

namespace Tests\Feature;

use App\Models\ClassSection;
use App\Models\Institution;
use App\Models\Role;
use App\Models\Subject;
use App\Models\User;
use App\Models\UserInstitution;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * How wide "My Assigned Subjects" opens, and what decides it.
 *
 * The screen used to pick its scope from a list of role slug spellings. That
 * list missed Maranatha's Department Head, whose slug was `department-head-1` —
 * a collision suffix written by a role-builder save that never changed the name.
 * Five department heads spent two days looking at the seven or eight subjects
 * they personally advise instead of the school's 208, and nothing about the
 * screen said so.
 *
 * The scope is a permission now. These tests pin it to `subjects.view-all`, and
 * pin the narrow case to a subject teacher — who holds `subjects.manage` on
 * their own subjects and must still see only those, since the two roles are
 * otherwise indistinguishable by permission.
 */
class AssignedSubjectsScopeTest extends TestCase
{
    use RefreshDatabase;

    private Institution $institution;

    private User $otherTeacher;

    protected function setUp(): void
    {
        parent::setUp();

        $this->institution = Institution::factory()->create(['title' => 'Scope School']);

        // Somebody else's subjects — the ones a narrow scope must not return.
        $this->otherTeacher = User::factory()->create(['email' => 'other-teacher@scope.test']);

        foreach (['Mathematics 7', 'English 7', 'Science 7'] as $index => $title) {
            $this->subject($this->institution, $this->otherTeacher, $title, $index);
        }
    }

    private function section(Institution $institution): ClassSection
    {
        return ClassSection::create([
            'institution_id' => $institution->id,
            'grade_level' => '7',
            'title' => 'Grade 7 - Scope',
            'academic_year' => '2026-2027',
        ]);
    }

    private function subject(Institution $institution, User $adviser, string $title, int $order): Subject
    {
        return Subject::create([
            'institution_id' => $institution->id,
            'class_section_id' => $this->section($institution)->id,
            'adviser' => $adviser->id,
            'title' => $title,
            'order' => $order,
        ]);
    }

    /**
     * @param  array<string>  $permissions
     */
    private function staff(string $title, string $slug, array $permissions, string $token): User
    {
        $role = Role::create([
            'institution_id' => $this->institution->id,
            'title' => $title,
            'slug' => $slug,
        ]);
        $role->syncPermissions($permissions);

        $user = User::factory()->create([
            'email' => $slug.'@scope.test',
            'token' => $token,
            'token_expiry' => now()->addYear()->toDateTimeString(),
        ]);

        UserInstitution::factory()->create([
            'user_id' => $user->id,
            'institution_id' => $this->institution->id,
            'role_id' => $role->id,
            'is_default' => true,
            'is_main' => true,
        ]);

        return $user;
    }

    /**
     * The shape it actually broke in, at Maranatha. The slug carries the
     * collision suffix; the permission is what answers the question.
     */
    public function test_a_suffixed_department_head_slug_still_sees_every_subject(): void
    {
        $this->staff(
            'Department Head',
            'department-head-1',
            ['subjects.manage', 'subjects.view-all'],
            'dept-head-token'
        );

        $this->withHeader('Authorization', 'Bearer dept-head-token')
            ->getJson('/api/users/my/subjects')
            ->assertOk()
            ->assertJsonCount(3, 'data');
    }

    /**
     * The regression that branching on `subjects.manage` would have caused: a
     * teacher holds it too, and must still see only what they advise.
     */
    public function test_a_subject_teacher_sees_only_the_subjects_they_advise(): void
    {
        $teacher = $this->staff(
            'Subject Teacher',
            'subject-teacher',
            ['subjects.manage'],
            'teacher-token'
        );

        $this->subject($this->institution, $teacher, 'Filipino 7', 9);

        $this->withHeader('Authorization', 'Bearer teacher-token')
            ->getJson('/api/users/my/subjects')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.title', 'Filipino 7');
    }

    /**
     * A role the school built itself, holding the capability. The old slug list
     * could never have matched it.
     */
    public function test_a_schools_own_role_holding_the_permission_sees_every_subject(): void
    {
        $this->staff(
            'Academic Coordinator',
            'academic-coordinator',
            ['subjects.view-all'],
            'coordinator-token'
        );

        $this->withHeader('Authorization', 'Bearer coordinator-token')
            ->getJson('/api/users/my/subjects')
            ->assertOk()
            ->assertJsonCount(3, 'data');
    }

    /**
     * Another school's subjects are never in scope, however wide the grant.
     */
    public function test_the_overview_stops_at_the_users_own_institutions(): void
    {
        $otherInstitution = Institution::factory()->create(['title' => 'Someone Else']);

        $this->subject($otherInstitution, $this->otherTeacher, 'Not Ours', 0);

        $this->staff(
            'Principal',
            'principal',
            ['subjects.view-all'],
            'principal-token'
        );

        $this->withHeader('Authorization', 'Bearer principal-token')
            ->getJson('/api/users/my/subjects')
            ->assertOk()
            ->assertJsonCount(3, 'data')
            ->assertJsonMissing(['title' => 'Not Ours']);
    }
}
