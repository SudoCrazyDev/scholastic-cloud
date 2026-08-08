<?php

namespace Tests\Feature;

use App\Models\Institution;
use App\Models\SmsGateway;
use App\Support\GatewayRuntime;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The two live-diagnostics questions a kiosk has to answer: *is the modem
 * plugged in?* and *what is the agent doing right now?*
 *
 * Neither is stored. Modem health, the agent's log tail, and any command an
 * admin has queued live in the file cache, so the usual "assert a row exists"
 * reflex does not apply — what these tests pin is the round trip through
 * `GatewayRuntime` and the two bridge endpoints that feed it.
 *
 * The parts worth protecting, because getting any of them wrong is silent:
 *  - a refresh is **one-shot** (a kiosk that kept seeing it would probe forever),
 *    while a log-stream request is **standing** (consuming it would truncate the
 *    stream to a single push and the viewer would look frozen);
 *  - a re-pushed line is **not** duplicated — the agent re-sends after a failed
 *    push and has no way to know the server already has it;
 *  - a restarted agent numbers from 1 again, so a new `run_id` **replaces** the
 *    tail rather than interleaving with it.
 *
 * These use the real file cache store, which outlives the test database, so
 * every gateway's state is explicitly forgotten in teardown.
 */
class SmsGatewayDiagnosticsTest extends TestCase
{
    use RefreshDatabase;

    private SmsGateway $gateway;

    private string $token;

    protected function setUp(): void
    {
        parent::setUp();

        $institution = Institution::factory()->create(['title' => 'Kiosk Diagnostics School']);

        $this->token = 'test-gateway-token-'.uniqid();

        $this->gateway = SmsGateway::create([
            'institution_id' => $institution->id,
            'name' => 'Front Office Kiosk',
            'status' => 'unknown',
            'sms_token_hash' => hash('sha256', $this->token),
        ]);
    }

    protected function tearDown(): void
    {
        // The file store is not rolled back with the database.
        GatewayRuntime::forget($this->gateway->id);

        parent::tearDown();
    }

    /** @param array<string, mixed> $payload */
    private function heartbeat(array $payload)
    {
        return $this->withHeader('Authorization', 'Bearer '.$this->token)
            ->postJson('/api/sms-gateway/heartbeat', $payload);
    }

    private function pollOutbox()
    {
        return $this->withHeader('Authorization', 'Bearer '.$this->token)
            ->getJson('/api/sms-gateway/outbox?limit=10');
    }

    public function test_heartbeat_records_modem_health_without_touching_the_gateway_row(): void
    {
        $this->heartbeat([
            'online' => true,
            'modem_connected' => false,
            'modem_error' => 'no response to AT on /dev/ttyUSB0',
            'modem_port' => '/dev/ttyUSB0',
        ])->assertOk();

        $health = GatewayRuntime::health($this->gateway->id);

        $this->assertNotNull($health);
        $this->assertFalse($health['connected']);
        $this->assertSame('no response to AT on /dev/ttyUSB0', $health['error']);
        $this->assertSame('/dev/ttyUSB0', $health['port']);
        $this->assertNotNull($health['checked_at']);

        // The agent is up even though its dongle is not — the row must still
        // say online, which is the whole reason modem health is separate.
        $this->assertTrue($this->gateway->fresh()->is_online);
    }

    public function test_a_heartbeat_without_modem_fields_leaves_earlier_health_alone(): void
    {
        $this->heartbeat(['online' => true, 'modem_connected' => true])->assertOk();

        // An agent older than 0.2.0 reports no modem fields at all. Its
        // heartbeat must not be read as "the modem went away".
        $this->heartbeat(['online' => true, 'signal_strength' => 20])->assertOk();

        $this->assertTrue(GatewayRuntime::health($this->gateway->id)['connected']);
    }

    public function test_a_queued_refresh_reaches_the_kiosk_exactly_once(): void
    {
        GatewayRuntime::requestRefresh($this->gateway->id);
        $this->assertTrue(GatewayRuntime::refreshPending($this->gateway->id));

        $this->pollOutbox()->assertOk()->assertJsonPath('commands', ['refresh']);

        // Consumed: a kiosk that saw it on every poll would probe forever.
        $this->pollOutbox()->assertOk()->assertJsonPath('commands', []);
        $this->assertFalse(GatewayRuntime::refreshPending($this->gateway->id));
    }

    public function test_a_log_stream_request_stands_until_it_lapses(): void
    {
        GatewayRuntime::requestLogStream($this->gateway->id);

        // Standing, not consumed — the viewer polls to renew it, and the agent
        // must keep being told to push on every one of its own polls.
        $this->pollOutbox()->assertOk()->assertJsonPath('commands', ['logs']);
        $this->pollOutbox()->assertOk()->assertJsonPath('commands', ['logs']);
    }

    public function test_pushed_log_lines_are_readable_and_never_duplicated(): void
    {
        $push = fn (array $lines) => $this->withHeader('Authorization', 'Bearer '.$this->token)
            ->postJson('/api/sms-gateway/logs', ['run_id' => 'run-a', 'lines' => $lines]);

        $push([
            ['seq' => 1, 'ts' => '2026-08-08T01:00:00.000Z', 'level' => 'info', 'text' => 'Modem ready'],
            ['seq' => 2, 'ts' => '2026-08-08T01:00:05.000Z', 'level' => 'warn', 'text' => 'Modem did not answer AT'],
        ])->assertOk();

        // The agent re-sends after a push it could not confirm; it has no way
        // to know the server already stored these.
        $push([
            ['seq' => 2, 'ts' => '2026-08-08T01:00:05.000Z', 'level' => 'warn', 'text' => 'Modem did not answer AT'],
            ['seq' => 3, 'ts' => '2026-08-08T01:00:09.000Z', 'level' => 'info', 'text' => 'Modem responding again'],
        ])->assertOk();

        $logs = GatewayRuntime::logs($this->gateway->id);
        $this->assertSame([1, 2, 3], array_column($logs['lines'], 'seq'));
        $this->assertSame('run-a', $logs['run_id']);

        // What the viewer asks for on every poll after its first.
        $incremental = GatewayRuntime::logs($this->gateway->id, 2);
        $this->assertSame([3], array_column($incremental['lines'], 'seq'));
    }

    public function test_a_restarted_agent_replaces_the_tail_instead_of_interleaving(): void
    {
        GatewayRuntime::appendLogs($this->gateway->id, 'run-a', [
            ['seq' => 1, 'ts' => '2026-08-08T01:00:00.000Z', 'level' => 'info', 'text' => 'before restart'],
            ['seq' => 2, 'ts' => '2026-08-08T01:00:01.000Z', 'level' => 'info', 'text' => 'also before'],
        ]);

        // A fresh process numbers from 1 again. Merging on seq would drop these
        // as "already known" and the viewer would sit on a dead tail.
        GatewayRuntime::appendLogs($this->gateway->id, 'run-b', [
            ['seq' => 1, 'ts' => '2026-08-08T01:05:00.000Z', 'level' => 'info', 'text' => 'after restart'],
        ]);

        $logs = GatewayRuntime::logs($this->gateway->id);

        $this->assertSame('run-b', $logs['run_id']);
        $this->assertCount(1, $logs['lines']);
        $this->assertSame('after restart', $logs['lines'][0]['text']);
    }

    public function test_forgetting_a_removed_gateway_clears_all_of_its_live_state(): void
    {
        GatewayRuntime::putHealth($this->gateway->id, ['connected' => true, 'error' => null, 'port' => 'COM3']);
        GatewayRuntime::requestRefresh($this->gateway->id);
        GatewayRuntime::requestLogStream($this->gateway->id);
        GatewayRuntime::appendLogs($this->gateway->id, 'run-a', [
            ['seq' => 1, 'ts' => '2026-08-08T01:00:00.000Z', 'level' => 'info', 'text' => 'hello'],
        ]);

        GatewayRuntime::forget($this->gateway->id);

        $this->assertNull(GatewayRuntime::health($this->gateway->id));
        $this->assertFalse(GatewayRuntime::refreshPending($this->gateway->id));
        $this->assertSame([], GatewayRuntime::takeCommands($this->gateway->id));
        $this->assertSame([], GatewayRuntime::logs($this->gateway->id)['lines']);
    }
}
