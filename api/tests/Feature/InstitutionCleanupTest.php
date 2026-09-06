<?php

namespace Tests\Feature;

use App\Models\Announcement;
use App\Models\ClassSection;
use App\Models\Institution;
use App\Models\InstitutionCleanupLog;
use App\Models\Role;
use App\Models\Student;
use App\Models\StudentInstitution;
use App\Models\StudentRunningGrade;
use App\Models\Subject;
use App\Models\User;
use App\Models\UserInstitution;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Emptying one institution back to its people.
 *
 * Three things are worth testing here and the row counts are not among them.
 *
 *  1. **Who may run it.** The module is `system_only`, but the controller checks
 *     the super-administrator slug on top of that, and the test that matters is
 *     the one where someone holds the permission and is still refused.
 *  2. **What survives.** The whole promise of the feature is that students and
 *     staff come out the other side usable — enrolled, employed, with a role
 *     that still resolves.
 *  3. **Whose data it was.** Every table without an `institution_id` is scoped
 *     through a parent that has one. A student enrolled at two schools is the
 *     case that catches a wrong hop, so there is one in every fixture here.
 */
class InstitutionCleanupTest extends TestCase
{
    use RefreshDatabase;

    private const YEAR = '2026-2027';

    private Institution $target;
    private Institution $bystander;

    /** Enrolled at both schools — the cross-tenant canary. */
    private Student $sharedStudent;

    private Subject $targetSubject;
    private Subject $bystanderSubject;

    protected function setUp(): void
    {
        parent::setUp();

        $this->target = Institution::factory()->create(['title' => 'Target Academy']);
        $this->bystander = Institution::factory()->create(['title' => 'Bystander School']);

        $this->sharedStudent = $this->makeStudent('Shared', 'Learner');

        /*
         * Enrolled at both, active at one. `unique_active_institution_per_student`
         * allows a student only one active enrolment, so a shared student is
         * always active at one school and inactive at the other — a transfer
         * whose old school still holds their records. That is precisely the
         * fixture worth testing: the inactive side must survive untouched.
         */
        StudentInstitution::create([
            'student_id' => $this->sharedStudent->id,
            'institution_id' => $this->target->id,
            'is_active' => true,
            'academic_year' => self::YEAR,
        ]);
        StudentInstitution::create([
            'student_id' => $this->sharedStudent->id,
            'institution_id' => $this->bystander->id,
            'is_active' => false,
            'academic_year' => self::YEAR,
        ]);

        $this->targetSubject = $this->makeSubject($this->target, 'Target Math');
        $this->bystanderSubject = $this->makeSubject($this->bystander, 'Bystander Math');
    }

    private function makeStudent(string $first, string $last): Student
    {
        return Student::create([
            'first_name' => $first,
            'last_name' => $last,
            'gender' => 'female',
            'birthdate' => '2012-01-01',
            'is_active' => true,
        ]);
    }

    /** A subject on its own section, which is how a subject reaches a tenant. */
    private function makeSubject(Institution $institution, string $title): Subject
    {
        $section = ClassSection::create([
            'institution_id' => $institution->id,
            'grade_level' => 'Grade 7',
            'title' => $title . ' Section',
            'academic_year' => self::YEAR,
            'status' => 'active',
        ]);

        return Subject::create([
            'institution_id' => $institution->id,
            'class_section_id' => $section->id,
            'title' => $title,
            'subject_type' => 'parent',
            'grading_type' => 'numerical',
        ]);
    }

    private function makeGrade(Subject $subject, Student $student, float $grade): StudentRunningGrade
    {
        return StudentRunningGrade::create([
            'student_id' => $student->id,
            'subject_id' => $subject->id,
            'quarter' => '1',
            'grade' => $grade,
            'academic_year' => self::YEAR,
        ]);
    }

    /**
     * A signed-in user with the given role slug, holding the cleanup module.
     *
     * The permission is granted regardless of slug on purpose: it is what lets
     * the refusal test prove the slug check is doing the work rather than the
     * middleware quietly refusing an unpermissioned user.
     */
    private function makeUser(string $token, string $roleSlug, ?Institution $institution = null): User
    {
        $institution ??= $this->target;

        $role = Role::firstOrCreate(
            ['slug' => $roleSlug, 'institution_id' => null],
            ['title' => ucfirst($roleSlug), 'is_system' => true],
        );

        DB::table('role_permissions')->insertOrIgnore([
            'role_id' => $role->id,
            'permission' => $roleSlug === 'super-administrator' ? '*' : 'institution-cleanup.manage',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $user = User::factory()->create([
            'token' => $token,
            // UserFactory hardcodes one address, so every user made here needs
            // its own or the second insert collides on users_email_unique.
            'email' => $token . '@cleanup.test',
            'token_expiry' => now()->addDay()->toDateTimeString(),
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

    /**
     * @param  array<string>  $groups
     */
    private function clear(string $token, array $groups, ?string $confirmation = null, ?Institution $institution = null)
    {
        $institution ??= $this->target;

        return $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson('/api/institution-cleanup/' . $institution->id, [
                'groups' => $groups,
                'confirmation' => $confirmation ?? $institution->title,
            ]);
    }

    public function test_a_permissioned_non_super_administrator_is_still_refused(): void
    {
        $this->makeUser('principal-token', 'principal');
        $this->makeGrade($this->targetSubject, $this->sharedStudent, 90);

        $this->clear('principal-token', ['assessments'])
            ->assertStatus(403)
            ->assertJsonPath('message', 'Only super-administrators can clean up an institution');

        // The refusal has to be a refusal, not a 403 after the deed.
        $this->assertDatabaseCount('student_running_grades', 1);
        $this->assertDatabaseCount('institution_cleanup_logs', 0);
    }

    public function test_students_and_staff_survive_a_full_cleanup(): void
    {
        $this->makeUser('super-token', 'super-administrator');
        $staff = $this->makeUser('staff-token', 'teacher');

        $this->makeGrade($this->targetSubject, $this->sharedStudent, 90);
        Announcement::create([
            'institution_id' => $this->target->id,
            'title' => 'Closing early',
            'body' => 'Half day on Friday.',
            'category' => 'general',
            'audience' => 'both',
            'scope' => 'institution',
            'status' => 'published',
        ]);

        $response = $this->clear('super-token', array_diff(
            \App\Support\InstitutionCleanupGroups::keys(),
            // Roles are exercised on their own below; a full run including them
            // would trip the blocker this fixture deliberately creates.
            ['roles'],
        ));

        $response->assertOk()->assertJsonPath('success', true);

        // The people, and the things that make them usable.
        $this->assertDatabaseHas('students', ['id' => $this->sharedStudent->id]);
        $this->assertDatabaseHas('student_institutions', [
            'student_id' => $this->sharedStudent->id,
            'institution_id' => $this->target->id,
        ]);
        $this->assertDatabaseHas('users', ['id' => $staff->id]);
        $this->assertDatabaseHas('user_institutions', [
            'user_id' => $staff->id,
            'institution_id' => $this->target->id,
        ]);
        $this->assertNotNull(
            $staff->fresh()->getRole(),
            'a staff member must still resolve a role after a clean-up',
        );

        // And the school built around them, gone.
        $this->assertDatabaseCount('announcements', 0);
        $this->assertDatabaseMissing('subjects', ['id' => $this->targetSubject->id]);
        $this->assertSame(0, DB::table('student_running_grades')
            ->where('subject_id', $this->targetSubject->id)
            ->count());

        $response->assertJsonPath('data.retained.students', 1);
    }

    public function test_another_institution_keeps_the_shared_students_records(): void
    {
        $this->makeUser('super-token', 'super-administrator');

        $targetGrade = $this->makeGrade($this->targetSubject, $this->sharedStudent, 75);
        $bystanderGrade = $this->makeGrade($this->bystanderSubject, $this->sharedStudent, 88);

        Announcement::create([
            'institution_id' => $this->bystander->id,
            'title' => 'Bystander notice',
            'body' => 'Unaffected.',
            'category' => 'general',
            'audience' => 'both',
            'scope' => 'institution',
            'status' => 'published',
        ]);

        $this->clear('super-token', ['assessments', 'communications', 'structure'])->assertOk();

        // The same student, at another school on the same platform, keeps
        // everything. This is the assertion that a wrong scoping hop breaks.
        $this->assertDatabaseMissing('student_running_grades', ['id' => $targetGrade->id]);
        $this->assertDatabaseHas('student_running_grades', ['id' => $bystanderGrade->id]);
        $this->assertDatabaseHas('subjects', ['id' => $this->bystanderSubject->id]);
        $this->assertDatabaseHas('announcements', ['institution_id' => $this->bystander->id]);
        $this->assertDatabaseHas('class_sections', ['institution_id' => $this->bystander->id]);
    }

    public function test_school_built_roles_are_refused_while_staff_hold_them(): void
    {
        $this->makeUser('super-token', 'super-administrator');

        $schoolRole = Role::create([
            'title' => 'Year Head',
            'slug' => 'year-head',
            'institution_id' => $this->target->id,
            'is_system' => false,
        ]);

        $held = User::factory()->create(['email' => 'year-head@cleanup.test']);
        UserInstitution::factory()->create([
            'user_id' => $held->id,
            'institution_id' => $this->target->id,
            'role_id' => $schoolRole->id,
            'is_default' => true,
            'is_main' => true,
        ]);

        $this->clear('super-token', ['roles'])
            ->assertStatus(422)
            ->assertJsonPath('success', false);

        // Refused means nothing ran — not the role, and not its permissions.
        $this->assertDatabaseHas('roles', ['id' => $schoolRole->id]);
        $this->assertDatabaseCount('institution_cleanup_logs', 0);

        // Move the person off it and the same run is allowed.
        DB::table('user_institutions')
            ->where('user_id', $held->id)
            ->update(['role_id' => Role::where('slug', 'super-administrator')->value('id')]);

        $this->clear('super-token', ['roles'])->assertOk();
        $this->assertDatabaseMissing('roles', ['id' => $schoolRole->id]);
    }

    public function test_system_roles_survive_a_cleanup_of_the_roles_group(): void
    {
        $this->makeUser('super-token', 'super-administrator');

        $systemRole = Role::firstOrCreate(
            ['slug' => 'institution-administrator', 'institution_id' => null],
            ['title' => 'Institution Administrator', 'is_system' => true],
        );

        $this->clear('super-token', ['roles'])->assertOk();

        // Shared by every tenant on the platform; clearing one school must not
        // reach them.
        $this->assertDatabaseHas('roles', ['id' => $systemRole->id]);
    }

    public function test_the_confirmation_must_be_the_institutions_own_name(): void
    {
        $this->makeUser('super-token', 'super-administrator');
        $grade = $this->makeGrade($this->targetSubject, $this->sharedStudent, 90);

        // The name of the *other* school — the mistake the confirmation exists
        // to catch.
        $this->clear('super-token', ['assessments'], $this->bystander->title)
            ->assertStatus(422);

        $this->assertDatabaseHas('student_running_grades', ['id' => $grade->id]);

        $this->clear('super-token', ['assessments'], ' Target Academy ')->assertOk();
        $this->assertDatabaseMissing('student_running_grades', ['id' => $grade->id]);
    }

    public function test_the_run_is_recorded_with_a_per_table_tally(): void
    {
        $this->makeUser('super-token', 'super-administrator');
        $this->makeGrade($this->targetSubject, $this->sharedStudent, 90);

        $this->clear('super-token', ['assessments'])->assertOk();

        $log = InstitutionCleanupLog::first();

        $this->assertNotNull($log);
        $this->assertSame($this->target->id, $log->institution_id);
        $this->assertSame(['assessments'], $log->groups);
        $this->assertSame(1, $log->deleted_counts['student_running_grades']);
        $this->assertSame(1, $log->total_deleted);
        $this->assertSame('super-administrator', $log->cleared_by_role);
    }

    public function test_a_soft_deleted_row_is_taken_too(): void
    {
        $this->makeUser('super-token', 'super-administrator');

        $grade = $this->makeGrade($this->targetSubject, $this->sharedStudent, 90);

        // Trashed at the table rather than through the model: the column is
        // there but StudentRunningGrade does not use the SoftDeletes trait, and
        // it is the row on disk this test is about.
        DB::table('student_running_grades')
            ->where('id', $grade->id)
            ->update(['deleted_at' => now()]);

        $this->clear('super-token', ['assessments'])->assertOk();

        // Invisible in the app, and would otherwise survive a clean-up that
        // reported having taken it.
        $this->assertSame(0, DB::table('student_running_grades')->count());
    }

    public function test_preview_counts_what_the_clear_then_deletes(): void
    {
        $this->makeUser('super-token', 'super-administrator');
        $this->makeGrade($this->targetSubject, $this->sharedStudent, 90);
        $this->makeGrade($this->targetSubject, $this->makeStudent('Second', 'Learner'), 80);

        $preview = $this->withHeader('Authorization', 'Bearer super-token')
            ->postJson('/api/institution-cleanup/' . $this->target->id . '/preview', [
                'groups' => ['assessments'],
            ]);

        $preview->assertOk()
            ->assertJsonPath('data.total', 2)
            ->assertJsonPath('data.clearable', true);

        // The screen shows the preview and then runs the clear; if these two
        // disagreed the confirmation would be describing a different operation.
        $this->clear('super-token', ['assessments'])
            ->assertOk()
            ->assertJsonPath('data.total_deleted', 2);
    }
}
