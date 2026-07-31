<?php

namespace Tests\Feature;

use App\Models\Institution;
use App\Models\PayrollCompensation;
use App\Models\PayrollPeriod;
use App\Models\PayslipDay;
use App\Models\Role;
use App\Models\StaffAttendanceRequest;
use App\Models\StaffSchedule;
use App\Models\StaffScheduleAssignment;
use App\Models\StaffScheduleDay;
use App\Models\User;
use App\Models\UserInstitution;
use App\Services\PayrollService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * An approval can be a mistake — the wrong staff member picked from the list, a
 * reason that turned out not to hold, a day the principal was told about after
 * signing off. Disapproving is only open while a request is pending, so up to
 * now the only way back was to edit the database.
 *
 * Voiding takes the approval back: the row stays on record with who approved it
 * and who withdrew it, payroll stops reading it, and the dates are free for a
 * corrected request.
 */
class VoidAttendanceRequestTest extends TestCase
{
    use RefreshDatabase;

    /** Wed 29 Jul 2026 — the principal reviews, and payroll runs, on this day. */
    private const TODAY = '2026-07-29 10:00:00';

    /** Mon 27 Jul 2026: a past workday the staff member never punched for. */
    private const MISSED_DAY = '2026-07-27';

    private const DAILY_RATE = 1000.0;

    private Institution $institution;

    private User $principal;

    private User $staff;

    protected function setUp(): void
    {
        parent::setUp();

        $this->institution = Institution::factory()->create([
            'late_penalty_per_minute' => 2,
            'undertime_penalty_per_minute' => 2,
        ]);

        $principalRole = Role::factory()->create(['title' => 'Principal', 'slug' => 'principal']);
        $this->principal = User::factory()->create([
            'first_name' => 'Maria',
            'last_name' => 'Santos',
            'email' => 'principal@void.test',
            'token' => 'principal-token',
            'token_expiry' => now()->addYears(5)->toDateTimeString(),
        ]);
        UserInstitution::factory()->create([
            'user_id' => $this->principal->id,
            'institution_id' => $this->institution->id,
            'role_id' => $principalRole->id,
            'is_default' => true,
            'is_main' => true,
        ]);

        $teacherRole = Role::factory()->create(['title' => 'Subject Teacher', 'slug' => 'subject-teacher']);
        $this->staff = User::factory()->create([
            'email' => 'teacher@void.test',
            'token' => 'staff-token',
            'token_expiry' => now()->addYears(5)->toDateTimeString(),
        ]);
        UserInstitution::factory()->create([
            'user_id' => $this->staff->id,
            'institution_id' => $this->institution->id,
            'role_id' => $teacherRole->id,
            'is_default' => true,
            'is_main' => true,
        ]);

        PayrollCompensation::create([
            'institution_id' => $this->institution->id,
            'user_id' => $this->staff->id,
            'designation' => 'Teacher',
            'daily_rate' => self::DAILY_RATE,
            'hours_per_day' => 8,
        ]);

        // 8am–5pm Monday to Friday, one hour of lunch: eight paid hours.
        $schedule = StaffSchedule::create([
            'institution_id' => $this->institution->id,
            'name' => 'Regular Office Hours',
            'is_active' => true,
        ]);
        foreach (['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] as $weekday) {
            StaffScheduleDay::create([
                'staff_schedule_id' => $schedule->id,
                'day_of_week' => $weekday,
                'start_time' => '08:00:00',
                'end_time' => '17:00:00',
                'lunch_start' => '12:00:00',
                'lunch_end' => '13:00:00',
                'grace_minutes' => 0,
            ]);
        }
        StaffScheduleAssignment::create([
            'institution_id' => $this->institution->id,
            'staff_schedule_id' => $schedule->id,
            'user_id' => $this->staff->id,
        ]);

        $this->travelTo(self::TODAY);
    }

    private function asPrincipal()
    {
        return $this->withHeader('Authorization', 'Bearer principal-token');
    }

    private function asStaff()
    {
        return $this->withHeader('Authorization', 'Bearer staff-token');
    }

    /** The staff member files for the missed punch; the principal approves it. */
    private function approvedRequest(): StaffAttendanceRequest
    {
        $id = $this->asStaff()->postJson('/api/staff-attendance-requests', [
            'date_from' => self::MISSED_DAY,
            'date_to' => self::MISSED_DAY,
            'kind' => StaffAttendanceRequest::KIND_FORGOT_PUNCH,
            'reason' => 'Biometric did not read my finger that morning.',
        ])->assertCreated()->json('data.id');

        $this->asPrincipal()->postJson("/api/staff-attendance-requests/{$id}/approve")->assertOk();

        return StaffAttendanceRequest::findOrFail($id);
    }

    /** Generate (or regenerate) July and return the missed day as priced. */
    private function priceMissedDay(): PayslipDay
    {
        $period = PayrollPeriod::firstOrCreate(
            ['institution_id' => $this->institution->id, 'name' => 'July 2026'],
            ['date_from' => '2026-07-01', 'date_to' => '2026-07-31', 'status' => 'draft'],
        );

        app(PayrollService::class)->generateForPeriod($period);

        return $period->payslips()->where('user_id', $this->staff->id)->firstOrFail()
            ->days()->where('work_date', self::MISSED_DAY)->firstOrFail();
    }

    public function test_voiding_an_approval_charges_the_day_again(): void
    {
        $request = $this->approvedRequest();

        // Approved: no punches at all, and the day is still paid in full.
        $paid = $this->priceMissedDay();
        $this->assertSame(PayslipDay::PAY_FULL_DAY, $paid->pay_policy);
        $this->assertSame(self::DAILY_RATE, (float) $paid->amount_earned);

        $this->asPrincipal()->postJson("/api/staff-attendance-requests/{$request->id}/void", [
            'void_note' => 'Approved by mistake — this was the other Dela Cruz.',
        ])->assertOk();

        // Voided: payroll no longer reads it, so the missed day is an absence.
        $charged = $this->priceMissedDay();
        $this->assertNotSame(PayslipDay::PAY_FULL_DAY, $charged->pay_policy);
        $this->assertSame(0.0, (float) $charged->amount_earned);
    }

    public function test_voiding_records_who_took_the_approval_back_and_why(): void
    {
        $request = $this->approvedRequest();

        $data = $this->asPrincipal()->postJson("/api/staff-attendance-requests/{$request->id}/void", [
            'void_note' => 'The device log turned up — the punch was there all along.',
        ])->assertOk()->json('data');

        $this->assertSame(StaffAttendanceRequest::STATUS_VOIDED, $data['status']);
        $this->assertSame('The device log turned up — the punch was there all along.', $data['void_note']);
        $this->assertNotNull($data['voided_at']);
        $this->assertStringContainsString('Santos', (string) $data['voided_by_name']);

        // The approval it withdrew is still on record.
        $this->assertNotNull($request->fresh()->reviewed_at);
    }

    public function test_voiding_requires_a_reason(): void
    {
        $request = $this->approvedRequest();

        $this->asPrincipal()->postJson("/api/staff-attendance-requests/{$request->id}/void", [])
            ->assertStatus(422)
            ->assertJsonValidationErrors('void_note');

        $this->assertTrue($request->fresh()->isApproved());
    }

    public function test_a_voided_request_frees_the_dates_to_be_filed_again(): void
    {
        $request = $this->approvedRequest();

        $this->asPrincipal()->postJson("/api/staff-attendance-requests/{$request->id}/void", [
            'void_note' => 'Wrong dates — it was the Friday, not the Monday.',
        ])->assertOk();

        // The day is open again: the staff member may file a corrected request.
        $this->asStaff()->postJson('/api/staff-attendance-requests', [
            'date_from' => self::MISSED_DAY,
            'date_to' => self::MISSED_DAY,
            'kind' => StaffAttendanceRequest::KIND_FORGOT_PUNCH,
            'reason' => 'Refiling with the right reason.',
        ])->assertCreated();

        // ...and their timesheet offers the new one, not the voided row.
        $days = $this->asStaff()->getJson('/api/my-timesheet')->assertOk()->json('data.days');
        $day = collect($days)->firstWhere('date', self::MISSED_DAY);

        $this->assertNotNull($day['request']);
        $this->assertNotSame($request->id, $day['request']['id']);
        $this->assertSame(StaffAttendanceRequest::STATUS_PENDING, $day['request']['status']);
    }

    public function test_only_an_approver_may_void(): void
    {
        $request = $this->approvedRequest();

        // Not even the staff member the approval belongs to.
        $this->asStaff()->postJson("/api/staff-attendance-requests/{$request->id}/void", [
            'void_note' => 'I would rather this did not stand.',
        ])->assertStatus(403);

        $this->assertTrue($request->fresh()->isApproved());
    }

    public function test_a_request_that_was_never_approved_cannot_be_voided(): void
    {
        $id = $this->asStaff()->postJson('/api/staff-attendance-requests', [
            'date_from' => self::MISSED_DAY,
            'date_to' => self::MISSED_DAY,
            'kind' => StaffAttendanceRequest::KIND_FORGOT_PUNCH,
            'reason' => 'Still waiting on the principal.',
        ])->assertCreated()->json('data.id');

        // Pending is what disapproving is for; there is no approval to take back.
        $this->asPrincipal()->postJson("/api/staff-attendance-requests/{$id}/void", [
            'void_note' => 'Not happening.',
        ])->assertStatus(422);

        $this->assertTrue(StaffAttendanceRequest::findOrFail($id)->isPending());
    }

    public function test_a_voided_approval_cannot_be_voided_twice(): void
    {
        $request = $this->approvedRequest();

        $this->asPrincipal()->postJson("/api/staff-attendance-requests/{$request->id}/void", [
            'void_note' => 'The first reason, which is the one that should stick.',
        ])->assertOk();

        $this->asPrincipal()->postJson("/api/staff-attendance-requests/{$request->id}/void", [
            'void_note' => 'A second reason overwriting the first.',
        ])->assertStatus(422);

        $this->assertSame(
            'The first reason, which is the one that should stick.',
            $request->fresh()->void_note
        );
    }
}
