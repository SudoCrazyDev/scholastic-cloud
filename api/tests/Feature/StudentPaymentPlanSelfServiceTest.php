<?php

namespace Tests\Feature;

use App\Models\Institution;
use App\Models\PaymentPlan;
use App\Models\Student;
use App\Models\StudentAuth;
use App\Models\StudentInstitution;
use App\Models\StudentPaymentPlan;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * A student/parent portal login choosing their own payment plan for the first
 * time. The `payment-plans` listing and the `students/{id}/payment-plan` store
 * route both need the `shared` audience tag for a StudentPortalUser to reach
 * them at all — EnsureModuleAccess otherwise 403s before the controller (which
 * already enforces its own, narrower rules) ever runs.
 */
class StudentPaymentPlanSelfServiceTest extends TestCase
{
    use RefreshDatabase;

    private const YEAR = '2026-2027';

    private Institution $institution;

    private Student $student;

    private PaymentPlan $monthly;

    private PaymentPlan $quarterly;

    private PaymentPlan $legacy;

    protected function setUp(): void
    {
        parent::setUp();

        $this->institution = Institution::factory()->create();

        $this->student = Student::create([
            'first_name' => 'Portal',
            'last_name' => 'Picker',
            'gender' => 'female',
            'birthdate' => '2011-06-01',
            'is_active' => true,
        ]);
        StudentInstitution::create([
            'student_id' => $this->student->id,
            'institution_id' => $this->institution->id,
            'is_active' => true,
            'academic_year' => self::YEAR,
        ]);
        StudentAuth::create([
            'student_id' => $this->student->id,
            'email' => 'portal-picker@portal.test',
            'password' => Hash::make('student-password'),
            'is_new' => false,
            'token' => 'portal-picker-token',
            'token_expiry' => now()->addYear()->toDateTimeString(),
        ]);

        $this->monthly = PaymentPlan::create([
            'institution_id' => $this->institution->id,
            'name' => 'Monthly',
            'is_active' => true,
            'sort_order' => 1,
        ]);
        $this->quarterly = PaymentPlan::create([
            'institution_id' => $this->institution->id,
            'name' => 'Quarterly',
            'is_active' => true,
            'sort_order' => 2,
        ]);
        $this->legacy = PaymentPlan::create([
            'institution_id' => $this->institution->id,
            'name' => 'Legacy',
            'is_active' => false,
            'sort_order' => 3,
        ]);
    }

    private function asStudent()
    {
        return $this->withHeader('Authorization', 'Bearer portal-picker-token');
    }

    public function test_a_student_can_list_only_active_plans(): void
    {
        $names = $this->asStudent()
            ->getJson('/api/payment-plans')
            ->assertOk()
            ->json('data.*.name');

        $this->assertEqualsCanonicalizing(['Monthly', 'Quarterly'], $names);
    }

    public function test_a_student_can_select_a_payment_plan_for_the_first_time(): void
    {
        $this->asStudent()
            ->postJson("/api/students/{$this->student->id}/payment-plan", [
                'academic_year' => self::YEAR,
                'payment_plan_id' => $this->quarterly->id,
            ])
            ->assertOk()
            ->assertJsonPath('data.name', 'Quarterly');

        $this->assertDatabaseHas('student_payment_plans', [
            'student_id' => $this->student->id,
            'payment_plan_id' => $this->quarterly->id,
            'selected_by_student' => true,
        ]);
    }

    public function test_a_student_cannot_change_an_already_selected_plan(): void
    {
        $this->asStudent()->postJson("/api/students/{$this->student->id}/payment-plan", [
            'academic_year' => self::YEAR,
            'payment_plan_id' => $this->monthly->id,
        ])->assertOk();

        $this->asStudent()->postJson("/api/students/{$this->student->id}/payment-plan", [
            'academic_year' => self::YEAR,
            'payment_plan_id' => $this->quarterly->id,
        ])->assertStatus(409);

        $this->assertDatabaseHas('student_payment_plans', [
            'student_id' => $this->student->id,
            'payment_plan_id' => $this->monthly->id,
        ]);
    }

    public function test_a_student_cannot_select_an_inactive_plan(): void
    {
        $this->asStudent()
            ->postJson("/api/students/{$this->student->id}/payment-plan", [
                'academic_year' => self::YEAR,
                'payment_plan_id' => $this->legacy->id,
            ])
            ->assertStatus(422);
    }

    public function test_a_student_cannot_create_a_payment_plan_definition(): void
    {
        $this->asStudent()
            ->postJson('/api/payment-plans', [
                'name' => 'Sneaky',
                'installments' => [
                    ['due_month' => 7, 'due_day' => 10],
                ],
            ])
            ->assertStatus(403);
    }

    public function test_a_student_cannot_select_a_plan_for_another_student(): void
    {
        $otherStudent = Student::create([
            'first_name' => 'Other',
            'last_name' => 'Student',
            'gender' => 'male',
            'birthdate' => '2012-02-02',
            'is_active' => true,
        ]);
        StudentInstitution::create([
            'student_id' => $otherStudent->id,
            'institution_id' => $this->institution->id,
            'is_active' => true,
            'academic_year' => self::YEAR,
        ]);

        $this->asStudent()
            ->postJson("/api/students/{$otherStudent->id}/payment-plan", [
                'academic_year' => self::YEAR,
                'payment_plan_id' => $this->monthly->id,
            ])
            ->assertStatus(403);

        $this->assertDatabaseMissing('student_payment_plans', [
            'student_id' => $otherStudent->id,
        ]);
    }
}
