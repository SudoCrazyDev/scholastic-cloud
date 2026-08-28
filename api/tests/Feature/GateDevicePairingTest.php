<?php

namespace Tests\Feature;

use App\Models\GateDevice;
use App\Models\Institution;
use App\Models\Role;
use App\Models\User;
use App\Models\UserInstitution;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * How a gate kiosk gets an identity, and how it loses one.
 *
 * A kiosk used to be identified by an `institution_id` in its query string,
 * which is enough to write one scan but not to download a roster. These tests
 * pin the exchange that replaces it, and the parts of it that are silent when
 * wrong:
 *
 *  - a pairing code is shown **once**, at the moment it is minted, and never
 *    appears in a listing — an admin who could read it back would have a
 *    standing credential sitting in a GET response;
 *  - a code is **single-use**: a device that paired cannot pair again, so a
 *    code overheard or left on a screen does not mint a second token;
 *  - **unpairing is the revocation mechanism.** The token stops authenticating
 *    on the very next call, which is what tells a lost kiosk to drop its local
 *    copy of the roster;
 *  - a heartbeat that omits a field must not blank what the portal already
 *    knows, or a kiosk mid-sync would keep erasing its own reported progress.
 */
class GateDevicePairingTest extends TestCase
{
    use RefreshDatabase;

    private Institution $school;

    private Institution $otherSchool;

    private User $admin;

    private User $otherAdmin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->school = Institution::factory()->create(['title' => 'Gate Kiosk High']);
        $this->otherSchool = Institution::factory()->create(['title' => 'Neighbouring Academy']);

        $this->admin = $this->makeAdmin('admin@gate.test', 'token-gate-admin', $this->school);
        $this->otherAdmin = $this->makeAdmin('other@gate.test', 'token-other-admin', $this->otherSchool);
    }

    public function test_registering_a_device_returns_a_pairing_code_that_is_never_listed_again(): void
    {
        $created = $this->asAdmin($this->admin)->postJson('/api/gate/devices', [
            'name' => 'Main Gate Entrance',
            'location' => 'Front of the covered court',
            'gate_type' => 'enter',
        ])->assertCreated();

        $code = $created->json('data.pairing_code');
        $this->assertNotEmpty($code, 'The code is only ever handed out here.');
        $this->assertFalse($created->json('data.is_paired'));

        $listed = $this->asAdmin($this->admin)->getJson('/api/gate/devices')->assertOk();

        $this->assertCount(1, $listed->json('data'));
        $this->assertArrayNotHasKey('pairing_code', $listed->json('data.0'));
        // Whether a code is still live is fine to show; the code itself is not.
        $this->assertNotNull($listed->json('data.0.pairing_code_expires_at'));
    }

    public function test_pairing_exchanges_the_code_for_a_token_and_burns_the_code(): void
    {
        $code = $this->asAdmin($this->admin)->postJson('/api/gate/devices', [
            'name' => 'Exit Gate',
            'gate_type' => 'exit',
        ])->json('data.pairing_code');

        $paired = $this->postJson('/api/gate/pair', ['pairing_code' => $code])->assertOk();

        $token = $paired->json('token');
        $this->assertNotEmpty($token);
        $this->assertSame('exit', $paired->json('device.gate_type'));
        // The institution now comes from the token, which is the whole point.
        $this->assertSame($this->school->id, $paired->json('device.institution_id'));
        $this->assertNotNull($paired->json('server_time'));

        // Stored hashed, never in plaintext.
        $device = GateDevice::firstOrFail();
        $this->assertSame(hash('sha256', $token), $device->device_token_hash);
        $this->assertNull($device->pairing_code);

        // Single use: the same code cannot mint a second token.
        $this->postJson('/api/gate/pair', ['pairing_code' => $code])->assertStatus(422);
    }

    public function test_an_expired_code_does_not_pair(): void
    {
        $device = GateDevice::create([
            'institution_id' => $this->school->id,
            'name' => 'Side Gate',
            'gate_type' => 'enter',
            'pairing_code' => 'EXPIRD',
            'pairing_code_expires_at' => now()->subMinute(),
        ]);

        $this->postJson('/api/gate/pair', ['pairing_code' => 'EXPIRD'])->assertStatus(422);

        $this->assertNull($device->fresh()->device_token_hash);
    }

    public function test_heartbeat_records_what_the_device_reports_and_answers_with_the_server_clock(): void
    {
        $token = $this->pairedToken();

        $response = $this->withHeader('Authorization', 'Bearer '.$token)
            ->postJson('/api/gate/heartbeat', [
                'roster_count' => 3204,
                'pending_count' => 17,
                'clock_offset_ms' => 4200,
                'app_version' => '1.0.0',
            ])->assertOk();

        // A Pi with no RTC needs this to stamp queued scans with a sane time.
        $this->assertNotNull($response->json('server_time'));

        $device = GateDevice::firstOrFail();
        $this->assertSame(3204, $device->roster_count);
        $this->assertSame(17, $device->pending_count);
        $this->assertNotNull($device->last_seen_at);
        $this->assertSame('online', $device->computed_status);

        $listed = $this->asAdmin($this->admin)->getJson('/api/gate/devices')->json('data.0');
        $this->assertSame(3204, $listed['roster_count']);
        // 4.2s of drift is not enough to distrust the device's timestamps.
        $this->assertFalse($listed['clock_suspect']);
    }

    public function test_a_partial_heartbeat_does_not_blank_what_was_already_reported(): void
    {
        $token = $this->pairedToken();

        $this->withHeader('Authorization', 'Bearer '.$token)
            ->postJson('/api/gate/heartbeat', ['roster_count' => 3204, 'pending_count' => 5])
            ->assertOk();

        // A later beat that only has news about the outbox.
        $this->withHeader('Authorization', 'Bearer '.$token)
            ->postJson('/api/gate/heartbeat', ['pending_count' => 0])
            ->assertOk();

        $device = GateDevice::firstOrFail();
        $this->assertSame(3204, $device->roster_count, 'An omitted field must be left alone.');
        $this->assertSame(0, $device->pending_count);
    }

    public function test_a_badly_wrong_device_clock_is_flagged_to_the_portal(): void
    {
        $token = $this->pairedToken();

        $this->withHeader('Authorization', 'Bearer '.$token)
            ->postJson('/api/gate/heartbeat', ['clock_offset_ms' => 3 * 60 * 60 * 1000])
            ->assertOk();

        $listed = $this->asAdmin($this->admin)->getJson('/api/gate/devices')->json('data.0');
        $this->assertTrue($listed['clock_suspect'], 'Three hours out would land scans on the wrong day.');
    }

    public function test_unpairing_revokes_the_token_on_the_next_call(): void
    {
        $token = $this->pairedToken();
        $deviceId = GateDevice::firstOrFail()->id;

        $this->withHeader('Authorization', 'Bearer '.$token)
            ->postJson('/api/gate/heartbeat', ['roster_count' => 3204])
            ->assertOk();

        $unpaired = $this->asAdmin($this->admin)
            ->postJson("/api/gate/devices/{$deviceId}/unpair")
            ->assertOk();

        // The same physical kiosk is handed a fresh code rather than re-registered.
        $this->assertNotEmpty($unpaired->json('pairing_code'));

        // This 401 is what tells the kiosk to purge its local roster and photos.
        $this->withHeader('Authorization', 'Bearer '.$token)
            ->postJson('/api/gate/heartbeat', [])
            ->assertUnauthorized();

        $device = GateDevice::firstOrFail();
        $this->assertNull($device->roster_count, 'Stale counts would read as current.');
        $this->assertFalse($device->is_paired);
    }

    public function test_deleting_a_device_also_cuts_its_token_off(): void
    {
        $token = $this->pairedToken();
        $deviceId = GateDevice::firstOrFail()->id;

        $this->asAdmin($this->admin)->deleteJson("/api/gate/devices/{$deviceId}")->assertOk();

        $this->withHeader('Authorization', 'Bearer '.$token)
            ->postJson('/api/gate/heartbeat', [])
            ->assertUnauthorized();
    }

    public function test_a_paired_device_cannot_be_handed_a_new_code_without_unpairing(): void
    {
        $this->pairedToken();
        $deviceId = GateDevice::firstOrFail()->id;

        $this->asAdmin($this->admin)
            ->postJson("/api/gate/devices/{$deviceId}/refresh-pairing-code")
            ->assertStatus(422);
    }

    public function test_devices_are_scoped_to_the_admins_own_school(): void
    {
        $this->pairedToken();
        $deviceId = GateDevice::firstOrFail()->id;

        $this->assertEmpty(
            $this->asAdmin($this->otherAdmin)->getJson('/api/gate/devices')->json('data'),
            'A neighbouring school must not see this kiosk.'
        );

        $this->asAdmin($this->otherAdmin)->getJson("/api/gate/devices/{$deviceId}")->assertNotFound();
        $this->asAdmin($this->otherAdmin)->deleteJson("/api/gate/devices/{$deviceId}")->assertNotFound();

        $this->assertDatabaseHas('gate_devices', ['id' => $deviceId]);
    }

    /** Register a device and pair it, returning the plaintext device token. */
    private function pairedToken(string $gateType = 'enter'): string
    {
        $code = $this->asAdmin($this->admin)->postJson('/api/gate/devices', [
            'name' => 'Main Gate',
            'gate_type' => $gateType,
        ])->json('data.pairing_code');

        return $this->postJson('/api/gate/pair', ['pairing_code' => $code])->json('token');
    }

    private function asAdmin(User $user): self
    {
        return $this->withHeader('Authorization', 'Bearer '.$user->token);
    }

    private function makeAdmin(string $email, string $token, Institution $school): User
    {
        // A system role arrives with its built-in permissions, so this carries
        // gate-entries.view/manage without spelling them out.
        $role = Role::firstOrCreate(
            ['slug' => 'institution-administrator'],
            ['title' => 'Institution Administrator']
        );

        $user = User::factory()->create([
            'email' => $email,
            'token' => $token,
            'token_expiry' => now()->addYear()->toDateTimeString(),
        ]);

        UserInstitution::factory()->create([
            'user_id' => $user->id,
            'institution_id' => $school->id,
            'role_id' => $role->id,
            'is_default' => true,
            'is_main' => true,
        ]);

        return $user;
    }
}
