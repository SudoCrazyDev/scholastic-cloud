<?php

namespace Tests\Feature;

use App\Models\ClassSection;
use App\Models\GateDevice;
use App\Models\Institution;
use App\Models\Student;
use App\Models\StudentInstitution;
use App\Models\StudentRfidTag;
use App\Models\StudentSection;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * What a gate kiosk is allowed to hold locally, and how it stays current.
 *
 * The contract these tests exist to protect is the one in
 * `GateRosterSnapshot`'s docblock: **the roster must be exactly the set
 * `kioskScan` would resolve.** Every case below is a way that can quietly stop
 * being true —
 *
 *  - a student with no RFID tag is still in the roster, because the QR path
 *    resolves them by their own id; drop them and QR users silently break at a
 *    gate that is otherwise working;
 *  - a student who leaves has to arrive as a **removal**, not just stop being
 *    sent, or the kiosk keeps admitting them forever;
 *  - a delta must notice a *tag* change and a *section rename*, not only edits
 *    to the student row, since neither touches `students.updated_at`;
 *  - the payload must carry no contact number and no LRN — it ends up on an SD
 *    card at a gate.
 */
class GateRosterSnapshotTest extends TestCase
{
    use RefreshDatabase;

    private Institution $school;

    private Institution $otherSchool;

    private GateDevice $device;

    private string $token;

    private ClassSection $section;

    protected function setUp(): void
    {
        parent::setUp();

        $this->school = Institution::factory()->create(['title' => 'Roster High']);
        $this->otherSchool = Institution::factory()->create(['title' => 'Elsewhere Academy']);

        $this->section = ClassSection::create([
            'institution_id' => $this->school->id,
            'grade_level' => 'Grade 7',
            'title' => 'Sampaguita',
            'academic_year' => '2026-2027',
        ]);

        $this->token = 'roster-token-'.uniqid();
        $this->device = GateDevice::create([
            'institution_id' => $this->school->id,
            'name' => 'Main Gate',
            'gate_type' => 'enter',
            'device_token_hash' => hash('sha256', $this->token),
        ]);
    }

    public function test_a_full_snapshot_carries_the_enrolled_students_with_tags_and_section(): void
    {
        $ana = $this->enrolledStudent('Ana', 'Cruz');
        $this->tag($ana, '04A2B3C4');
        $this->assign($ana, $this->section);

        $response = $this->asDevice()->getJson('/api/gate/roster')->assertOk();

        $response->assertJsonPath('full', true);
        $response->assertJsonPath('has_more', false);
        $this->assertNotNull($response->json('synced_at'));

        $row = $response->json('students.0');
        $this->assertSame($ana->id, $row['id']);
        $this->assertSame('Ana', $row['first_name']);
        $this->assertSame(['04A2B3C4'], $row['rfid_uids']);
        $this->assertSame('Grade 7', $row['grade_level']);
        $this->assertSame('Sampaguita', $row['section']);
    }

    public function test_the_payload_carries_nothing_a_gate_display_does_not_need(): void
    {
        $ana = $this->enrolledStudent('Ana', 'Cruz');
        $ana->update(['lrn' => '136742110001']);

        $row = $this->asDevice()->getJson('/api/gate/roster')->json('students.0');

        // This lands on an SD card at a gate. It draws a name, a section and a
        // face — so that is all it gets.
        foreach (['lrn', 'birthdate', 'mobile_number', 'profile_picture'] as $field) {
            $this->assertArrayNotHasKey($field, $row);
        }
        $this->assertSame(
            ['id', 'first_name', 'middle_name', 'last_name', 'ext_name', 'grade_level', 'section', 'rfid_uids', 'photo_hash'],
            array_keys($row)
        );
    }

    public function test_a_student_with_no_tag_is_still_in_the_roster(): void
    {
        $ben = $this->enrolledStudent('Ben', 'Santos');

        $row = $this->asDevice()->getJson('/api/gate/roster')->json('students.0');

        // The QR path resolves this student by their own UUID, so the kiosk has
        // to know them even with no card issued.
        $this->assertSame($ben->id, $row['id']);
        $this->assertSame([], $row['rfid_uids']);
    }

    public function test_an_inactive_tag_is_not_advertised(): void
    {
        $ana = $this->enrolledStudent('Ana', 'Cruz');
        $this->tag($ana, 'LIVE-UID');
        $this->tag($ana, 'REVOKED-UID', false);

        $row = $this->asDevice()->getJson('/api/gate/roster')->json('students.0');

        $this->assertSame(['LIVE-UID'], $row['rfid_uids']);
    }

    public function test_another_schools_students_are_never_in_the_roster(): void
    {
        $this->enrolledStudent('Ana', 'Cruz');

        $outsider = Student::create([
            'first_name' => 'Rico', 'last_name' => 'Reyes',
            'gender' => 'male', 'birthdate' => '2012-05-05', 'is_active' => true,
        ]);
        StudentInstitution::create([
            'student_id' => $outsider->id,
            'institution_id' => $this->otherSchool->id,
            'is_active' => true,
            'academic_year' => '2026-2027',
        ]);

        $ids = collect($this->asDevice()->getJson('/api/gate/roster')->json('students'))->pluck('id');

        $this->assertCount(1, $ids);
        $this->assertNotContains($outsider->id, $ids);
    }

    public function test_a_deactivated_student_comes_back_as_a_removal(): void
    {
        $ana = $this->enrolledStudent('Ana', 'Cruz');
        $since = $this->asDevice()->getJson('/api/gate/roster')->json('synced_at');

        $ana->update(['is_active' => false]);

        $delta = $this->asDevice()->getJson('/api/gate/roster?since='.urlencode($since))->assertOk();

        $delta->assertJsonPath('full', false);
        $this->assertSame([], $delta->json('students'));
        // Not merely absent — named, so the kiosk stops admitting them.
        $this->assertSame([$ana->id], $delta->json('removed_ids'));
    }

    public function test_an_unenrolled_student_comes_back_as_a_removal(): void
    {
        $ana = $this->enrolledStudent('Ana', 'Cruz');
        $since = $this->asDevice()->getJson('/api/gate/roster')->json('synced_at');

        StudentInstitution::where('student_id', $ana->id)->update(['is_active' => false, 'updated_at' => now()]);

        $delta = $this->asDevice()->getJson('/api/gate/roster?since='.urlencode($since));

        $this->assertSame([$ana->id], $delta->json('removed_ids'));
    }

    public function test_a_delta_notices_a_new_tag(): void
    {
        $ana = $this->enrolledStudent('Ana', 'Cruz');
        $since = $this->asDevice()->getJson('/api/gate/roster')->json('synced_at');

        // Nothing on the student row changes here, so a delta keyed only on
        // students.updated_at would hand the kiosk a card it cannot resolve.
        $this->tag($ana, 'ISSUED-LATER');

        $delta = $this->asDevice()->getJson('/api/gate/roster?since='.urlencode($since));

        $this->assertSame(['ISSUED-LATER'], $delta->json('students.0.rfid_uids'));
    }

    public function test_a_delta_notices_a_section_rename(): void
    {
        $ana = $this->enrolledStudent('Ana', 'Cruz');
        $this->assign($ana, $this->section);
        $since = $this->asDevice()->getJson('/api/gate/roster')->json('synced_at');

        $this->section->update(['title' => 'Rosal']);

        $delta = $this->asDevice()->getJson('/api/gate/roster?since='.urlencode($since));

        $this->assertSame('Rosal', $delta->json('students.0.section'));
    }

    public function test_a_quiet_school_produces_an_empty_delta(): void
    {
        $this->enrolledStudent('Ana', 'Cruz');

        // Sync from a second strictly after the one the student was written in.
        // Syncing inside that same second re-sends them by design — the test
        // below pins that — so this is what "nothing changed" really looks like.
        $this->travel(2)->seconds();
        $since = $this->asDevice()->getJson('/api/gate/roster')->json('synced_at');

        $delta = $this->asDevice()->getJson('/api/gate/roster?since='.urlencode($since))->assertOk();

        // The common case on a slow link: a sync that costs almost nothing.
        $this->assertSame([], $delta->json('students'));
        $this->assertSame([], $delta->json('removed_ids'));
        $this->assertFalse($delta->json('has_more'));
    }

    public function test_a_change_made_in_the_same_second_as_a_sync_is_not_lost(): void
    {
        $ana = $this->enrolledStudent('Ana', 'Cruz');
        $since = $this->asDevice()->getJson('/api/gate/roster')->json('synced_at');

        // `updated_at` is second-precision. Compared exclusively against a
        // timestamp taken inside that same second, this edit would never look
        // newer than `since` again and the kiosk would keep the old name for
        // good — so the comparison is floored and inclusive instead. The cost is
        // the duplicate asserted below, which the kiosk simply upserts.
        $ana->update(['first_name' => 'Anna']);

        $delta = $this->asDevice()->getJson('/api/gate/roster?since='.urlencode($since))->assertOk();

        $this->assertSame('Anna', $delta->json('students.0.first_name'));
    }

    public function test_the_boundary_second_is_re_sent_rather_than_risked(): void
    {
        $ana = $this->enrolledStudent('Ana', 'Cruz');
        $since = $this->asDevice()->getJson('/api/gate/roster')->json('synced_at');

        // Nothing changed, but the student was created in the same second the
        // sync reports, so they come back once more. Cheap, and the direction
        // we want to be wrong in.
        $delta = $this->asDevice()->getJson('/api/gate/roster?since='.urlencode($since))->assertOk();

        $this->assertSame([$ana->id], collect($delta->json('students'))->pluck('id')->all());
    }

    public function test_paging_walks_every_student_exactly_once(): void
    {
        for ($i = 0; $i < 7; $i++) {
            $this->enrolledStudent('Student'.$i, 'Dela Cruz');
        }

        $seen = [];
        $cursor = null;
        $pages = 0;

        do {
            $url = '/api/gate/roster?limit=2'.($cursor ? '&cursor='.urlencode($cursor) : '');
            $page = $this->asDevice()->getJson($url)->assertOk();

            $seen = array_merge($seen, collect($page->json('students'))->pluck('id')->all());
            $cursor = $page->json('next_cursor');
            $pages++;

            $this->assertLessThan(10, $pages, 'Paging did not terminate.');
        } while ($page->json('has_more'));

        $this->assertCount(7, $seen);
        $this->assertCount(7, array_unique($seen), 'A student appeared on two pages.');
    }

    public function test_the_roster_needs_a_device_token(): void
    {
        $this->enrolledStudent('Ana', 'Cruz');

        $this->getJson('/api/gate/roster')->assertUnauthorized();
        $this->withHeader('Authorization', 'Bearer not-a-real-token')
            ->getJson('/api/gate/roster')
            ->assertUnauthorized();
    }

    private function asDevice(): self
    {
        return $this->withHeader('Authorization', 'Bearer '.$this->token);
    }

    private function enrolledStudent(string $first, string $last): Student
    {
        $student = Student::create([
            'first_name' => $first,
            'last_name' => $last,
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

    private function tag(Student $student, string $uid, bool $active = true): StudentRfidTag
    {
        return StudentRfidTag::create([
            'student_id' => $student->id,
            'rfid_uid' => $uid,
            'is_active' => $active,
        ]);
    }

    private function assign(Student $student, ClassSection $section): StudentSection
    {
        return StudentSection::create([
            'student_id' => $student->id,
            'section_id' => $section->id,
            'academic_year' => '2026-2027',
            'is_active' => true,
        ]);
    }
}
