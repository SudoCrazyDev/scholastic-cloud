<?php

namespace Tests\Feature\Matatag;

use App\Models\ClassSection;
use App\Models\Institution;
use App\Models\InstitutionFeature;
use App\Models\MatatagCurriculumVersion;
use App\Models\MatatagLearningArea;
use App\Models\MatatagSectionCurriculum;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\Student;
use App\Models\StudentAuth;
use App\Models\StudentInstitution;
use App\Models\StudentSection;
use App\Models\User;
use App\Models\UserInstitution;
use App\Support\Features;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * The two-school fixture every MATATAG feature test shares.
 *
 * Two schools, because most of the bugs this module can have only show up when
 * there is somewhere else for a request to reach. Modelled on
 * `SecurityAuthorizationTest`'s fixture, which exists for the same reason.
 *
 * School A has two Grade 1 sections with different advisers — that is what
 * makes "an adviser cannot open the section next door" a testable claim — plus
 * a Grade 10 section, which is there to prove the numeric grading the rest of
 * the school runs on is untouched.
 */
abstract class MatatagTestCase extends TestCase
{
    use RefreshDatabase;

    protected const YEAR = '2026-2027';

    protected const CATALOG_CODE = 'deped-matatag-ks1-grade-1-v1';

    protected Institution $schoolA;

    protected Institution $schoolB;

    /** Holds view, manage, view-all and set-up in School A. */
    protected User $principalA;

    protected User $principalB;

    /** Advises section A1. Holds view and manage, but not view-all. */
    protected User $adviserA1;

    /** Advises section A2. */
    protected User $adviserA2;

    protected ClassSection $sectionA1;

    protected ClassSection $sectionA2;

    protected ClassSection $sectionA10;

    protected ClassSection $sectionB1;

    /** @var array<int, Student> */
    protected array $learnersA1 = [];

    protected Student $learnerB;

    protected function setUp(): void
    {
        parent::setUp();

        $this->schoolA = Institution::factory()->create(['title' => 'School A']);
        $this->schoolB = Institution::factory()->create(['title' => 'School B']);

        $this->principalA = $this->makeUser($this->schoolA, 'principal', 'principal-a@matatag.test', 'tok-principal-a');
        $this->principalB = $this->makeUser($this->schoolB, 'principal', 'principal-b@matatag.test', 'tok-principal-b');
        $this->adviserA1 = $this->makeUser($this->schoolA, 'subject-teacher', 'adviser-a1@matatag.test', 'tok-adviser-a1');
        $this->adviserA2 = $this->makeUser($this->schoolA, 'subject-teacher', 'adviser-a2@matatag.test', 'tok-adviser-a2');

        $this->sectionA1 = $this->makeSection($this->schoolA, 'Grade 1', 'Sampaguita', $this->adviserA1);
        $this->sectionA2 = $this->makeSection($this->schoolA, 'Grade 1', 'Rosal', $this->adviserA2);
        $this->sectionA10 = $this->makeSection($this->schoolA, 'Grade 10', 'Einstein', $this->adviserA1);
        $this->sectionB1 = $this->makeSection($this->schoolB, 'Grade 1', 'Ilang-Ilang', $this->principalB);

        foreach ([['Ana', 'Bautista', 'female'], ['Ben', 'Cruz', 'male'], ['Cara', 'Dizon', 'female']] as $i => $who) {
            $this->learnersA1[] = $this->makeLearner($this->schoolA, $this->sectionA1, ...$who);
        }

        $this->learnerB = $this->makeLearner($this->schoolB, $this->sectionB1, 'Elias', 'Faustino', 'male');

        $this->enableFeature($this->schoolA);
        $this->enableFeature($this->schoolB);
    }

    // -----------------------------------------------------------------
    // Fixture builders
    // -----------------------------------------------------------------

    protected function makeUser(Institution $institution, string $roleSlug, string $email, string $token): User
    {
        // Role::booted() syncs the seeded permission set for a known system
        // slug, so these users hold exactly what the real ones do — including
        // the matatag-grading grants added in SystemRolePermissions.
        $role = Role::firstOrCreate(
            ['slug' => $roleSlug],
            ['title' => ucwords(str_replace('-', ' ', $roleSlug))],
        );

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

    protected function makeSection(Institution $institution, string $gradeLevel, string $title, User $adviser): ClassSection
    {
        return ClassSection::create([
            'institution_id' => $institution->id,
            'grade_level' => $gradeLevel,
            'title' => $title,
            'adviser' => $adviser->id,
            'academic_year' => self::YEAR,
        ]);
    }

    protected function makeLearner(
        Institution $institution,
        ClassSection $section,
        string $first,
        string $last,
        string $gender,
        ?string $middle = null,
        ?string $ext = null,
    ): Student {
        $student = Student::create([
            'first_name' => $first,
            'middle_name' => $middle,
            'last_name' => $last,
            'ext_name' => $ext,
            'gender' => $gender,
            'birthdate' => '2020-06-15',
            'is_active' => true,
        ]);

        StudentInstitution::create([
            'student_id' => $student->id,
            'institution_id' => $institution->id,
            'is_active' => true,
        ]);

        StudentSection::create([
            'student_id' => $student->id,
            'section_id' => $section->id,
            'academic_year' => self::YEAR,
            'is_active' => true,
        ]);

        return $student;
    }

    protected function makeStudentPortalToken(Student $student, string $token): void
    {
        StudentAuth::create([
            'student_id' => $student->id,
            'email' => $student->id.'@portal.test',
            'password' => Hash::make('student-password'),
            'is_new' => false,
            'token' => $token,
            'token_expiry' => now()->addYear()->toDateTimeString(),
        ]);
    }

    // -----------------------------------------------------------------
    // Gates
    // -----------------------------------------------------------------

    /**
     * `Features::$resolved` is a static per-request memo, so flushing after
     * every change is mandatory — without it a test that switches the feature
     * on keeps seeing it off.
     */
    protected function enableFeature(Institution $institution, bool $enabled = true): void
    {
        InstitutionFeature::updateOrCreate(
            ['institution_id' => $institution->id, 'feature' => 'matatag-grading'],
            ['enabled' => $enabled],
        );

        Features::flush();
    }

    /** Give a role an extra module ability — `view-all`, say. */
    protected function grant(User $user, string $permission): void
    {
        $roleId = UserInstitution::where('user_id', $user->id)->value('role_id');

        RolePermission::firstOrCreate(['role_id' => $roleId, 'permission' => $permission]);
    }

    protected function revoke(User $user, string $permission): void
    {
        $roleId = UserInstitution::where('user_id', $user->id)->value('role_id');

        RolePermission::where('role_id', $roleId)->where('permission', $permission)->delete();
    }

    // -----------------------------------------------------------------
    // Callers
    // -----------------------------------------------------------------

    protected function as(User $user): self
    {
        return $this->withHeader('Authorization', 'Bearer '.$user->token);
    }

    // -----------------------------------------------------------------
    // Catalog helpers
    // -----------------------------------------------------------------

    protected function catalog(): MatatagCurriculumVersion
    {
        return MatatagCurriculumVersion::where('code', self::CATALOG_CODE)->firstOrFail();
    }

    protected function area(string $key): MatatagLearningArea
    {
        return MatatagLearningArea::where('curriculum_version_id', $this->catalog()->id)
            ->where('key', $key)
            ->firstOrFail();
    }

    protected function optIn(ClassSection $section, ?MatatagCurriculumVersion $version = null): MatatagSectionCurriculum
    {
        $version ??= $this->catalog();

        return MatatagSectionCurriculum::updateOrCreate(
            ['class_section_id' => $section->id, 'academic_year' => self::YEAR],
            [
                'institution_id' => $section->institution_id,
                'curriculum_version_id' => $version->id,
                'grade_level' => $section->grade_level,
                'enabled' => true,
                'enabled_at' => now(),
            ],
        );
    }

    /**
     * The slots of one (area, term), in the order the grid shows them.
     *
     * @return array<int, \App\Models\MatatagCompetencySlot>
     */
    protected function slotsFor(string $areaKey, int $term): array
    {
        return \App\Models\MatatagCompetencySlot::where('learning_area_id', $this->area($areaKey)->id)
            ->where('term', $term)
            ->orderBy('sort_order')
            ->get()
            ->all();
    }
}
