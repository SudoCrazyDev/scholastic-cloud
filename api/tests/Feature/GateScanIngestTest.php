<?php

namespace Tests\Feature;

use App\Models\GateDevice;
use App\Models\GateSmsSetting;
use App\Models\Institution;
use App\Models\RfidScanLog;
use App\Models\SmsMessage;
use App\Models\Student;
use App\Models\StudentInstitution;
use App\Models\StudentRfidTag;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Batch ingest — the write path, and the phase where a bug stops being cosmetic.
 *
 * Up to here a kiosk only *read* from its cache; a wrong answer was visible on
 * screen and no scan was at risk. From here the device holds attendance records
 * that exist nowhere else until this endpoint accepts them, so what these tests
 * pin is the handful of behaviours that decide whether a record survives:
 *
 *  - **an ack lost in flight costs nothing** — the same batch sent twice records
 *    one row, because a device that cannot tell "written" from "reply lost" has
 *    to retry, and double-counted attendance is worse than late attendance;
 *  - **every row is answered**, so the device knows exactly which queued scans it
 *    may delete and which it must keep;
 *  - **one bad row does not cost the batch** the rows around it;
 *  - **the server resolves the tap**, not the device — a card issued after the
 *    device's last sync is unknown there and perfectly known here;
 *  - a device reaches only its **own institution's** students;
 *  - a **`both` gate** must say which direction, and is refused if it does not;
 *  - a backlog does **not** text parents hours late.
 */
class GateScanIngestTest extends TestCase
{
    use RefreshDatabase;

    private Institution $school;

    private Institution $otherSchool;

    private GateDevice $device;

    private string $token;

    protected function setUp(): void
    {
        parent::setUp();

        $this->school = Institution::factory()->create(['title' => 'Ingest High']);
        $this->otherSchool = Institution::factory()->create(['title' => 'Elsewhere Academy']);

        $this->token = 'ingest-token-'.uniqid();
        $this->device = GateDevice::create([
            'institution_id' => $this->school->id,
            'name' => 'Front Gate',
            'gate_type' => 'enter',
            'device_token_hash' => hash('sha256', $this->token),
        ]);
    }

    public function test_a_queued_scan_is_recorded_with_the_time_the_device_stamped(): void
    {
        $student = $this->enrolled();
        $tag = $this->tagFor($student, 'CARD-A');

        $scannedAt = now()->subMinutes(3)->startOfSecond();

        $response = $this->post('/api/gate/scans', [
            'scans' => [[
                'client_scan_id' => 'scan-1',
                'rfid_uid' => 'CARD-A',
                'scanned_at' => $scannedAt->toISOString(),
            ]],
        ], $this->deviceHeaders());

        $response->assertOk()
            ->assertJsonPath('accepted', 1)
            ->assertJsonPath('results.0.status', 'accepted');

        $log = RfidScanLog::firstWhere('client_scan_id', 'scan-1');

        $this->assertNotNull($log);
        $this->assertSame($student->id, $log->student_id);
        $this->assertSame($tag->id, $log->student_rfid_tag_id);
        $this->assertSame($this->school->id, $log->institution_id);
        $this->assertSame('enter', $log->type);
        // The device's stamp, not the moment of upload — that is the entire point
        // of queueing rather than dropping.
        $this->assertSame($scannedAt->toDateTimeString(), $log->scanned_at->toDateTimeString());
        // From the token; a device does not get to name itself in the log.
        $this->assertSame('Front Gate', $log->device_name);
    }

    public function test_the_same_batch_sent_twice_records_one_scan(): void
    {
        $student = $this->enrolled();
        $this->tagFor($student, 'CARD-A');

        $batch = ['scans' => [[
            'client_scan_id' => 'scan-1',
            'rfid_uid' => 'CARD-A',
            'scanned_at' => now()->subMinute()->toISOString(),
        ]]];

        $first = $this->post('/api/gate/scans', $batch, $this->deviceHeaders());
        // The device never saw the first reply — this is the retry.
        $second = $this->post('/api/gate/scans', $batch, $this->deviceHeaders());

        $first->assertJsonPath('results.0.status', 'accepted');
        $second->assertOk()
            ->assertJsonPath('accepted', 0)
            ->assertJsonPath('results.0.status', 'duplicate');

        $this->assertSame(1, RfidScanLog::where('client_scan_id', 'scan-1')->count());
        // And the duplicate still names the row, so the device can stop asking.
        $this->assertSame(
            RfidScanLog::firstWhere('client_scan_id', 'scan-1')->id,
            $second->json('results.0.scan_log_id'),
        );
    }

    public function test_every_row_comes_back_answered_and_a_bad_row_does_not_cost_the_others(): void
    {
        $student = $this->enrolled();
        $this->tagFor($student, 'CARD-A');

        $response = $this->post('/api/gate/scans', [
            'scans' => [
                ['client_scan_id' => 'good-1', 'rfid_uid' => 'CARD-A', 'scanned_at' => now()->subMinutes(5)->toISOString()],
                ['client_scan_id' => 'nobody', 'rfid_uid' => 'NOT-A-CARD', 'scanned_at' => now()->subMinutes(4)->toISOString()],
                ['client_scan_id' => 'good-2', 'rfid_uid' => 'CARD-A', 'scanned_at' => now()->subMinutes(3)->toISOString()],
            ],
        ], $this->deviceHeaders());

        $response->assertOk()->assertJsonPath('accepted', 2);

        $byId = collect($response->json('results'))->keyBy('client_scan_id');

        // The device deletes a queued row only when this endpoint answers about
        // that row, so an unanswered row is a row uploaded again forever.
        $this->assertCount(3, $byId);
        $this->assertSame('accepted', $byId['good-1']['status']);
        $this->assertSame('accepted', $byId['good-2']['status']);
        $this->assertSame('rejected', $byId['nobody']['status']);
        $this->assertSame('unknown_tag', $byId['nobody']['reason']);

        $this->assertSame(2, RfidScanLog::whereIn('client_scan_id', ['good-1', 'good-2'])->count());
    }

    public function test_a_single_tap_comes_back_with_enough_to_draw_the_card(): void
    {
        // The kiosk could not name this student from its own roster, so if the
        // reply did not either, the gate would say "not recognised" about a
        // student the server had just recognised.
        $student = $this->enrolled();
        $this->tagFor($student, 'CARD-A');

        $response = $this->post('/api/gate/scans', [
            'scans' => [[
                'client_scan_id' => 'scan-1',
                'rfid_uid' => 'CARD-A',
                'scanned_at' => now()->toISOString(),
            ]],
        ], $this->deviceHeaders());

        $response->assertJsonPath('results.0.student.first_name', 'Ana')
            ->assertJsonPath('results.0.student.last_name', 'Cruz')
            ->assertJsonPath('results.0.student.id', $student->id);

        // And nothing the roster would not have carried anyway.
        $this->assertSame(
            ['id', 'first_name', 'middle_name', 'last_name', 'ext_name', 'grade_level', 'section'],
            array_keys($response->json('results.0.student')),
        );
    }

    public function test_a_backlog_upload_does_not_pay_for_names_nobody_is_waiting_for(): void
    {
        $student = $this->enrolled();
        $this->tagFor($student, 'CARD-A');

        $response = $this->post('/api/gate/scans', [
            'scans' => [
                ['client_scan_id' => 'a', 'rfid_uid' => 'CARD-A', 'scanned_at' => now()->subMinutes(9)->toISOString()],
                ['client_scan_id' => 'b', 'rfid_uid' => 'CARD-A', 'scanned_at' => now()->subMinutes(8)->toISOString()],
            ],
        ], $this->deviceHeaders());

        // No screen is waiting on a batch, so it does not look anyone up.
        $response->assertJsonPath('accepted', 2)
            ->assertJsonMissingPath('results.0.student')
            ->assertJsonMissingPath('results.1.student');
    }

    public function test_a_card_registered_after_the_devices_last_sync_still_resolves(): void
    {
        // The case that makes queueing an unrecognised tap worth doing: the
        // device could not name this student, and the server can.
        $student = $this->enrolled();
        $this->tagFor($student, 'ISSUED-TODAY');

        $this->post('/api/gate/scans', [
            'scans' => [[
                'client_scan_id' => 'scan-1',
                'rfid_uid' => 'ISSUED-TODAY',
                'scanned_at' => now()->subMinutes(2)->toISOString(),
            ]],
        ], $this->deviceHeaders())->assertJsonPath('results.0.status', 'accepted');

        $this->assertSame($student->id, RfidScanLog::firstWhere('client_scan_id', 'scan-1')->student_id);
    }

    public function test_a_student_uuid_from_a_qr_code_resolves_too(): void
    {
        $student = $this->enrolled();

        $this->post('/api/gate/scans', [
            'scans' => [[
                'client_scan_id' => 'scan-qr',
                'rfid_uid' => $student->id,
                'scanned_at' => now()->subMinute()->toISOString(),
            ]],
        ], $this->deviceHeaders())->assertJsonPath('results.0.status', 'accepted');

        $log = RfidScanLog::firstWhere('client_scan_id', 'scan-qr');
        $this->assertSame($student->id, $log->student_id);
        $this->assertNull($log->student_rfid_tag_id);
    }

    public function test_an_inactive_tag_is_refused(): void
    {
        $student = $this->enrolled();
        $this->tagFor($student, 'REVOKED-CARD', active: false);

        $this->post('/api/gate/scans', [
            'scans' => [[
                'client_scan_id' => 'scan-1',
                'rfid_uid' => 'REVOKED-CARD',
                'scanned_at' => now()->subMinute()->toISOString(),
            ]],
        ], $this->deviceHeaders())
            ->assertJsonPath('results.0.status', 'rejected')
            ->assertJsonPath('results.0.reason', 'unknown_tag');

        $this->assertSame(0, RfidScanLog::count());
    }

    public function test_a_device_cannot_record_a_scan_for_another_schools_student(): void
    {
        $stranger = $this->studentAt($this->otherSchool);
        $this->tagFor($stranger, 'OTHER-SCHOOL-CARD');

        $this->post('/api/gate/scans', [
            'scans' => [[
                'client_scan_id' => 'scan-1',
                'rfid_uid' => 'OTHER-SCHOOL-CARD',
                'scanned_at' => now()->subMinute()->toISOString(),
            ]],
        ], $this->deviceHeaders())
            ->assertJsonPath('results.0.status', 'rejected')
            ->assertJsonPath('results.0.reason', 'unknown_tag');

        // A stranger's tap must not land in this school's gate log.
        $this->assertSame(0, RfidScanLog::count());
    }

    public function test_a_both_gate_must_say_which_direction(): void
    {
        $this->device->update(['gate_type' => 'both']);

        $student = $this->enrolled();
        $this->tagFor($student, 'CARD-A');

        $response = $this->post('/api/gate/scans', [
            'scans' => [
                ['client_scan_id' => 'no-type', 'rfid_uid' => 'CARD-A', 'scanned_at' => now()->subMinutes(2)->toISOString()],
                ['client_scan_id' => 'an-exit', 'rfid_uid' => 'CARD-A', 'scanned_at' => now()->subMinute()->toISOString(), 'type' => 'exit'],
            ],
        ], $this->deviceHeaders());

        $byId = collect($response->json('results'))->keyBy('client_scan_id');

        // Guessing would record an exit as an entrance and look like it worked.
        $this->assertSame('rejected', $byId['no-type']['status']);
        $this->assertSame('gate_type_required', $byId['no-type']['reason']);
        $this->assertSame('accepted', $byId['an-exit']['status']);
        $this->assertSame('exit', RfidScanLog::firstWhere('client_scan_id', 'an-exit')->type);
    }

    public function test_a_single_direction_device_ignores_a_type_it_was_sent(): void
    {
        $student = $this->enrolled();
        $this->tagFor($student, 'CARD-A');

        $this->post('/api/gate/scans', [
            'scans' => [[
                'client_scan_id' => 'scan-1',
                'rfid_uid' => 'CARD-A',
                'scanned_at' => now()->subMinute()->toISOString(),
                'type' => 'exit',
            ]],
        ], $this->deviceHeaders())->assertJsonPath('results.0.status', 'accepted');

        // The token says this is the entrance gate; the body does not get a vote.
        $this->assertSame('enter', RfidScanLog::firstWhere('client_scan_id', 'scan-1')->type);
    }

    public function test_a_scan_from_a_device_with_no_clock_arrives_flagged(): void
    {
        $student = $this->enrolled();
        $this->tagFor($student, 'CARD-A');

        $this->post('/api/gate/scans', [
            'scans' => [
                ['client_scan_id' => 'unsure', 'rfid_uid' => 'CARD-A', 'scanned_at' => now()->subMinute()->toISOString(), 'clock_suspect' => true],
                ['client_scan_id' => 'sure', 'rfid_uid' => 'CARD-A', 'scanned_at' => now()->subMinutes(2)->toISOString()],
                // A device whose clock is wrong but confident cannot flag itself.
                ['client_scan_id' => 'tomorrow', 'rfid_uid' => 'CARD-A', 'scanned_at' => now()->addDay()->toISOString()],
            ],
        ], $this->deviceHeaders())->assertJsonPath('accepted', 3);

        $this->assertTrue(RfidScanLog::firstWhere('client_scan_id', 'unsure')->clock_suspect);
        $this->assertFalse(RfidScanLog::firstWhere('client_scan_id', 'sure')->clock_suspect);
        $this->assertTrue(RfidScanLog::firstWhere('client_scan_id', 'tomorrow')->clock_suspect);
    }

    public function test_the_reported_pending_count_reaches_the_portal(): void
    {
        $student = $this->enrolled();
        $this->tagFor($student, 'CARD-A');

        $this->post('/api/gate/scans', [
            'pending_count' => 42,
            'scans' => [['client_scan_id' => 'scan-1', 'rfid_uid' => 'CARD-A', 'scanned_at' => now()->toISOString()]],
        ], $this->deviceHeaders())->assertOk();

        $this->device->refresh();
        $this->assertSame(42, $this->device->pending_count);
        $this->assertNotNull($this->device->last_seen_at);
    }

    public function test_scans_need_a_device_token(): void
    {
        $this->postJson('/api/gate/scans', ['scans' => []])->assertStatus(401);

        $this->post('/api/gate/scans', ['scans' => []], [
            'Authorization' => 'Bearer not-a-real-token',
            'Accept' => 'application/json',
        ])->assertStatus(401);
    }

    public function test_a_batch_larger_than_the_cap_is_refused_whole(): void
    {
        $student = $this->enrolled();
        $this->tagFor($student, 'CARD-A');

        $scans = [];
        for ($i = 0; $i <= 200; $i++) {
            $scans[] = [
                'client_scan_id' => "scan-{$i}",
                'rfid_uid' => 'CARD-A',
                'scanned_at' => now()->subMinutes(2)->toISOString(),
            ];
        }

        // Refused as a whole rather than half-written: the device keeps every row
        // and sends a smaller batch.
        $this->post('/api/gate/scans', ['scans' => $scans], $this->deviceHeaders())
            ->assertStatus(422);

        $this->assertSame(0, RfidScanLog::count());
    }

    public function test_a_prompt_scan_still_texts_the_parent(): void
    {
        $student = $this->studentWithNumber('09171234567');
        $this->tagFor($student, 'CARD-A');
        $this->smsEnabled(lateThreshold: 15);

        $this->post('/api/gate/scans', [
            'scans' => [[
                'client_scan_id' => 'prompt',
                'rfid_uid' => 'CARD-A',
                'scanned_at' => now()->subMinutes(2)->toISOString(),
            ]],
        ], $this->deviceHeaders())->assertJsonPath('accepted', 1);

        $this->assertSame(1, SmsMessage::count());
    }

    public function test_a_backlog_does_not_text_parents_hours_late(): void
    {
        $student = $this->studentWithNumber('09171234567');
        $this->tagFor($student, 'CARD-A');
        $this->smsEnabled(lateThreshold: 15);

        $this->post('/api/gate/scans', [
            'scans' => [[
                'client_scan_id' => 'this-morning',
                'rfid_uid' => 'CARD-A',
                'scanned_at' => now()->subHours(3)->toISOString(),
            ]],
        ], $this->deviceHeaders())->assertJsonPath('accepted', 1);

        // The scan is recorded — that is the whole point of the outbox — but
        // "your child has entered school" three hours after the fact is not a
        // late message, it is a false one.
        $this->assertSame(1, RfidScanLog::count());
        $this->assertSame(0, SmsMessage::count());
    }

    public function test_a_school_can_turn_late_suppression_off(): void
    {
        $student = $this->studentWithNumber('09171234567');
        $this->tagFor($student, 'CARD-A');
        $this->smsEnabled(lateThreshold: 0);

        $this->post('/api/gate/scans', [
            'scans' => [[
                'client_scan_id' => 'this-morning',
                'rfid_uid' => 'CARD-A',
                'scanned_at' => now()->subHours(3)->toISOString(),
            ]],
        ], $this->deviceHeaders())->assertJsonPath('accepted', 1);

        $this->assertSame(1, SmsMessage::count());
    }

    // ── Fixtures ────────────────────────────────────────────────────────────

    /**
     * @return array<string, string>
     */
    private function deviceHeaders(): array
    {
        return [
            'Authorization' => 'Bearer '.$this->token,
            'Accept' => 'application/json',
        ];
    }

    private function enrolled(): Student
    {
        return $this->studentAt($this->school);
    }

    private function studentAt(Institution $institution): Student
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
            'institution_id' => $institution->id,
            'is_active' => true,
            'academic_year' => '2026-2027',
        ]);

        return $student;
    }

    private function studentWithNumber(string $number): Student
    {
        $student = $this->enrolled();

        $student->profile()->create(['mobile_number' => $number]);

        return $student;
    }

    private function tagFor(Student $student, string $uid, bool $active = true): StudentRfidTag
    {
        return StudentRfidTag::create([
            'student_id' => $student->id,
            'rfid_uid' => $uid,
            'is_active' => $active,
        ]);
    }

    private function smsEnabled(int $lateThreshold): GateSmsSetting
    {
        return GateSmsSetting::create([
            'institution_id' => $this->school->id,
            'gate_type' => 'enter',
            'is_enabled' => true,
            'message_template' => GateSmsSetting::defaultTemplate('enter'),
            'cooldown_minutes' => 0,
            'late_threshold_minutes' => $lateThreshold,
        ]);
    }
}
