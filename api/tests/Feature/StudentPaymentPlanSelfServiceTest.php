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
 * A student/parent portal login choosing their own payment plan, and later changing
 * it. The `payment-plans` listing and the `students/{id}/payment-plan` store route
 * both need the `shared` audience tag for a StudentPortalUser to reach them at all —
 * EnsureModuleAccess otherwise 403s before the controller (which already enforces its
 * own, narrower rules) ever runs.
 *
 * A family may re-choose freely, but only for the year the school is currently running,
 * and every change is written to `student_payment_plan_changes` naming the portal account
 * that made it — that history is the only place finance can see a self-service change.
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

        $this->institution = Institution::factory()->create([
            'current_academic_year' => self::YEAR,
        ]);

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

    public function test_a_student_can_change_an_already_selected_plan(): void
    {
        $this->asStudent()->postJson("/api/students/{$this->student->id}/payment-plan", [
            'academic_year' => self::YEAR,
            'payment_plan_id' => $this->monthly->id,
        ])->assertOk();

        $this->asStudent()
            ->postJson("/api/students/{$this->student->id}/payment-plan", [
                'academic_year' => self::YEAR,
                'payment_plan_id' => $this->quarterly->id,
                'note' => 'Switching to quarterly terms',
            ])
            ->assertOk()
            ->assertJsonPath('data.name', 'Quarterly');

        // One selection row per student per year: the change replaces it rather than
        // leaving two plans in force.
        $this->assertDatabaseCount('student_payment_plans', 1);
        $this->assertDatabaseHas('student_payment_plans', [
            'student_id' => $this->student->id,
            'payment_plan_id' => $this->quarterly->id,
            'selected_by_student' => true,
        ]);
    }

    /**
     * The change history is what finance reads, so a self-service change has to name the
     * account that made it. A portal login is not a row in `users` — `changed_by` stays
     * null — which is why the actor is recorded as a label at the time of the change.
     */
    public function test_a_student_change_is_recorded_against_their_portal_account(): void
    {
        $this->asStudent()->postJson("/api/students/{$this->student->id}/payment-plan", [
            'academic_year' => self::YEAR,
            'payment_plan_id' => $this->monthly->id,
        ])->assertOk();

        $this->asStudent()->postJson("/api/students/{$this->student->id}/payment-plan", [
            'academic_year' => self::YEAR,
            'payment_plan_id' => $this->quarterly->id,
            'note' => 'Parent asked to move to quarterly',
        ])->assertOk();

        $this->assertDatabaseHas('student_payment_plan_changes', [
            'student_id' => $this->student->id,
            'academic_year' => self::YEAR,
            'payment_plan_id' => $this->monthly->id,
            'previous_payment_plan_id' => null,
            'changed_by' => null,
            'changed_by_student' => true,
            'changed_by_label' => 'Portal Picker (portal-picker@portal.test)',
        ]);

        // The change away from Monthly records where the student came from and why.
        $this->assertDatabaseHas('student_payment_plan_changes', [
            'student_id' => $this->student->id,
            'academic_year' => self::YEAR,
            'payment_plan_id' => $this->quarterly->id,
            'previous_payment_plan_id' => $this->monthly->id,
            'changed_by_student' => true,
            'changed_by_label' => 'Portal Picker (portal-picker@portal.test)',
            'note' => 'Parent asked to move to quarterly',
        ]);
    }

    public function test_re_selecting_the_same_plan_records_no_change(): void
    {
        foreach ([1, 2] as $ignored) {
            $this->asStudent()->postJson("/api/students/{$this->student->id}/payment-plan", [
                'academic_year' => self::YEAR,
                'payment_plan_id' => $this->monthly->id,
            ])->assertOk();
        }

        $this->assertDatabaseCount('student_payment_plan_changes', 1);
    }

    /**
     * A closed year's schedule is settled bookkeeping. Re-amortizing it would move due
     * dates and re-assess surcharges on a reconciled ledger, so only staff may correct one.
     */
    public function test_a_student_cannot_change_a_plan_for_another_academic_year(): void
    {
        $this->asStudent()
            ->postJson("/api/students/{$this->student->id}/payment-plan", [
                'academic_year' => '2025-2026',
                'payment_plan_id' => $this->quarterly->id,
            ])
            ->assertStatus(422);

        $this->assertDatabaseMissing('student_payment_plans', [
            'student_id' => $this->student->id,
            'academic_year' => '2025-2026',
        ]);
    }

    public function test_a_student_cannot_see_the_change_history(): void
    {
        $this->asStudent()
            ->getJson('/api/payment-plan-changes')
            ->assertStatus(403);
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
