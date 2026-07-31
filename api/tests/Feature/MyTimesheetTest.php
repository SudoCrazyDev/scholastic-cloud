<?php

namespace Tests\Feature;

use App\Models\AttendanceLog;
use App\Models\BiometricDevice;
use App\Models\Institution;
use App\Models\Role;
use App\Models\StaffAttendanceRequest;
use App\Models\StaffCalendarEvent;
use App\Models\StaffSchedule;
use App\Models\StaffScheduleAssignment;
use App\Models\StaffScheduleDay;
use App\Models\User;
use App\Models\UserInstitution;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * A punch the biometric never recorded costs the staff member the whole day,
 * and today the first they hear of it is the payslip. The dashboard timesheet
 * shows them their own punches while the period is still open, flags the days
 * payroll would not pay in full, and offers the request that fixes each one.
 *
 * Today is deliberately never flagged: the punch-out has not happened yet.
 */
class MyTimesheetTest extends TestCase
{
    use RefreshDatabase;

    /** Wed 29 Jul 2026, 6pm in Manila — the day the staff member looks. */
    private const TODAY = '2026-07-29 10:00:00';

    private Institution $institution;

    private User $staff;

    private BiometricDevice $device;

    protected function setUp(): void
    {
        parent::setUp();

        $this->institution = Institution::factory()->create([
            'late_penalty_per_minute' => 2,
            'undertime_penalty_per_minute' => 2,
        ]);

        $role = Role::factory()->create(['title' => 'Subject Teacher', 'slug' => 'subject-teacher']);

        $this->staff = User::factory()->create([
            'email' => 'teacher@timesheet.test',
            'token' => 'staff-token',
            'token_expiry' => now()->addYears(5)->toDateTimeString(),
        ]);
        UserInstitution::factory()->create([
            'user_id' => $this->staff->id,
            'institution_id' => $this->institution->id,
            'role_id' => $role->id,
            'is_default' => true,
            'is_main' => true,
        ]);

        $this->device = BiometricDevice::create([
            'institution_id' => $this->institution->id,
            'name' => 'Front gate',
            'serial_number' => 'ZK-TIMESHEET-1',
        ]);

        // 8am–5pm Monday to Friday, one hour of lunch.
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

    private function punch(string $at, ?string $userId = null): void
    {
        AttendanceLog::create([
            'institution_id' => $this->institution->id,
            'device_id' => $this->device->id,
            'zk_user_id' => '1',
            'user_id' => $userId ?? $this->staff->id,
            'punched_at' => $at,
        ]);
    }

    /** @return array<string, array<string, mixed>> the timesheet keyed by date */
    private function timesheet(string $token = 'staff-token'): array
    {
        $days = $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson('/api/my-timesheet')
            ->assertOk()
            ->json('data.days');

        return collect($days)->keyBy('date')->all();
    }

    public function test_a_day_missing_its_punch_out_is_flagged(): void
    {
        // Mon 27 Jul: punched in, never punched out. Payroll reads zero hours
        // off that and pays nothing for the day.
        $this->punch('2026-07-27 08:00:00');

        $day = $this->timesheet()['2026-07-27'];

        $this->assertSame('08:00', $day['time_in']);
        $this->assertNull($day['time_out']);
        $this->assertSame('missing_out', $day['issue']);
    }

    public function test_a_workday_with_no_punches_at_all_is_flagged(): void
    {
        $day = $this->timesheet()['2026-07-28'];

        $this->assertSame('no_punch', $day['issue']);
        $this->assertSame(0, $day['punch_count']);
    }

    public function test_today_is_shown_but_never_flagged(): void
    {
        $this->punch('2026-07-29 08:00:00');

        $day = $this->timesheet()['2026-07-29'];

        $this->assertTrue($day['is_today']);
        $this->assertSame('08:00', $day['time_in']);
        // The punch-out has not happened yet — that is not a missed punch.
        $this->assertNull($day['time_out']);
        $this->assertNull($day['issue']);
    }

    public function test_a_late_arrival_is_flagged_without_being_called_a_missed_punch(): void
    {
        $this->punch('2026-07-27 08:31:00');
        $this->punch('2026-07-27 17:00:00');

        $day = $this->timesheet()['2026-07-27'];

        $this->assertSame('late', $day['issue']);
        $this->assertSame(31, $day['late_minutes']);
    }

    public function test_a_complete_day_carries_no_issue(): void
    {
        $this->punch('2026-07-27 08:00:00');
        $this->punch('2026-07-27 17:00:00');

        $day = $this->timesheet()['2026-07-27'];

        $this->assertNull($day['issue']);
        $this->assertSame(8.0, (float) $day['hours_worked']);
    }

    public function test_rest_days_and_holidays_are_not_flagged(): void
    {
        StaffCalendarEvent::create([
            'institution_id' => $this->institution->id,
            'title' => 'Special non-working day',
            'event_date' => '2026-07-28',
            'type' => 'holiday',
        ]);

        $days = $this->timesheet();

        // Sat 25 Jul is outside the schedule; the 28th is a declared holiday.
        $this->assertTrue($days['2026-07-25']['is_rest_day']);
        $this->assertNull($days['2026-07-25']['issue']);
        $this->assertTrue($days['2026-07-28']['is_holiday']);
        $this->assertNull($days['2026-07-28']['issue']);
    }

    public function test_an_approved_request_credits_the_missing_punch_and_clears_the_flag(): void
    {
        $this->punch('2026-07-27 08:00:00');

        StaffAttendanceRequest::create([
            'institution_id' => $this->institution->id,
            'user_id' => $this->staff->id,
            'date_from' => '2026-07-27',
            'date_to' => '2026-07-27',
            'kind' => StaffAttendanceRequest::KIND_FORGOT_PUNCH,
            'waive_late' => true,
            'waive_undertime' => true,
            'pay_full_day' => true,
            'credited_time_out' => '17:00:00',
            'reason' => 'Forgot to tap out.',
            'status' => StaffAttendanceRequest::STATUS_APPROVED,
        ]);

        $day = $this->timesheet()['2026-07-27'];

        $this->assertSame('17:00', $day['time_out']);
        $this->assertTrue($day['credited_time_out']);
        // The real punch-in is untouched and still marked as recorded.
        $this->assertFalse($day['credited_time_in']);
        $this->assertNull($day['issue']);
        $this->assertSame('approved', $day['request']['status']);
    }

    public function test_a_pending_request_is_attached_so_the_day_is_not_filed_twice(): void
    {
        StaffAttendanceRequest::create([
            'institution_id' => $this->institution->id,
            'user_id' => $this->staff->id,
            'date_from' => '2026-07-28',
            'date_to' => '2026-07-28',
            'kind' => StaffAttendanceRequest::KIND_FORGOT_PUNCH,
            'reason' => 'Device was down.',
            'status' => StaffAttendanceRequest::STATUS_PENDING,
        ]);

        $day = $this->timesheet()['2026-07-28'];

        // Still a problem, but one already in somebody's queue.
        $this->assertSame('no_punch', $day['issue']);
        $this->assertSame('pending', $day['request']['status']);
    }

    public function test_a_disapproved_request_leaves_the_day_open_to_file_again(): void
    {
        StaffAttendanceRequest::create([
            'institution_id' => $this->institution->id,
            'user_id' => $this->staff->id,
            'date_from' => '2026-07-28',
            'date_to' => '2026-07-28',
            'kind' => StaffAttendanceRequest::KIND_FORGOT_PUNCH,
            'reason' => 'Wrong date.',
            'status' => StaffAttendanceRequest::STATUS_DISAPPROVED,
        ]);

        $this->assertNull($this->timesheet()['2026-07-28']['request']);
    }

    public function test_it_only_ever_shows_the_caller_their_own_punches(): void
    {
        $colleague = User::factory()->create(['email' => 'colleague@timesheet.test']);
        UserInstitution::factory()->create([
            'user_id' => $colleague->id,
            'institution_id' => $this->institution->id,
            'is_default' => true,
        ]);

        $this->punch('2026-07-27 07:45:00', $colleague->id);

        $this->assertNull($this->timesheet()['2026-07-27']['time_in']);
    }

    public function test_it_reports_when_the_devices_last_said_anything(): void
    {
        $this->punch('2026-07-24 08:00:00');
        $this->punch('2026-07-24 17:00:00');

        $lastAttendance = $this->withHeader('Authorization', 'Bearer staff-token')
            ->getJson('/api/my-timesheet')
            ->assertOk()
            ->json('data.last_attendance_date');

        // The 27th and 28th read as absences only because nothing has synced.
        $this->assertSame('2026-07-24', $lastAttendance);
    }

    public function test_students_have_no_staff_timesheet(): void
    {
        $studentRole = Role::factory()->create(['title' => 'Student', 'slug' => 'student']);
        $student = User::factory()->create([
            'email' => 'pupil@timesheet.test',
            'token' => 'student-token',
            'token_expiry' => now()->addYears(5)->toDateTimeString(),
        ]);
        UserInstitution::factory()->create([
            'user_id' => $student->id,
            'institution_id' => $this->institution->id,
            'role_id' => $studentRole->id,
            'is_default' => true,
        ]);

        $this->withHeader('Authorization', 'Bearer student-token')
            ->getJson('/api/my-timesheet')
            ->assertForbidden();
    }

    public function test_it_shows_the_whole_month_so_far_by_default(): void
    {
        $body = $this->withHeader('Authorization', 'Bearer staff-token')
            ->getJson('/api/my-timesheet')
            ->assertOk()
            ->json('data');

        // Every day of the period being paid for, not a rolling two weeks that
        // has already dropped the 1st.
        $this->assertSame('2026-07-01', $body['from']);
        $this->assertSame('2026-07-29', $body['to']);
        $this->assertSame('2026-07-01', collect($body['days'])->first()['date']);
    }

    public function test_early_in_a_month_it_still_reaches_back_two_weeks(): void
    {
        // Sat 1 Aug: the month so far is one day, but July's missed punches
        // can still be filed against.
        $this->travelTo('2026-08-01 10:00:00');

        $from = $this->withHeader('Authorization', 'Bearer staff-token')
            ->getJson('/api/my-timesheet')
            ->assertOk()
            ->json('data.from');

        $this->assertSame('2026-07-19', $from);
    }

    public function test_the_window_never_runs_past_today(): void
    {
        $body = $this->withHeader('Authorization', 'Bearer staff-token')
            ->getJson('/api/my-timesheet?from=2026-07-27&to=2026-08-15')
            ->assertOk()
            ->json('data');

        $this->assertSame('2026-07-29', $body['to']);
        $this->assertSame('2026-07-29', collect($body['days'])->last()['date']);
    }
}
