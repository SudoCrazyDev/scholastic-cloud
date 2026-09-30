<?php

namespace Tests\Feature;

use App\Models\ClassSection;
use App\Models\Institution;
use App\Models\Role;
use App\Models\Student;
use App\Models\StudentRunningGrade;
use App\Models\StudentSection;
use App\Models\Subject;
use App\Models\User;
use App\Models\UserInstitution;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Anyone signed in may transfer a student out of My Class Sections, so the
 * modal's options must load for a role holding neither Class Sections nor
 * Consolidated Grades — while still never showing another school's sections.
 */
class ClassSectionTransferOptionsTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_role_with_no_modules_gets_the_school_sections_and_graded_subjects(): void
    {
        $school = Institution::factory()->create();
        $otherSchool = Institution::factory()->create();

        $role = Role::factory()->create(['title' => 'Bare Role', 'slug' => 'bare-role']);
        $user = User::factory()->create([
            'token' => 'token-bare',
            'token_expiry' => now()->addYear()->toDateTimeString(),
        ]);
        UserInstitution::factory()->create([
            'user_id' => $user->id,
            'institution_id' => $school->id,
            'role_id' => $role->id,
            'is_default' => true,
            'is_main' => true,
        ]);

        $source = ClassSection::create(['institution_id' => $school->id, 'grade_level' => 'Grade 7', 'title' => 'Rizal']);
        $target = ClassSection::create(['institution_id' => $school->id, 'grade_level' => 'Grade 7', 'title' => 'Bonifacio']);
        $dissolved = ClassSection::create(['institution_id' => $school->id, 'grade_level' => 'Grade 7', 'title' => 'Old', 'status' => 'dissolve']);
        $foreign = ClassSection::create(['institution_id' => $otherSchool->id, 'grade_level' => 'Grade 7', 'title' => 'Elsewhere']);

        $math = Subject::create([
            'institution_id' => $school->id,
            'class_section_id' => $source->id,
            'title' => 'Mathematics',
            'subject_type' => 'parent',
            'grading_type' => 'numerical',
        ]);
        $science = Subject::create([
            'institution_id' => $school->id,
            'class_section_id' => $source->id,
            'title' => 'Science',
            'subject_type' => 'parent',
            'grading_type' => 'numerical',
        ]);

        $student = Student::create([
            'first_name' => 'Test',
            'last_name' => 'Student',
            'gender' => 'male',
            'birthdate' => '2010-01-01',
            'is_active' => true,
        ]);
        StudentSection::create([
            'student_id' => $student->id,
            'section_id' => $source->id,
            'academic_year' => '2026-2027',
            'is_active' => true,
        ]);
        StudentRunningGrade::create([
            'student_id' => $student->id,
            'subject_id' => $math->id,
            'quarter' => 1,
            'grade' => 90,
            'academic_year' => '2026-2027',
        ]);

        $response = $this->withHeader('Authorization', 'Bearer token-bare')
            ->getJson("/api/class-sections/{$source->id}/transfer-options?student_id={$student->id}")
            ->assertOk();

        $sectionIds = collect($response->json('data.sections'))->pluck('id');
        $this->assertTrue($sectionIds->contains($target->id));
        $this->assertFalse($sectionIds->contains($source->id));
        $this->assertFalse($sectionIds->contains($dissolved->id));
        $this->assertFalse($sectionIds->contains($foreign->id));

        $this->assertSame([$math->id], $response->json('data.graded_subject_ids'));
        $this->assertNotContains($science->id, $response->json('data.graded_subject_ids'));

        // Another school's section cannot be read through this endpoint.
        $this->withHeader('Authorization', 'Bearer token-bare')
            ->getJson("/api/class-sections/{$foreign->id}/transfer-options?student_id={$student->id}")
            ->assertNotFound();
    }
}
