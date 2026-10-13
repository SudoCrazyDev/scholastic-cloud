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
 * A subject teacher may correct the details of a student in their own class
 * section, from the Edit Student modal on My Class Sections.
 *
 * They hold `students` read-only, so the grant is `students.edit-profile`, and
 * the edge of it is the point: a student in a section they advise or teach a
 * subject in, and nobody else — not another teacher's class, not another school.
 */
class SubjectTeacherStudentEditTest extends TestCase
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

    public function test_a_subject_teacher_cannot_edit_a_student_in_someone_elses_class(): void
    {
        $this->asTeacher()
            ->putJson("/api/students/{$this->otherClass->id}", ['first_name' => 'Hijacked'])
            ->assertForbidden();

        $this->asTeacher()
            ->post("/api/students/{$this->otherClass->id}/update", ['first_name' => 'Hijacked'], ['Accept' => 'application/json'])
            ->assertForbidden();

        $this->assertSame('Misspelt', $this->otherClass->refresh()->first_name);
    }

    public function test_a_student_who_has_left_the_section_is_no_longer_the_teachers(): void
    {
        StudentSection::where('student_id', $this->advised->id)->update(['is_active' => false]);

        $this->asTeacher()
            ->putJson("/api/students/{$this->advised->id}", ['first_name' => 'Late'])
            ->assertForbidden();
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

    public function test_a_role_holding_neither_permission_is_refused(): void
    {
        $this->makeStaff($this->schoolA, 'hr', 'hr@edit.test', 'hr-token');

        $this->withHeader('Authorization', 'Bearer hr-token')
            ->putJson("/api/students/{$this->advised->id}", ['first_name' => 'Hijacked'])
            ->assertForbidden();
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
