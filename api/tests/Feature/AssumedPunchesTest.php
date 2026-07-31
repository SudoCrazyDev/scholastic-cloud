<?php

namespace Tests\Feature;

use App\Models\AttendanceLog;
use App\Models\BiometricDevice;
use App\Models\Institution;
use App\Models\PayrollCompensation;
use App\Models\PayrollPeriod;
use App\Models\Payslip;
use App\Models\PayslipDay;
use App\Models\Role;
use App\Models\StaffCalendarEvent;
use App\Models\StaffSchedule;
use App\Models\StaffScheduleAssignment;
use App\Models\StaffScheduleDay;
use App\Models\User;
use App\Models\UserInstitution;
use App\Services\PayrollService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Finance runs the payroll before the period is over so the cash is ready on
 * payday — the July run happens on the 29th. The days that have not happened
 * yet carry no punches, and pricing them as recorded pays ₱0 for days the staff
 * are going to work.
 *
 * Those punches are assumed from the staff member's own schedule and flagged,
 * so the money is right and the sheet still says which figures were not read
 * off a device.
 *
 * The line is today: a day already past with no punches is an absence, and
 * assuming it would quietly pay for one.
 */
class AssumedPunchesTest extends TestCase
{
    use RefreshDatabase;

    /** Payroll is generated on Wed 29 Jul 2026, covering the whole month. */
    private const GENERATED_ON = '2026-07-29 10:00:00';

    private const DAILY_RATE = 1000.0;

    private Institution $institution;

    private User $staff;

    private StaffSchedule $schedule;

    private BiometricDevice $device;

    protected function setUp(): void
    {
        parent::setUp();

        // Penalties on, so an assumed punch landing exactly on the schedule is
        // visibly free of late and undertime rather than accidentally so.
        $this->institution = Institution::factory()->create([
            'late_penalty_per_minute' => 2,
            'undertime_penalty_per_minute' => 2,
        ]);

        $role = Role::factory()->create(['title' => 'Principal', 'slug' => 'principal']);
        $admin = User::factory()->create([
            'email' => 'principal@assumed.test',
            'token' => 'test-token',
            'token_expiry' => now()->addYears(5)->toDateTimeString(),
        ]);
        UserInstitution::factory()->create([
            'user_id' => $admin->id,
            'institution_id' => $this->institution->id,
            'role_id' => $role->id,
            'is_default' => true,
            'is_main' => true,
        ]);

        $this->device = BiometricDevice::create([
            'institution_id' => $this->institution->id,
            'name' => 'Front gate',
            'serial_number' => 'ZK-ASSUMED-1',
        ]);

        $this->staff = User::factory()->create(['email' => 'teacher@assumed.test']);
        UserInstitution::factory()->create([
            'user_id' => $this->staff->id,
            'institution_id' => $this->institution->id,
            'is_default' => true,
        ]);

        PayrollCompensation::create([
            'institution_id' => $this->institution->id,
            'user_id' => $this->staff->id,
            'designation' => 'Teacher',
            'daily_rate' => self::DAILY_RATE,
            'hours_per_day' => 8,
        ]);

        // 8am–5pm Monday to Friday, one hour of lunch: eight paid hours.
        $this->schedule = StaffSchedule::create([
            'institution_id' => $this->institution->id,
            'name' => 'Regular Office Hours',
            'is_active' => true,
        ]);
        foreach (['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] as $weekday) {
            StaffScheduleDay::create([
                'staff_schedule_id' => $this->schedule->id,
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
            'staff_schedule_id' => $this->schedule->id,
            'user_id' => $this->staff->id,
        ]);

        // Every test in here reasons about "today", so the clock is pinned.
        $this->travelTo(self::GENERATED_ON);
    }

    private function punch(string $at): void
    {
        AttendanceLog::create([
            'institution_id' => $this->institution->id,
            'device_id' => $this->device->id,
            'zk_user_id' => '1',
            'user_id' => $this->staff->id,
            'punched_at' => $at,
        ]);
    }

    private function generate(): Payslip
    {
        $period = PayrollPeriod::create([
            'institution_id' => $this->institution->id,
            'name' => 'July 2026',
            'date_from' => '2026-07-01',
            'date_to' => '2026-07-31',
            'status' => 'draft',
        ]);

        app(PayrollService::class)->generateForPeriod($period);

        return $period->payslips()->where('user_id', $this->staff->id)->firstOrFail();
    }

    private function day(Payslip $payslip, string $date): PayslipDay
    {
        return $payslip->days()->where('work_date', $date)->firstOrFail();
    }

    public function test_a_future_workday_is_assumed_on_both_sides_and_paid_in_full(): void
    {
        // Thu 30 Jul, a scheduled workday nobody has reached yet.
        $day = $this->day($this->generate(), '2026-07-30');

        $this->assertSame('08:00:00', $day->time_in);
        $this->assertSame('17:00:00', $day->time_out);
        $this->assertTrue($day->assumed_time_in);
        $this->assertTrue($day->assumed_time_out);

        // Assumed exactly on the schedule, so neither penalty can bite.
        $this->assertSame(0, $day->late_minutes);
        $this->assertSame(0, $day->undertime_minutes);
        $this->assertSame(self::DAILY_RATE, (float) $day->amount_earned);
    }

    public function test_today_keeps_the_real_punch_in_and_assumes_only_the_punch_out(): void
    {
        $this->punch('2026-07-29 08:30:00');

        $day = $this->day($this->generate(), '2026-07-29');

        $this->assertSame('08:30:00', $day->time_in);
        $this->assertFalse($day->assumed_time_in);
        $this->assertSame('17:00:00', $day->time_out);
        $this->assertTrue($day->assumed_time_out);

        // Arriving half an hour late is real and still costs — assuming the
        // punch-out must not launder a late arrival into a clean day.
        $this->assertSame(30, $day->late_minutes);
        $this->assertSame(0, $day->undertime_minutes);
        $this->assertSame(60.0, (float) $day->penalty_amount);
        $this->assertSame(940.0, (float) $day->amount_earned);
    }

    public function test_a_past_day_without_punches_stays_an_absence(): void
    {
        // Tue 28 Jul is over. No punches means the staff member was absent,
        // and nothing about that is an assumption.
        $day = $this->day($this->generate(), '2026-07-28');

        $this->assertNull($day->time_in);
        $this->assertNull($day->time_out);
        $this->assertFalse($day->assumed_time_in);
        $this->assertFalse($day->assumed_time_out);
        $this->assertSame(0.0, (float) $day->amount_earned);
    }

    public function test_a_past_day_missing_only_its_punch_out_is_not_assumed_either(): void
    {
        // Punched in on Mon 27 Jul and never punched out. The day is over, so
        // that is a real problem for a payroll manager to settle — not
        // something to paper over with the scheduled end time.
        $this->punch('2026-07-27 08:00:00');

        $day = $this->day($this->generate(), '2026-07-27');

        $this->assertSame('08:00:00', $day->time_in);
        $this->assertNull($day->time_out);
        $this->assertFalse($day->assumed_time_out);
        $this->assertSame(0.0, (float) $day->amount_earned);
    }

    public function test_a_future_rest_day_is_not_assumed_into_a_worked_day(): void
    {
        // The schedule stops at Friday, so Sat 1 and Sun 2 Aug are rest days —
        // both still to come, and neither is a day anybody is owed for.
        $period = PayrollPeriod::create([
            'institution_id' => $this->institution->id,
            'name' => 'Into August 2026',
            'date_from' => '2026-07-01',
            'date_to' => '2026-08-02',
            'status' => 'draft',
        ]);
        app(PayrollService::class)->generateForPeriod($period);
        $payslip = $period->payslips()->where('user_id', $this->staff->id)->firstOrFail();

        foreach (['2026-08-01', '2026-08-02'] as $weekend) {
            $day = $this->day($payslip, $weekend);
            $this->assertTrue($day->is_rest_day, "{$weekend} should be a rest day");
            $this->assertFalse($day->assumed_time_in);
            $this->assertFalse($day->assumed_time_out);
            $this->assertSame(0.0, (float) $day->amount_earned);
        }
    }

    public function test_a_future_holiday_is_not_assumed_into_a_worked_day(): void
    {
        StaffCalendarEvent::create([
            'institution_id' => $this->institution->id,
            'title' => 'Special non-working day',
            'event_date' => '2026-07-30',
            'type' => 'holiday',
        ]);

        $day = $this->day($this->generate(), '2026-07-30');

        $this->assertTrue($day->is_holiday);
        $this->assertFalse($day->assumed_time_in);
        $this->assertFalse($day->assumed_time_out);
    }

    public function test_a_day_already_declared_unpaid_stays_unpaid(): void
    {
        StaffCalendarEvent::create([
            'institution_id' => $this->institution->id,
            'title' => 'Unpaid suspension',
            'event_date' => '2026-07-30',
            'type' => 'suspension',
            'pay_treatment' => StaffCalendarEvent::PAY_NO_PAY,
        ]);

        $day = $this->day($this->generate(), '2026-07-30');

        // Somebody signed off on this day earning nothing. An assumption must
        // not pay it.
        $this->assertSame(PayslipDay::PAY_NO_PAY, $day->pay_policy);
        $this->assertFalse($day->assumed_time_in);
        $this->assertSame(0.0, (float) $day->amount_earned);
    }

    public function test_staff_without_a_schedule_are_paid_the_daily_rate_on_assumed_days(): void
    {
        StaffScheduleAssignment::where('user_id', $this->staff->id)->delete();

        $day = $this->day($this->generate(), '2026-07-30');

        // No shift to read times off, so there is nothing to fill in — but the
        // day is still owed.
        $this->assertNull($day->time_in);
        $this->assertTrue($day->assumed_time_in);
        $this->assertSame(PayslipDay::PAY_FULL_DAY, $day->pay_policy);
        $this->assertSame(self::DAILY_RATE, (float) $day->amount_earned);
    }

    public function test_the_payslip_counts_the_days_resting_on_assumptions(): void
    {
        $payslip = $this->generate();

        // Wed 29, Thu 30, Fri 31 — the weekend is not assumed.
        $this->assertSame(3, $payslip->assumed_days);
        $this->assertSame(3, $payslip->days()->where('assumed_time_out', true)->count());
    }

    public function test_regenerating_once_the_real_punches_land_replaces_the_assumption(): void
    {
        $payslip = $this->generate();
        $this->assertTrue($this->day($payslip, '2026-07-29')->assumed_time_out);

        // The staff member left early; the punch reaches the server later.
        $this->punch('2026-07-29 08:00:00');
        $this->punch('2026-07-29 15:00:00');

        $period = $payslip->payrollPeriod;
        app(PayrollService::class)->generateForPeriod($period);
        $rebuilt = $period->payslips()->where('user_id', $this->staff->id)->firstOrFail();

        $day = $this->day($rebuilt, '2026-07-29');
        $this->assertSame('15:00:00', $day->time_out);
        $this->assertFalse($day->assumed_time_out);
        // Two hours of undertime that the assumption had been hiding.
        $this->assertSame(120, $day->undertime_minutes);
        $this->assertSame(760.0, (float) $day->amount_earned);
    }

    public function test_typing_a_time_over_an_assumed_day_clears_the_flag(): void
    {
        $payslip = $this->generate();
        $day = $this->day($payslip, '2026-07-30');

        $this->withHeader('Authorization', 'Bearer test-token')
            ->putJson("/api/payslips/{$payslip->id}/days/{$day->id}", [
                'time_in' => '08:00',
                'time_out' => '16:00',
            ])
            ->assertOk();

        $day->refresh();

        // A payroll manager's entry is not an assumption, and the sheet should
        // stop hedging about it.
        $this->assertFalse($day->assumed_time_in);
        $this->assertFalse($day->assumed_time_out);
        // Jul 29 and 31 are still assumed; only the day that was typed over
        // stops counting.
        $this->assertSame(2, $payslip->fresh()->assumed_days);
    }

    public function test_the_payslip_list_names_the_assumed_dates(): void
    {
        $this->generate();

        $dates = $this->withHeader('Authorization', 'Bearer test-token')
            ->getJson('/api/payroll-periods/'.PayrollPeriod::first()->id.'/payslips')
            ->assertOk()
            ->json('assumed_dates');

        $this->assertSame(['2026-07-29', '2026-07-30', '2026-07-31'], $dates);
    }

    public function test_generate_reports_attendance_that_stopped_arriving(): void
    {
        // The devices went quiet on the 24th; the 27th and 28th are priced as
        // absences and nothing else would ever say so.
        $this->punch('2026-07-24 08:00:00');
        $this->punch('2026-07-24 17:00:00');

        $period = PayrollPeriod::create([
            'institution_id' => $this->institution->id,
            'name' => 'July 2026',
            'date_from' => '2026-07-01',
            'date_to' => '2026-07-31',
            'status' => 'draft',
        ]);

        $warning = $this->withHeader('Authorization', 'Bearer test-token')
            ->postJson("/api/payroll-periods/{$period->id}/generate")
            ->assertOk()
            ->json('warning');

        $this->assertNotNull($warning);
        $this->assertStringContainsString('Jul 24, 2026', $warning);
        $this->assertStringContainsString('Jul 28, 2026', $warning);
    }

    public function test_generate_stays_quiet_when_attendance_is_up_to_date(): void
    {
        // Yesterday is the last day that could possibly have punches.
        $this->punch('2026-07-28 08:00:00');
        $this->punch('2026-07-28 17:00:00');

        $period = PayrollPeriod::create([
            'institution_id' => $this->institution->id,
            'name' => 'July 2026',
            'date_from' => '2026-07-01',
            'date_to' => '2026-07-31',
            'status' => 'draft',
        ]);

        $warning = $this->withHeader('Authorization', 'Bearer test-token')
            ->postJson("/api/payroll-periods/{$period->id}/generate")
            ->assertOk()
            ->json('warning');

        $this->assertNull($warning);
    }
}
