<?php

namespace Tests\Feature;

use App\Models\GateDevice;
use App\Models\GateUnresolvedScan;
use App\Models\Institution;
use App\Models\Role;
use App\Models\Student;
use App\Models\StudentInstitution;
use App\Models\StudentRfidTag;
use App\Models\User;
use App\Models\UserInstitution;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * The worklist of cards that tapped and could not be placed.
 *
 * The point of this table is that an unregistered card stops being invisible: a
 * new enrolment or a replacement tag taps at the gate, nothing can be recorded,
 * and the office — the only people who can fix it — used to hear nothing. So
 * what is worth pinning is that it stays a *worklist* rather than becoming a
 * second log: one row per card, a count that grows, and a row that leaves on its
 * own the moment the card starts working.
 */
class GateUnresolvedScanTest extends TestCase
{
    use RefreshDatabase;

    private Institution $school;

    private Institution $otherSchool;

    private GateDevice $device;

    private string $token;

    private User $adminUser;

    protected function setUp(): void
    {
        parent::setUp();

        $this->school = Institution::factory()->create(['title' => 'Worklist High']);
        $this->otherSchool = Institution::factory()->create(['title' => 'Elsewhere Academy']);

        $this->token = 'worklist-token-'.uniqid();
        $this->device = GateDevice::create([
            'institution_id' => $this->school->id,
            'name' => 'Front Gate',
            'gate_type' => 'enter',
            'device_token_hash' => hash('sha256', $this->token),
        ]);
    }

    public function test_a_tap_nobody_can_place_becomes_a_row_the_office_can_see(): void
    {
        $this->upload('UNREGISTERED-CARD', now()->subMinutes(10));

        $scan = GateUnresolvedScan::firstWhere('rfid_uid', 'UNREGISTERED-CARD');

        $this->assertNotNull($scan);
        $this->assertSame($this->school->id, $scan->institution_id);
        $this->assertSame($this->device->id, $scan->gate_device_id);
        $this->assertSame('Front Gate', $scan->device_name);
        $this->assertSame('enter', $scan->type);
        $this->assertSame(1, $scan->attempts);
    }

    public function test_the_same_card_tapping_again_counts_rather_than_repeats(): void
    {
        $morning = now()->subHours(2);

        $this->upload('UNREGISTERED-CARD', $morning);
        $this->upload('UNREGISTERED-CARD', $morning->copy()->addMinutes(5));
        $this->upload('UNREGISTERED-CARD', $morning->copy()->addMinutes(40));

        $this->assertSame(1, GateUnresolvedScan::count());

        $scan = GateUnresolvedScan::first();

        // "This card tapped 3 times, first at 7:00, most recently at 7:40" is
        // actionable; three identical rows are just noise.
        $this->assertSame(3, $scan->attempts);
        $this->assertSame($morning->startOfSecond()->toDateTimeString(), $scan->first_seen_at->toDateTimeString());
        $this->assertSame(
            $morning->copy()->addMinutes(40)->startOfSecond()->toDateTimeString(),
            $scan->last_seen_at->toDateTimeString(),
        );
    }

    public function test_a_backlog_arriving_out_of_order_keeps_the_real_first_and_last(): void
    {
        $this->upload('UNREGISTERED-CARD', now()->subHour());
        // A device with a bad clock, or a queue uploaded in a strange order.
        $this->upload('UNREGISTERED-CARD', now()->subHours(3));

        $scan = GateUnresolvedScan::first();

        $this->assertSame(
            now()->subHours(3)->startOfSecond()->toDateTimeString(),
            $scan->first_seen_at->toDateTimeString(),
        );
        $this->assertSame(
            now()->subHour()->startOfSecond()->toDateTimeString(),
            $scan->last_seen_at->toDateTimeString(),
        );
    }

    public function test_registering_the_card_clears_it_from_the_worklist(): void
    {
        $this->upload('SOON-TO-WORK', now()->subMinutes(20));
        $this->assertSame(1, GateUnresolvedScan::count());

        // The office does what the worklist is asking for.
        $student = $this->enrolled();
        StudentRfidTag::create([
            'student_id' => $student->id,
            'rfid_uid' => 'SOON-TO-WORK',
            'is_active' => true,
        ]);

        $this->upload('SOON-TO-WORK', now()->subMinutes(2));

        // No dismissing needed: the card works, so it is no longer a problem.
        $this->assertSame(0, GateUnresolvedScan::count());
    }

    public function test_a_doubtful_clock_is_carried_through_to_the_worklist(): void
    {
        $this->upload('UNREGISTERED-CARD', now()->subMinutes(5), clockSuspect: true);

        // Otherwise the office reads a precise-looking time the device itself
        // could not vouch for.
        $this->assertTrue(GateUnresolvedScan::first()->clock_suspect);
    }

    public function test_the_list_shows_only_this_schools_cards(): void
    {
        GateUnresolvedScan::note([
            'institution_id' => $this->school->id,
            'gate_device_id' => $this->device->id,
            'rfid_uid' => 'OURS',
            'type' => 'enter',
            'device_name' => 'Front Gate',
            'last_seen_at' => now()->subMinutes(5),
            'clock_suspect' => false,
        ]);

        GateUnresolvedScan::note([
            'institution_id' => $this->otherSchool->id,
            'gate_device_id' => null,
            'rfid_uid' => 'THEIRS',
            'type' => 'enter',
            'device_name' => 'Their Gate',
            'last_seen_at' => now()->subMinutes(5),
            'clock_suspect' => false,
        ]);

        $response = $this->asAdmin()->getJson('/api/gate/unresolved-scans');

        $response->assertOk();

        $uids = collect($response->json('data'))->pluck('rfid_uid');
        $this->assertContains('OURS', $uids);
        $this->assertNotContains('THEIRS', $uids);
    }

    public function test_the_list_can_be_narrowed_to_one_gate(): void
    {
        foreach (['enter', 'exit'] as $type) {
            GateUnresolvedScan::note([
                'institution_id' => $this->school->id,
                'gate_device_id' => $this->device->id,
                'rfid_uid' => "CARD-{$type}",
                'type' => $type,
                'device_name' => 'Front Gate',
                'last_seen_at' => now()->subMinutes(5),
                'clock_suspect' => false,
            ]);
        }

        $response = $this->asAdmin()->getJson('/api/gate/unresolved-scans?gate_type=exit');

        $uids = collect($response->json('data'))->pluck('rfid_uid');
        $this->assertSame(['CARD-exit'], $uids->all());
    }

    public function test_a_card_can_be_dismissed_but_not_another_schools(): void
    {
        GateUnresolvedScan::note([
            'institution_id' => $this->otherSchool->id,
            'gate_device_id' => null,
            'rfid_uid' => 'THEIRS',
            'type' => 'enter',
            'device_name' => 'Their Gate',
            'last_seen_at' => now(),
            'clock_suspect' => false,
        ]);
        GateUnresolvedScan::note([
            'institution_id' => $this->school->id,
            'gate_device_id' => $this->device->id,
            'rfid_uid' => 'OURS',
            'type' => 'enter',
            'device_name' => 'Front Gate',
            'last_seen_at' => now(),
            'clock_suspect' => false,
        ]);

        $theirs = GateUnresolvedScan::firstWhere('rfid_uid', 'THEIRS');
        $ours = GateUnresolvedScan::firstWhere('rfid_uid', 'OURS');

        // Knowing the id must not be enough.
        $this->asAdmin()->deleteJson("/api/gate/unresolved-scans/{$theirs->id}")->assertNotFound();
        $this->assertNotNull($theirs->fresh());

        $this->asAdmin()->deleteJson("/api/gate/unresolved-scans/{$ours->id}")->assertOk();
        $this->assertNull($ours->fresh());
    }

    public function test_the_list_needs_a_signed_in_user(): void
    {
        $this->getJson('/api/gate/unresolved-scans')->assertStatus(401);
    }

    // ── Fixtures ────────────────────────────────────────────────────────────

    private function upload(string $uid, Carbon $scannedAt, bool $clockSuspect = false): void
    {
        $this->post('/api/gate/scans', [
            'scans' => [[
                'client_scan_id' => 'scan-'.uniqid('', true),
                'rfid_uid' => $uid,
                'scanned_at' => $scannedAt->toISOString(),
                'clock_suspect' => $clockSuspect,
            ]],
        ], [
            'Authorization' => 'Bearer '.$this->token,
            'Accept' => 'application/json',
        ])->assertOk();
    }

    private function enrolled(): Student
    {
        $student = Student::create([
            'first_name' => 'Ana',
            'last_name' => 'Cruz',
            'gender' => 'female',
            'birthdate' => '2012-01-01',
            'is_active' => true,
        ]);

        StudentInstitution::create([
            'student_id' => $student->id,
            'institution_id' => $this->school->id,
            'is_active' => true,
            'academic_year' => '2026-2027',
        ]);

        return $student;
    }

    /**
     * Authentication here is a custom bearer token resolved against `users`, not
     * a Laravel guard, so `actingAs` reaches nothing — same shape as
     * GateDevicePairingTest.
     */
    private function asAdmin(): self
    {
        return $this->withHeader('Authorization', 'Bearer '.$this->admin()->token);
    }

    private function admin(): User
    {
        if (isset($this->adminUser)) {
            return $this->adminUser;
        }

        // A system role arrives with its built-in permissions, so this carries
        // gate-entries.view/manage without spelling them out.
        $role = Role::firstOrCreate(
            ['slug' => 'institution-administrator'],
            ['title' => 'Institution Administrator']
        );

        $this->adminUser = User::factory()->create([
            'email' => 'worklist-admin@example.com',
            'token' => 'worklist-admin-token',
            'token_expiry' => now()->addYear()->toDateTimeString(),
        ]);

        UserInstitution::factory()->create([
            'user_id' => $this->adminUser->id,
            'institution_id' => $this->school->id,
            'role_id' => $role->id,
            'is_default' => true,
            'is_main' => true,
        ]);

        return $this->adminUser;
    }
}
