<?php

namespace Tests\Feature;

use App\Models\ClassSection;
use App\Models\Institution;
use App\Models\Role;
use App\Models\Student;
use App\Models\StudentInstitution;
use App\Models\StudentSection;
use App\Models\Subject;
use App\Models\User;
use App\Models\UserInstitution;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Any staff member may correct a student's details from the Edit Student modal
 * on My Class Sections — no module permission stands behind it.
 *
 * What still holds: their own school only, a student cannot edit through the
 * portal, and whether a student is active stays with `students.manage`.
 */
class StaffStudentEditTest extends TestCase
{
    use RefreshDatabase;

    private Institution $schoolA;

    private User $teacher;

    private Student $advised;

    private Student $taught;

    private Student $otherClass;

    protected function setUp(): void
    {
        parent::setUp();

        $this->schoolA = Institution::factory()->create(['title' => 'School A']);

        $this->teacher = $this->makeStaff($this->schoolA, 'subject-teacher', 'teacher@edit.test', 'teacher-token');
        $otherTeacher = $this->makeStaff($this->schoolA, 'subject-teacher', 'other@edit.test', 'other-token');

        $advisory = $this->makeSection($this->schoolA, 'Rizal', $this->teacher);
        $subjectSection = $this->makeSection($this->schoolA, 'Bonifacio', $otherTeacher);
        $elsewhere = $this->makeSection($this->schoolA, 'Mabini', $otherTeacher);

        Subject::create([
            'institution_id' => $this->schoolA->id,
            'class_section_id' => $subjectSection->id,
            'adviser' => $this->teacher->id,
            'title' => 'Mathematics',
            'subject_type' => 'parent',
            'grading_type' => 'numerical',
        ]);

        $this->advised = $this->makeStudent($this->schoolA, $advisory);
        $this->taught = $this->makeStudent($this->schoolA, $subjectSection);
        $this->otherClass = $this->makeStudent($this->schoolA, $elsewhere);
    }

    private function makeStaff(Institution $institution, string $slug, string $email, string $token): User
    {
        $role = Role::firstOrCreate(['slug' => $slug], ['title' => ucfirst($slug)]);

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

    private function makeSection(Institution $institution, string $title, User $adviser): ClassSection
    {
        return ClassSection::create([
            'institution_id' => $institution->id,
            'grade_level' => 'Grade 4',
            'title' => $title,
            'adviser' => $adviser->id,
            'academic_year' => '2026-2027',
        ]);
    }

    private function makeStudent(Institution $institution, ?ClassSection $section): Student
    {
        $student = Student::create([
            'first_name' => 'Misspelt',
            'last_name' => 'Student',
            'gender' => 'male',
            'birthdate' => '2017-01-23',
            'is_active' => true,
        ]);

        StudentInstitution::create([
            'student_id' => $student->id,
            'institution_id' => $institution->id,
            'is_active' => true,
        ]);

        if ($section) {
            StudentSection::create([
                'student_id' => $student->id,
                'section_id' => $section->id,
                'academic_year' => '2026-2027',
                'is_active' => true,
            ]);
        }

        return $student;
    }

    private function asTeacher(): self
    {
        return $this->withHeader('Authorization', 'Bearer teacher-token');
    }

    public function test_a_subject_teacher_can_edit_a_student_in_their_advisory(): void
    {
        $this->asTeacher()
            ->putJson("/api/students/{$this->advised->id}", [
                'first_name' => 'Corrected',
                'lrn' => '123456789012',
            ])
            ->assertOk()
            ->assertJson(['success' => true]);

        $this->advised->refresh();
        $this->assertSame('Corrected', $this->advised->first_name);
        $this->assertSame('123456789012', $this->advised->lrn);
    }

    public function test_every_religion_the_form_offers_can_be_saved(): void
    {
        // The column is an enum; one the form offers but the column lacks is a
        // "Data truncated" error in MySQL strict mode, not a validation message.
        foreach (['Islam', 'Catholic', 'Iglesia Ni Cristo', 'Baptists', 'PMCC (4w)', 'Others'] as $religion) {
            $this->asTeacher()
                ->putJson("/api/students/{$this->advised->id}", ['religion' => $religion])
                ->assertOk();

            $this->assertSame($religion, $this->advised->refresh()->religion);
        }
    }

    public function test_the_file_upload_endpoint_is_reached_the_same_way(): void
    {
        $this->asTeacher()
            ->post("/api/students/{$this->advised->id}/update", ['first_name' => 'Corrected'], ['Accept' => 'application/json'])
            ->assertOk();

        $this->assertSame('Corrected', $this->advised->refresh()->first_name);
    }

    public function test_a_subject_teacher_can_edit_a_student_in_a_section_they_teach_a_subject_in(): void
    {
        $this->asTeacher()
            ->putJson("/api/students/{$this->taught->id}", ['first_name' => 'Corrected'])
            ->assertOk();

        $this->assertSame('Corrected', $this->taught->refresh()->first_name);
    }

    public function test_a_subject_teacher_can_edit_a_student_in_someone_elses_class(): void
    {
        $this->asTeacher()
            ->putJson("/api/students/{$this->otherClass->id}", ['first_name' => 'Corrected'])
            ->assertOk();

        $this->asTeacher()
            ->post("/api/students/{$this->otherClass->id}/update", ['last_name' => 'Fixed'], ['Accept' => 'application/json'])
            ->assertOk();

        $this->otherClass->refresh();
        $this->assertSame('Corrected', $this->otherClass->first_name);
        $this->assertSame('Fixed', $this->otherClass->last_name);
    }

    public function test_a_subject_teacher_cannot_deactivate_a_student(): void
    {
        // Whether a student is active is enrolment, which stays with whoever
        // manages student records.
        $this->asTeacher()
            ->putJson("/api/students/{$this->advised->id}", ['is_active' => false])
            ->assertOk();

        $this->assertTrue((bool) $this->advised->refresh()->is_active);
    }

    public function test_a_teacher_cannot_edit_a_student_at_another_school(): void
    {
        $schoolB = Institution::factory()->create(['title' => 'School B']);
        $foreign = $this->makeStudent($schoolB, null);

        $this->asTeacher()
            ->putJson("/api/students/{$foreign->id}", ['first_name' => 'Hijacked'])
            ->assertNotFound();
    }

    public function test_a_role_with_no_student_permission_can_still_edit(): void
    {
        $this->makeStaff($this->schoolA, 'hr', 'hr@edit.test', 'hr-token');

        $this->withHeader('Authorization', 'Bearer hr-token')
            ->putJson("/api/students/{$this->advised->id}", ['first_name' => 'Corrected'])
            ->assertOk();

        $this->assertSame('Corrected', $this->advised->refresh()->first_name);
    }

    public function test_a_signed_in_student_cannot_edit_their_own_record(): void
    {
        \App\Models\StudentAuth::create([
            'student_id' => $this->advised->id,
            'email' => 'advised@edit.test',
            'password' => \Illuminate\Support\Facades\Hash::make('student-password'),
            'is_new' => false,
        ]);

        $token = $this->postJson('/api/login', [
            'email' => 'advised@edit.test',
            'password' => 'student-password',
        ])->assertOk()->json('token');

        $this->withHeader('Authorization', "Bearer {$token}")
            ->putJson("/api/students/{$this->advised->id}", ['first_name' => 'Self'])
            ->assertForbidden();

        $this->assertSame('Misspelt', $this->advised->refresh()->first_name);
    }

    public function test_a_principal_still_edits_any_student_in_the_school(): void
    {
        $this->makeStaff($this->schoolA, 'principal', 'principal@edit.test', 'principal-token');

        $this->withHeader('Authorization', 'Bearer principal-token')
            ->putJson("/api/students/{$this->otherClass->id}", ['first_name' => 'Corrected', 'is_active' => false])
            ->assertOk();

        $this->otherClass->refresh();
        $this->assertSame('Corrected', $this->otherClass->first_name);
        $this->assertFalse((bool) $this->otherClass->is_active);
    }
}
