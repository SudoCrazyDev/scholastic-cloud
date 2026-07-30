<?php

namespace Tests\Feature;

use App\Models\Institution;
use App\Models\PayrollPeriod;
use App\Models\Role;
use App\Models\StaffSchedule;
use App\Models\User;
use App\Models\UserInstitution;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Payroll periods have to tile: every working day belongs to exactly one period
 * paying a given employee.
 *
 * Calendar months enforced that on their own. A cut-off shifted off the
 * calendar — Jun 26 – Jul 25, so finance can process before month end — is
 * typed by hand, so both failures become reachable: an overlap pays a day
 * twice, and a gap pays it to nobody. Nothing downstream reports either one,
 * which is why the boundary is checked at the point the period is saved.
 */
class PayrollPeriodCoverageTest extends TestCase
{
    use RefreshDatabase;

    private Institution $institution;

    protected function setUp(): void
    {
        parent::setUp();

        $this->institution = Institution::factory()->create();
        $role = Role::factory()->create(['title' => 'Principal', 'slug' => 'principal']);

        $admin = User::factory()->create([
            'email' => 'principal@coverage.test',
            'token' => 'test-token',
            'token_expiry' => now()->addDay()->toDateTimeString(),
        ]);
        UserInstitution::factory()->create([
            'user_id' => $admin->id,
            'institution_id' => $this->institution->id,
            'role_id' => $role->id,
            'is_default' => true,
            'is_main' => true,
        ]);
    }

    private function api()
    {
        return $this->withHeader('Authorization', 'Bearer test-token');
    }

    /** The July cut-off finance actually runs: Jun 26 – Jul 25, paid Jul 30. */
    private function julyPeriod(array $overrides = []): PayrollPeriod
    {
        return PayrollPeriod::create(array_merge([
            'institution_id' => $this->institution->id,
            'name' => 'July 2026',
            'date_from' => '2026-06-26',
            'date_to' => '2026-07-25',
            'status' => 'draft',
        ], $overrides));
    }

    private function schedule(string $name): StaffSchedule
    {
        return StaffSchedule::create([
            'institution_id' => $this->institution->id,
            'name' => $name,
            'is_active' => true,
        ]);
    }

    /** @param array<string, mixed> $payload */
    private function createPeriod(array $payload)
    {
        return $this->api()->postJson('/api/payroll-periods', array_merge([
            'schedule_scope' => 'all',
        ], $payload));
    }

    public function test_the_next_period_starting_the_day_after_is_saved_without_complaint(): void
    {
        $this->julyPeriod();

        $response = $this->createPeriod([
            'name' => 'August 2026',
            'date_from' => '2026-07-26',
            'date_to' => '2026-08-25',
        ])->assertCreated();

        $this->assertNull($response->json('warning'));
    }

    public function test_a_gap_between_periods_is_saved_but_reported(): void
    {
        $this->julyPeriod();

        // Jul 26 belongs to no period: everyone loses a day's pay and nothing
        // downstream would ever say so.
        $warning = $this->createPeriod([
            'name' => 'August 2026',
            'date_from' => '2026-07-27',
            'date_to' => '2026-08-25',
        ])->assertCreated()->json('warning');

        $this->assertNotNull($warning);
        $this->assertStringContainsString('Jul 26, 2026', $warning);
        $this->assertStringContainsString('July 2026', $warning);
    }

    public function test_a_multi_day_gap_is_reported_as_a_range(): void
    {
        $this->julyPeriod();

        $warning = $this->createPeriod([
            'name' => 'August 2026',
            'date_from' => '2026-08-01',
            'date_to' => '2026-08-31',
        ])->assertCreated()->json('warning');

        $this->assertStringContainsString('Jul 26 – Jul 31, 2026', $warning);
    }

    public function test_the_first_period_of_an_institution_has_nothing_to_gap_from(): void
    {
        $response = $this->createPeriod([
            'name' => 'July 2026',
            'date_from' => '2026-06-26',
            'date_to' => '2026-07-25',
        ])->assertCreated();

        $this->assertNull($response->json('warning'));
    }

    public function test_an_overlapping_period_is_rejected(): void
    {
        $this->julyPeriod();

        // Jul 20–25 would be paid by both periods.
        $this->createPeriod([
            'name' => 'August 2026',
            'date_from' => '2026-07-20',
            'date_to' => '2026-08-25',
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('date_from');

        $this->assertSame(1, PayrollPeriod::count());
    }

    public function test_a_period_swallowing_an_existing_one_is_rejected(): void
    {
        $this->julyPeriod();

        $this->createPeriod([
            'name' => 'Whole year 2026',
            'date_from' => '2026-01-01',
            'date_to' => '2026-12-31',
        ])->assertStatus(422)->assertJsonValidationErrors('date_from');
    }

    public function test_editing_a_period_does_not_conflict_with_itself(): void
    {
        $period = $this->julyPeriod();

        $this->api()->putJson("/api/payroll-periods/{$period->id}", [
            'name' => 'July 2026',
            'date_from' => '2026-06-26',
            'date_to' => '2026-07-24',
            'schedule_scope' => 'all',
        ])->assertOk();

        $this->assertSame('2026-07-24', $period->fresh()->date_to->toDateString());
    }

    public function test_periods_for_different_staff_schedules_may_share_dates(): void
    {
        // One period per schedule over the same dates is what schedule scoping
        // is for — teaching staff paid on one run, non-teaching on another.
        $teaching = $this->schedule('Teaching');
        $support = $this->schedule('Support');

        $this->createPeriod([
            'name' => 'July 2026 — Teaching',
            'date_from' => '2026-06-26',
            'date_to' => '2026-07-25',
            'schedule_scope' => 'schedules',
            'staff_schedule_ids' => [$teaching->id],
        ])->assertCreated();

        $this->createPeriod([
            'name' => 'July 2026 — Support',
            'date_from' => '2026-06-26',
            'date_to' => '2026-07-25',
            'schedule_scope' => 'schedules',
            'staff_schedule_ids' => [$support->id],
        ])->assertCreated();

        $this->assertSame(2, PayrollPeriod::count());
    }

    public function test_two_periods_sharing_one_schedule_still_conflict(): void
    {
        $teaching = $this->schedule('Teaching');
        $support = $this->schedule('Support');

        $this->createPeriod([
            'name' => 'July 2026 — Teaching',
            'date_from' => '2026-06-26',
            'date_to' => '2026-07-25',
            'schedule_scope' => 'schedules',
            'staff_schedule_ids' => [$teaching->id],
        ])->assertCreated();

        // Teaching staff would be paid twice for these dates.
        $this->createPeriod([
            'name' => 'July 2026 — Everyone else',
            'date_from' => '2026-07-01',
            'date_to' => '2026-07-25',
            'schedule_scope' => 'schedules',
            'staff_schedule_ids' => [$support->id, $teaching->id],
        ])->assertStatus(422)->assertJsonValidationErrors('date_from');
    }

    public function test_an_all_staff_period_conflicts_with_a_scoped_one(): void
    {
        $teaching = $this->schedule('Teaching');

        $this->createPeriod([
            'name' => 'July 2026 — Teaching',
            'date_from' => '2026-06-26',
            'date_to' => '2026-07-25',
            'schedule_scope' => 'schedules',
            'staff_schedule_ids' => [$teaching->id],
        ])->assertCreated();

        $this->createPeriod([
            'name' => 'July 2026 — All',
            'date_from' => '2026-06-26',
            'date_to' => '2026-07-25',
        ])->assertStatus(422)->assertJsonValidationErrors('date_from');
    }

    public function test_a_gap_is_measured_against_the_previous_period_for_the_same_staff(): void
    {
        $teaching = $this->schedule('Teaching');
        $support = $this->schedule('Support');

        $this->createPeriod([
            'name' => 'July 2026 — Teaching',
            'date_from' => '2026-06-26',
            'date_to' => '2026-07-25',
            'schedule_scope' => 'schedules',
            'staff_schedule_ids' => [$teaching->id],
        ])->assertCreated();

        // Support's own first period. The teaching period ended Jul 25 but pays
        // nobody on this run, so it is not the period this one has to meet.
        $response = $this->createPeriod([
            'name' => 'August 2026 — Support',
            'date_from' => '2026-08-01',
            'date_to' => '2026-08-31',
            'schedule_scope' => 'schedules',
            'staff_schedule_ids' => [$support->id],
        ])->assertCreated();

        $this->assertNull($response->json('warning'));
    }

    public function test_another_institutions_periods_are_not_consulted(): void
    {
        $other = Institution::factory()->create();
        PayrollPeriod::create([
            'institution_id' => $other->id,
            'name' => 'July 2026',
            'date_from' => '2026-06-26',
            'date_to' => '2026-07-25',
            'status' => 'draft',
        ]);

        $response = $this->createPeriod([
            'name' => 'July 2026',
            'date_from' => '2026-06-26',
            'date_to' => '2026-07-25',
        ])->assertCreated();

        $this->assertNull($response->json('warning'));
    }
}
