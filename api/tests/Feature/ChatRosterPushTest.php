<?php

namespace Tests\Feature;

use App\Models\ChatConversation;
use App\Models\ClassSection;
use App\Models\Institution;
use App\Models\Role;
use App\Models\Student;
use App\Models\StudentAuth;
use App\Models\StudentInstitution;
use App\Models\StudentSection;
use App\Models\User;
use App\Models\UserInstitution;
use App\Services\Chat\ChatSyncQueue;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Tests\Concerns\EnablesInstitutionFeatures;
use Tests\TestCase;

/**
 * The one thing that crosses from Laravel to the chat service: who is in a group.
 *
 * Laravel can compute this and the service cannot — the answer comes from
 * enrolment, which never leaves MySQL. So membership is pushed, and everything
 * here is about that push being safe to lose, safe to retry, and safe to receive
 * out of order. Those three properties are what let the service authorize a
 * message without asking anyone.
 */
class ChatRosterPushTest extends TestCase
{
    use EnablesInstitutionFeatures;
    use RefreshDatabase;

    private const SECRET = 'roster-secret-for-tests';

    private Institution $school;

    private User $teacher;

    private Student $student;

    private ClassSection $section;

    protected function setUp(): void
    {
        parent::setUp();

        // Off unless a test asks for it, so a developer's own .env cannot decide
        // what these prove.
        config()->set('chat.tenant', null);
        config()->set('chat.worker.url', null);
        config()->set('chat.worker.secret', null);
        Cache::flush();

        $this->school = Institution::factory()->create(['title' => 'Roster High']);

        // Chat is gated on the institution having the feature, and it ships
        // off. These tests are about what chat does once a school has it.
        $this->enableFeature($this->school->id, 'chat');

        $role = Role::firstOrCreate(['slug' => 'subject-teacher'], ['title' => 'Subject Teacher']);

        $this->teacher = User::factory()->create([
            'first_name' => 'Ines',
            'last_name' => 'Vergara',
            'email' => 'ines@roster.test',
            'token' => 'token-teacher',
            'token_expiry' => now()->addYear()->toDateTimeString(),
        ]);

        UserInstitution::factory()->create([
            'user_id' => $this->teacher->id,
            'institution_id' => $this->school->id,
            'role_id' => $role->id,
            'is_default' => true,
            'is_main' => true,
        ]);

        $this->student = Student::create([
            'first_name' => 'Paulo',
            'last_name' => 'Reyes',
            'gender' => 'male',
            'birthdate' => '2011-02-02',
            'is_active' => true,
        ]);

        StudentInstitution::create([
            'student_id' => $this->student->id,
            'institution_id' => $this->school->id,
            'is_active' => true,
        ]);

        StudentAuth::create([
            'student_id' => $this->student->id,
            'email' => 'paulo@roster.test',
            'password' => Hash::make('student-password'),
            'is_new' => false,
            'token' => 'token-student',
            'token_expiry' => now()->addYear()->toDateTimeString(),
        ]);

        $this->section = ClassSection::create([
            'institution_id' => $this->school->id,
            'grade_level' => '9',
            'title' => '9-Rizal',
            'adviser' => $this->teacher->id,
            'academic_year' => '2026-2027',
        ]);
    }

    private function configureService(): void
    {
        config()->set('chat.tenant', 'roster-high');
        config()->set('chat.worker.url', 'https://chat.example.workers.dev');
        config()->set('chat.worker.secret', self::SECRET);
    }

    private function enrol(): void
    {
        StudentSection::create([
            'student_id' => $this->student->id,
            'section_id' => $this->section->id,
            'academic_year' => '2026-2027',
            'is_active' => true,
        ]);
    }

    private function flush(): void
    {
        app(ChatSyncQueue::class)->flush();
    }

    public function test_enrolment_pushes_the_group_and_its_members(): void
    {
        $this->configureService();
        Http::fake(['*' => Http::response(['success' => true])]);

        $this->enrol();
        $this->flush();

        Http::assertSent(function ($request) {
            $roster = $request->data()['rosters'][0];

            $this->assertSame('https://chat.example.workers.dev/internal/rosters', $request->url());
            $this->assertSame('roster-high', $request->header('X-Chat-Tenant')[0]);
            $this->assertSame('Bearer '.self::SECRET, $request->header('Authorization')[0]);

            $this->assertSame('9-Rizal', $roster['conversation']['title']);
            $this->assertSame('advisory', $roster['conversation']['type']);

            // Both identity types travel together — the service has no other way
            // to tell a teacher's id from a student's.
            $types = array_column($roster['participants'], 'type');
            $this->assertContains('user', $types);
            $this->assertContains('student', $types);

            return true;
        });
    }

    public function test_every_push_carries_a_higher_version_than_the_last(): void
    {
        $this->configureService();
        Http::fake(['*' => Http::response(['success' => true])]);

        $this->enrol();
        $this->flush();

        $this->section->update(['title' => '9-Bonifacio']);
        $this->flush();

        $versions = [];
        Http::assertSent(function ($request) use (&$versions) {
            foreach ($request->data()['rosters'] as $roster) {
                $versions[] = $roster['conversation']['version'];
            }

            return true;
        });

        // Strictly increasing. This is the whole defence against a delayed push
        // overwriting a newer roster: the service compares and drops the older.
        $this->assertGreaterThan(1, count($versions));
        $this->assertSame($versions, array_values(array_unique($versions)));

        $sorted = $versions;
        sort($sorted, SORT_NUMERIC);
        $this->assertSame($sorted, $versions, 'versions must never go backwards');
    }

    public function test_a_removal_is_pushed_as_a_removal_not_an_omission(): void
    {
        $this->configureService();
        Http::fake(['*' => Http::response(['success' => true])]);

        $this->enrol();
        $this->flush();

        StudentSection::where('student_id', $this->student->id)->first()->update(['is_active' => false]);
        Http::fake(['*' => Http::response(['success' => true])]);
        $this->flush();

        Http::assertSent(function ($request) {
            $participants = collect($request->data()['rosters'][0]['participants']);
            $paulo = $participants->firstWhere('id', $this->student->id);

            // Present, and marked removed — not dropped from the list. The
            // service needs the row to keep his history readable.
            $this->assertNotNull($paulo, 'a removed student stays in the roster');
            $this->assertNotNull($paulo['removed_at']);

            return true;
        });
    }

    public function test_a_service_that_is_down_never_breaks_an_enrolment(): void
    {
        $this->configureService();
        Http::fake(fn () => throw new ConnectionException('service unreachable'));

        $this->enrol();
        $this->flush();

        // The transfer stands. Only the copy at the edge is behind, and the
        // half-hourly snapshot repairs it.
        $this->assertDatabaseHas('chat_participants', [
            'participant_type' => 'student',
            'participant_id' => $this->student->id,
            'removed_at' => null,
        ]);
    }

    public function test_nothing_is_pushed_when_no_service_is_configured(): void
    {
        Http::fake();

        $this->enrol();
        $this->flush();

        Http::assertNothingSent();

        // And chat still works entirely from Laravel.
        $this->withHeader('Authorization', 'Bearer token-student')
            ->getJson('/api/chat/conversations')
            ->assertOk()
            ->assertJsonPath('data.0.title', '9-Rizal');
    }

    public function test_the_access_token_is_signed_and_names_the_service(): void
    {
        $this->configureService();

        $data = $this->withHeader('Authorization', 'Bearer token-student')
            ->getJson('/api/chat/token')
            ->assertOk()
            ->json('data');

        $this->assertSame('https://chat.example.workers.dev/v1', $data['service']);
        $this->assertSame('wss://chat.example.workers.dev/connect', $data['socket']);

        [$header, $payload, $signature] = explode('.', $data['token']);

        $expected = rtrim(strtr(base64_encode(
            hash_hmac('sha256', "{$header}.{$payload}", self::SECRET, true)
        ), '+/', '-_'), '=');

        $this->assertSame($expected, $signature);

        $claims = json_decode(base64_decode(strtr($payload, '-_', '+/')), true);

        $this->assertSame('student', $claims['participant_type']);
        $this->assertSame($this->student->id, $claims['participant_id']);
        $this->assertSame('Paulo Reyes', $claims['name']);
    }

    public function test_a_deployment_without_a_service_says_so_rather_than_erroring(): void
    {
        $this->withHeader('Authorization', 'Bearer token-student')
            ->getJson('/api/chat/token')
            ->assertOk()
            ->assertJsonPath('data.service', null);
    }

    public function test_the_snapshot_endpoint_repairs_and_repushes_everything(): void
    {
        $this->configureService();
        Http::fake(['*' => Http::response(['success' => true])]);

        $this->enrol();
        $this->flush();

        // Stand in for a write path that slipped past the observers.
        \App\Models\ChatParticipant::where('participant_type', 'student')->delete();

        Http::fake(['*' => Http::response(['success' => true])]);

        $this->withHeader('Authorization', 'Bearer '.self::SECRET)
            ->postJson('/api/chat/roster-snapshot')
            ->assertOk()
            ->assertJsonPath('data.sections', 1);

        // Repaired locally...
        $this->assertDatabaseHas('chat_participants', [
            'participant_type' => 'student',
            'participant_id' => $this->student->id,
            'removed_at' => null,
        ]);

        // ...and the repair was sent on, which is the point of the snapshot.
        Http::assertSent(function ($request) {
            $types = array_column($request->data()['rosters'][0]['participants'], 'type');

            return in_array('student', $types, true);
        });
    }

    public function test_the_snapshot_endpoint_is_closed_without_the_service_secret(): void
    {
        $this->postJson('/api/chat/roster-snapshot')->assertStatus(404);

        $this->configureService();

        $this->postJson('/api/chat/roster-snapshot')->assertStatus(401);

        $this->withHeader('Authorization', 'Bearer wrong')
            ->postJson('/api/chat/roster-snapshot')
            ->assertStatus(401);
    }

    public function test_roster_version_survives_in_the_database(): void
    {
        $this->configureService();
        Http::fake(['*' => Http::response(['success' => true])]);

        $this->enrol();
        $this->flush();

        $conversation = ChatConversation::first();

        $this->assertGreaterThan(0, $conversation->roster_version);
        $this->assertNotNull($conversation->roster_pushed_at, 'a successful push is recorded');
    }
}
