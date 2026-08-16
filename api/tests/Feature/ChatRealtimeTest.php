<?php

namespace Tests\Feature;

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
 * The realtime path: socket tickets, the push to the Cloudflare Worker, and the
 * repair endpoint its cron trigger calls.
 *
 * The through-line of these tests is that realtime is an accelerator and never a
 * dependency. A deployment with no Worker configured must behave exactly like
 * one that has it, only slower — so the cases that matter most here are the ones
 * where the Worker is missing, misconfigured, or falling over mid-request.
 */
class ChatRealtimeTest extends TestCase
{
    use EnablesInstitutionFeatures;
    use RefreshDatabase;

    private const SECRET = 'worker-secret-for-tests';

    private Institution $school;

    private User $teacher;

    private Student $student;

    private ClassSection $section;

    private string $conversationId;

    protected function setUp(): void
    {
        parent::setUp();

        /*
         * Realtime is opt-in per test, and starts off.
         *
         * Cleared explicitly rather than assumed absent: a developer's own .env
         * may well point at a Worker running on their machine, and that must not
         * change what these tests prove — least of all the ones whose whole
         * subject is what happens when no Worker is configured.
         */
        config()->set('chat.tenant', null);
        config()->set('chat.worker.url', null);
        config()->set('chat.worker.secret', null);

        // The publisher's circuit breaker lives in the cache, so it would
        // otherwise carry between tests.
        Cache::flush();

        $this->school = Institution::factory()->create(['title' => 'Realtime High']);

        // Chat is gated on the institution having the feature, and it ships
        // off. These tests are about what chat does once a school has it.
        $this->enableFeature($this->school->id, 'chat');

        $role = Role::firstOrCreate(['slug' => 'subject-teacher'], ['title' => 'Subject Teacher']);

        $this->teacher = User::factory()->create([
            'first_name' => 'Grace',
            'last_name' => 'Ilagan',
            'email' => 'grace@realtime.test',
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

        $this->section = ClassSection::create([
            'institution_id' => $this->school->id,
            'grade_level' => '8',
            'title' => '8-Mabini',
            'adviser' => $this->teacher->id,
            'academic_year' => '2026-2027',
        ]);

        $this->student = $this->enrolStudent('Noel', 'Bautista', 'noel@realtime.test', 'token-student');

        app(ChatSyncQueue::class)->flush();

        $this->conversationId = $this->asTeacher()
            ->getJson('/api/chat/conversations')
            ->json('data.0.id');
    }

    private function enrolStudent(string $first, string $last, string $email, string $token): Student
    {
        $student = Student::create([
            'first_name' => $first,
            'last_name' => $last,
            'gender' => 'male',
            'birthdate' => '2012-05-05',
            'is_active' => true,
        ]);

        StudentInstitution::create([
            'student_id' => $student->id,
            'institution_id' => $this->school->id,
            'is_active' => true,
        ]);

        StudentAuth::create([
            'student_id' => $student->id,
            'email' => $email,
            'password' => Hash::make('student-password'),
            'is_new' => false,
            'token' => $token,
            'token_expiry' => now()->addYear()->toDateTimeString(),
        ]);

        StudentSection::create([
            'student_id' => $student->id,
            'section_id' => $this->section->id,
            'academic_year' => '2026-2027',
            'is_active' => true,
        ]);

        return $student;
    }

    private function asTeacher(): self
    {
        return $this->withHeader('Authorization', 'Bearer token-teacher');
    }

    private function asStudent(): self
    {
        return $this->withHeader('Authorization', 'Bearer token-student');
    }

    private function configureWorker(): void
    {
        config()->set('chat.tenant', 'realtime-high');
        config()->set('chat.worker.url', 'https://chat.example.workers.dev');
        config()->set('chat.worker.secret', self::SECRET);
    }

    private function send(string $body): \Illuminate\Testing\TestResponse
    {
        return $this->asTeacher()
            ->postJson("/api/chat/conversations/{$this->conversationId}/messages", ['body' => $body]);
    }

    public function test_chat_works_with_no_worker_configured(): void
    {
        Http::fake();

        // The default state of a deployment nobody has wired a Worker into. It
        // must be indistinguishable from a working one apart from latency.
        $this->send('No worker here.')->assertCreated();

        Http::assertNothingSent();

        $this->asStudent()
            ->getJson('/api/chat/socket-token')
            ->assertOk()
            ->assertJsonPath('data.enabled', false);
    }

    public function test_a_socket_ticket_is_signed_for_the_person_who_asked_for_it(): void
    {
        $this->configureWorker();

        $ticket = $this->asStudent()->getJson('/api/chat/socket-token')->assertOk()->json('data');

        $this->assertTrue($ticket['enabled']);
        $this->assertSame('wss://chat.example.workers.dev/connect', $ticket['url']);

        [$header, $payload, $signature] = explode('.', $ticket['token']);

        // The Worker will verify exactly this way, so if the shape is wrong the
        // failure shows up here rather than as sockets that will not open.
        $expected = rtrim(strtr(base64_encode(
            hash_hmac('sha256', "{$header}.{$payload}", self::SECRET, true)
        ), '+/', '-_'), '=');

        $this->assertSame($expected, $signature, 'the token signature must verify against the tenant secret');

        $claims = json_decode(base64_decode(strtr($payload, '-_', '+/')), true);

        $this->assertSame('realtime-high', $claims['tenant']);
        $this->assertSame('student', $claims['participant_type']);
        $this->assertSame($this->student->id, $claims['participant_id']);
        $this->assertGreaterThan(time(), $claims['exp']);
    }

    public function test_a_sent_message_is_pushed_to_everyone_but_its_sender(): void
    {
        $this->configureWorker();
        Http::fake(['*' => Http::response(['delivered' => 1])]);

        $this->send('Please read pages 40 to 52.')->assertCreated();

        Http::assertSent(function ($request) {
            $body = $request->data();

            $this->assertSame('https://chat.example.workers.dev/publish', $request->url());
            $this->assertSame('Bearer '.self::SECRET, $request->header('Authorization')[0]);
            $this->assertSame('realtime-high', $request->header('X-Chat-Tenant')[0]);

            // The teacher sent it, so only the student is a recipient. Pushing
            // to the sender would race their own optimistic render.
            $this->assertCount(1, $body['recipients']);
            $this->assertSame('student', $body['recipients'][0]['type']);
            $this->assertSame($this->student->id, $body['recipients'][0]['id']);

            // Shaped like a sync message so the client folds both paths into one
            // cache write.
            $this->assertSame('Please read pages 40 to 52.', $body['message']['body']);
            $this->assertSame('user', $body['message']['sender_type']);
            $this->assertSame('Grace Ilagan', $body['message']['sender_name']);
            $this->assertFalse($body['message']['is_deleted']);

            return true;
        });
    }

    public function test_a_worker_that_is_down_does_not_stop_anyone_posting(): void
    {
        $this->configureWorker();
        Http::fake(fn () => throw new ConnectionException('worker unreachable'));

        // The whole point of the design: delivery degrades, the message does not.
        $this->send('Still saved.')->assertCreated();

        $this->assertDatabaseHas('chat_messages', ['body' => 'Still saved.']);

        $this->asStudent()
            ->getJson("/api/chat/conversations/{$this->conversationId}/messages")
            ->assertOk()
            ->assertJsonPath('data.messages.0.body', 'Still saved.');
    }

    public function test_a_removed_student_stops_being_a_recipient_immediately(): void
    {
        $this->configureWorker();
        Http::fake(['*' => Http::response(['delivered' => 1])]);

        $staying = $this->enrolStudent('Rina', 'Ocampo', 'rina@realtime.test', 'token-rina');
        app(ChatSyncQueue::class)->flush();

        // Through the model, the way every enrolment write in the app does it —
        // a query-builder mass update fires no events and would prove nothing
        // about the path that actually runs.
        StudentSection::where('student_id', $this->student->id)
            ->first()
            ->update(['is_active' => false]);
        app(ChatSyncQueue::class)->flush();

        $this->send('Anyone still here?')->assertCreated();

        // The recipient list is rebuilt from the roster on every message, so a
        // removal takes hold at once — without having to find and cut an open
        // socket, which is the part a push transport would otherwise get wrong.
        //
        // Scoped to the publish call on purpose: the same flush also pushes the
        // rebuilt roster to /internal/rosters, and an unscoped assertion would
        // be handed whichever of the two came first.
        Http::assertSent(function ($request) use ($staying) {
            if (! str_ends_with($request->url(), '/publish')) {
                return false;
            }

            $recipients = collect($request->data()['recipients'])->pluck('id');

            $this->assertTrue($recipients->contains($staying->id), 'the enrolled student should still receive it');
            $this->assertFalse($recipients->contains($this->student->id), 'the removed student should not');

            return true;
        });
    }

    public function test_a_worker_that_stays_down_is_left_alone_instead_of_stalling_every_sender(): void
    {
        $this->configureWorker();

        // A Worker that answers but is broken — a bad secret, a bad deploy. The
        // connection-refused case takes the same path; this one is used because
        // a thrown fake records no request to count.
        Http::fake(['*' => Http::response('upstream exploded', 500)]);

        // Three strikes. Each of these costs the sender the publish timeout,
        // which is the thing being limited.
        foreach (['one', 'two', 'three'] as $body) {
            $this->send($body)->assertCreated();
        }

        Http::assertSentCount(3);

        // From here the Worker is not called at all for a minute — a wrong URL
        // in a .env must not make every message in the school slow indefinitely.
        $this->send('four')->assertCreated();
        $this->send('five')->assertCreated();

        Http::assertSentCount(3);

        // And nothing about posting changed while the breaker was open.
        $this->assertDatabaseHas('chat_messages', ['body' => 'five']);
    }

    public function test_the_reconcile_endpoint_is_closed_unless_the_worker_secret_matches(): void
    {
        // Unconfigured: the route does not exist as far as a caller is concerned.
        $this->postJson('/api/chat/reconcile')->assertStatus(404);

        $this->configureWorker();

        $this->postJson('/api/chat/reconcile')->assertStatus(401);

        $this->withHeader('Authorization', 'Bearer not-the-secret')
            ->postJson('/api/chat/reconcile')
            ->assertStatus(401);

        $this->withHeader('Authorization', 'Bearer '.self::SECRET)
            ->postJson('/api/chat/reconcile')
            ->assertOk()
            ->assertJsonPath('data.sections', 1);
    }

    public function test_reconcile_repairs_a_roster_that_drifted(): void
    {
        $this->configureWorker();

        // Stand in for a write path that slipped past the observers.
        \App\Models\ChatParticipant::where('conversation_id', $this->conversationId)
            ->where('participant_type', 'student')
            ->delete();

        $this->assertSame(
            0,
            \App\Models\ChatParticipant::where('conversation_id', $this->conversationId)
                ->where('participant_type', 'student')
                ->count()
        );

        $this->withHeader('Authorization', 'Bearer '.self::SECRET)
            ->postJson('/api/chat/reconcile')
            ->assertOk();

        // The student is back in their own class group without anyone noticing
        // they had fallen out of it.
        $this->assertDatabaseHas('chat_participants', [
            'conversation_id' => $this->conversationId,
            'participant_type' => 'student',
            'participant_id' => $this->student->id,
            'removed_at' => null,
        ]);
    }
}
