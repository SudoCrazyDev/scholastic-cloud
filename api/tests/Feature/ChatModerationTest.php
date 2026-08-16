<?php

namespace Tests\Feature;

use App\Models\ChatMessage;
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
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Tests\Concerns\EnablesInstitutionFeatures;
use Tests\TestCase;

/**
 * What a teacher can do about what has been said in their own group.
 *
 * Two powers, both deliberately small: remove one message, and close the group
 * to new ones. Neither destroys anything — a removed message keeps its place in
 * the transcript as a tombstone, and a closed group stays fully readable. That
 * is the shape a school actually needs: they are asked for these transcripts
 * later, including for the messages that had to be taken down.
 *
 * Authority comes from the derived roster and nothing else. There is no
 * moderation permission to grant, because being the teacher of the group *is*
 * the permission, and it lapses on its own when the assignment does.
 */
class ChatModerationTest extends TestCase
{
    use EnablesInstitutionFeatures;
    use RefreshDatabase;

    private Institution $school;

    private User $teacher;

    private Student $student;

    private ClassSection $section;

    private string $conversationId;

    protected function setUp(): void
    {
        parent::setUp();

        // No chat service in these tests: this is the Laravel path, which every
        // deployment still has and which has to behave identically.
        config()->set('chat.tenant', null);
        config()->set('chat.worker.url', null);
        config()->set('chat.worker.secret', null);
        Cache::flush();

        $this->school = Institution::factory()->create(['title' => 'Moderation High']);

        // Chat is gated on the institution having the feature, and it ships
        // off. These tests are about what chat does once a school has it.
        $this->enableFeature($this->school->id, 'chat');

        $role = Role::firstOrCreate(['slug' => 'subject-teacher'], ['title' => 'Subject Teacher']);

        $this->teacher = User::factory()->create([
            'first_name' => 'Delia',
            'last_name' => 'Marquez',
            'email' => 'delia@moderation.test',
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
            'grade_level' => '10',
            'title' => '10-Luna',
            'adviser' => $this->teacher->id,
            'academic_year' => '2026-2027',
        ]);

        $this->student = $this->enrol('Ramon', 'Diaz', 'ramon@moderation.test', 'token-student');

        app(ChatSyncQueue::class)->flush();

        $this->conversationId = $this->asTeacher()
            ->getJson('/api/chat/conversations')
            ->json('data.0.id');
    }

    private function enrol(string $first, string $last, string $email, string $token): Student
    {
        $student = Student::create([
            'first_name' => $first,
            'last_name' => $last,
            'gender' => 'male',
            'birthdate' => '2010-03-03',
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

    private function asStudent(string $token = 'token-student'): self
    {
        return $this->withHeader('Authorization', 'Bearer '.$token);
    }

    private function postAs(self $who, string $body): string
    {
        return $who->postJson("/api/chat/conversations/{$this->conversationId}/messages", ['body' => $body])
            ->assertCreated()
            ->json('data.id');
    }

    private function removeAs(self $who, string $messageId): \Illuminate\Testing\TestResponse
    {
        return $who->postJson("/api/chat/conversations/{$this->conversationId}/messages/{$messageId}/delete");
    }

    public function test_a_teacher_removes_a_message_and_the_text_never_comes_back(): void
    {
        $id = $this->postAs($this->asStudent(), 'Something they should not have said.');

        $this->removeAs($this->asTeacher(), $id)
            ->assertOk()
            ->assertJsonPath('data.is_deleted', true)
            ->assertJsonPath('data.body', null);

        // The tombstone keeps its place in the transcript — but the text is gone
        // from every response, for everyone, forever.
        $this->asStudent()
            ->getJson("/api/chat/conversations/{$this->conversationId}/messages")
            ->assertOk()
            ->assertJsonPath('data.messages.0.is_deleted', true)
            ->assertJsonPath('data.messages.0.body', null);

        // Still a row, though. Schools are asked for these transcripts.
        $this->assertDatabaseHas('chat_messages', [
            'id' => $id,
            'body' => 'Something they should not have said.',
            'deleted_by_type' => 'user',
            'deleted_by_id' => $this->teacher->id,
        ]);
    }

    public function test_a_student_may_remove_their_own_message_but_not_anyone_elses(): void
    {
        $mine = $this->postAs($this->asStudent(), 'Sent by mistake.');
        $theirs = $this->postAs($this->asTeacher(), 'Homework is due Friday.');

        $this->removeAs($this->asStudent(), $mine)->assertOk();
        $this->removeAs($this->asStudent(), $theirs)->assertStatus(403);

        $this->assertNotNull(ChatMessage::find($mine)->deleted_at);
        $this->assertNull(ChatMessage::find($theirs)->deleted_at, "a student cannot remove the teacher's message");
    }

    public function test_removing_twice_is_not_an_error(): void
    {
        $id = $this->postAs($this->asStudent(), 'Twice.');

        $first = $this->removeAs($this->asTeacher(), $id)->assertOk()->json('data');
        $second = $this->removeAs($this->asTeacher(), $id)->assertOk()->json('data');

        // Two teachers reaching for the same message at once should both see it
        // gone, rather than one of them see a failure.
        $this->assertSame($first, $second);
        $this->assertSame(
            1,
            ChatMessage::where('id', $id)->whereNotNull('deleted_at')->count(),
        );
    }

    public function test_a_removal_reaches_a_client_that_is_only_polling(): void
    {
        $id = $this->postAs($this->asStudent(), 'Visible for now.');

        // Where the student's poll has already got to. Everything below is about
        // what a client learns *after* this point.
        $cursor = $this->asStudent()->getJson('/api/chat/sync')->assertOk()->json('data.cursor');

        $this->travel(5)->seconds();
        $this->removeAs($this->asTeacher(), $id)->assertOk();

        $synced = $this->asStudent()
            ->getJson('/api/chat/sync?since='.urlencode($cursor))
            ->assertOk()
            ->json('data.messages');

        // The whole point of keying the poll on when a row last changed rather
        // than when it was posted: a message removed after the cursor has moved
        // past it would otherwise stay on screen until a reload.
        $this->assertCount(1, $synced, 'the removal must arrive on the next poll');
        $this->assertSame($id, $synced[0]['id']);
        $this->assertTrue($synced[0]['is_deleted']);
        $this->assertNull($synced[0]['body']);
    }

    public function test_a_teacher_closes_the_group_and_the_transcript_stays_readable(): void
    {
        $this->postAs($this->asTeacher(), 'Last word on this.');

        $this->asTeacher()
            ->postJson("/api/chat/conversations/{$this->conversationId}/lock", ['locked' => true])
            ->assertOk()
            ->assertJsonPath('data.locked', true);

        $this->asStudent()
            ->postJson("/api/chat/conversations/{$this->conversationId}/messages", ['body' => 'But ma’am—'])
            ->assertStatus(403);

        // Closed is not hidden. Everyone keeps the history.
        $this->asStudent()
            ->getJson("/api/chat/conversations/{$this->conversationId}/messages")
            ->assertOk()
            ->assertJsonPath('data.messages.0.body', 'Last word on this.');

        $this->asStudent()
            ->getJson('/api/chat/conversations')
            ->assertOk()
            ->assertJsonPath('data.0.locked', true)
            ->assertJsonPath('data.0.can_post', false);

        // And the poll has to agree. The client folds every sync response over
        // its cached state, so a can_post computed from membership alone here
        // would reopen the composer within one poll of the group being closed.
        $this->asStudent()
            ->getJson('/api/chat/sync')
            ->assertOk()
            ->assertJsonPath('data.conversations.0.locked', true)
            ->assertJsonPath('data.conversations.0.can_post', false);
    }

    public function test_closing_is_reversible(): void
    {
        $this->asTeacher()
            ->postJson("/api/chat/conversations/{$this->conversationId}/lock", ['locked' => true])
            ->assertOk();

        $this->asTeacher()
            ->postJson("/api/chat/conversations/{$this->conversationId}/lock", ['locked' => false])
            ->assertOk()
            ->assertJsonPath('data.locked', false);

        $this->asStudent()
            ->postJson("/api/chat/conversations/{$this->conversationId}/messages", ['body' => 'Thanks ma’am.'])
            ->assertCreated();
    }

    public function test_a_student_cannot_close_the_group(): void
    {
        $this->asStudent()
            ->postJson("/api/chat/conversations/{$this->conversationId}/lock", ['locked' => true])
            ->assertStatus(403);

        $this->assertDatabaseHas('chat_conversations', [
            'id' => $this->conversationId,
            'locked_at' => null,
        ]);
    }

    public function test_someone_outside_the_group_is_told_it_does_not_exist(): void
    {
        $outsider = $this->enrol('Nena', 'Villar', 'nena@moderation.test', 'token-outsider');
        StudentSection::where('student_id', $outsider->id)->first()->update(['is_active' => false]);
        app(ChatSyncQueue::class)->flush();

        $id = $this->postAs($this->asTeacher(), 'Members only.');

        // 404 and not 403, the same answer as for a group that does not exist —
        // otherwise this endpoint reports which conversation ids are real to
        // anyone willing to iterate.
        $this->asStudent('token-outsider')
            ->postJson("/api/chat/conversations/{$this->conversationId}/lock", ['locked' => true])
            ->assertStatus(404);

        $this->removeAs($this->asStudent('token-outsider'), $id)->assertStatus(404);
    }

    public function test_a_teacher_who_has_left_the_section_can_no_longer_moderate_it(): void
    {
        $id = $this->postAs($this->asStudent(), 'Still here.');

        // Reassigned mid-year. The group carries on for whoever takes it over.
        $replacement = User::factory()->create([
            'first_name' => 'Noel',
            'last_name' => 'Aguirre',
            'email' => 'noel@moderation.test',
            'token' => 'token-replacement',
            'token_expiry' => now()->addYear()->toDateTimeString(),
        ]);

        UserInstitution::factory()->create([
            'user_id' => $replacement->id,
            'institution_id' => $this->school->id,
            'role_id' => Role::where('slug', 'subject-teacher')->first()->id,
            'is_default' => true,
            'is_main' => true,
        ]);

        $this->section->update(['adviser' => $replacement->id]);
        app(ChatSyncQueue::class)->flush();

        // Authority lapsed with the assignment. Nobody had to remember to revoke
        // anything, which is the point of deriving it.
        $this->removeAs($this->asTeacher(), $id)->assertStatus(403);
        $this->assertNull(ChatMessage::find($id)->deleted_at);

        $this->withHeader('Authorization', 'Bearer token-replacement')
            ->postJson("/api/chat/conversations/{$this->conversationId}/messages/{$id}/delete")
            ->assertOk();
    }
}
