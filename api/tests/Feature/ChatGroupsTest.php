<?php

namespace Tests\Feature;

use App\Models\ChatParticipant;
use App\Models\ClassSection;
use App\Models\Institution;
use App\Models\Role;
use App\Models\Student;
use App\Models\StudentAuth;
use App\Models\StudentInstitution;
use App\Models\StudentSection;
use App\Models\StudentSubject;
use App\Models\Subject;
use App\Models\User;
use App\Models\UserInstitution;
use App\Services\Chat\ChatSyncQueue;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\Concerns\EnablesInstitutionFeatures;
use Tests\TestCase;

/**
 * Who ends up in which group chat, and what that lets them do.
 *
 * Nothing in this feature has a "create group" button, and these tests are the
 * reason that holds: the roster is derived from the section and subject records
 * a school already keeps, so the only way to be in a room is for the enrolment
 * to say you belong there. The cases worth pinning are the ones where a person's
 * standing changes — a transfer, a subject with a limited roster, a section with
 * nobody advising it — because that is where a derived roster and a hand-managed
 * one part company.
 *
 * The fixture is two sections in one school:
 *
 *   Section 7-A   adviser Santos   students Ana, Ben
 *                 Math    (Santos)
 *                 Science (Reyes)
 *   Section 7-B   adviser Reyes    student  Cruz
 */
class ChatGroupsTest extends TestCase
{
    use EnablesInstitutionFeatures;
    use RefreshDatabase;

    private Institution $school;

    private User $santos;

    private User $reyes;

    private Student $ana;

    private Student $ben;

    private Student $cruz;

    private ClassSection $sectionA;

    private ClassSection $sectionB;

    protected function setUp(): void
    {
        parent::setUp();

        $this->school = Institution::factory()->create(['title' => 'Chat Elementary']);

        // Chat is gated on the institution having the feature, and it ships
        // off. These tests are about what chat does once a school has it.
        $this->enableFeature($this->school->id, 'chat');

        $this->santos = $this->makeTeacher('santos@chat.test', 'token-santos', 'Marites', 'Santos');
        $this->reyes = $this->makeTeacher('reyes@chat.test', 'token-reyes', 'Danilo', 'Reyes');

        $this->ana = $this->makeStudent('ana@chat.test', 'Ana', 'Dela Cruz');
        $this->ben = $this->makeStudent('ben@chat.test', 'Ben', 'Lim');
        $this->cruz = $this->makeStudent('cruz@chat.test', 'Cara', 'Cruz');

        $this->sectionA = $this->makeSection('7-A', $this->santos);
        $this->sectionB = $this->makeSection('7-B', $this->reyes);

        $this->enrol($this->ana, $this->sectionA);
        $this->enrol($this->ben, $this->sectionA);
        $this->enrol($this->cruz, $this->sectionB);

        $this->makeSubject($this->sectionA, $this->santos, 'Mathematics', 0);
        $this->makeSubject($this->sectionA, $this->reyes, 'Science', 1);

        $this->syncChat();
    }

    /*
     * The observers defer their work to after the response, which is right for a
     * request and useless for a fixture built in-process. Drain it by hand so
     * each test starts from a settled roster.
     */
    private function syncChat(): void
    {
        app(ChatSyncQueue::class)->flush();
    }

    private function makeTeacher(string $email, string $token, string $first, string $last): User
    {
        $role = Role::firstOrCreate(
            ['slug' => 'subject-teacher'],
            ['title' => 'Subject Teacher']
        );

        $user = User::factory()->create([
            'first_name' => $first,
            'last_name' => $last,
            'email' => $email,
            'token' => $token,
            'token_expiry' => now()->addYear()->toDateTimeString(),
        ]);

        UserInstitution::factory()->create([
            'user_id' => $user->id,
            'institution_id' => $this->school->id,
            'role_id' => $role->id,
            'is_default' => true,
            'is_main' => true,
        ]);

        return $user;
    }

    private function makeStudent(string $email, string $first, string $last): Student
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
        ]);

        StudentAuth::create([
            'student_id' => $student->id,
            'email' => $email,
            'password' => Hash::make('student-password'),
            'is_new' => false,
            'token' => 'portal-'.$email,
            'token_expiry' => now()->addYear()->toDateTimeString(),
        ]);

        return $student;
    }

    private function makeSection(string $title, ?User $adviser): ClassSection
    {
        return ClassSection::create([
            'institution_id' => $this->school->id,
            'grade_level' => '7',
            'title' => $title,
            'adviser' => $adviser?->id,
            'academic_year' => '2026-2027',
        ]);
    }

    private function makeSubject(ClassSection $section, User $teacher, string $title, int $order): Subject
    {
        return Subject::create([
            'institution_id' => $this->school->id,
            'class_section_id' => $section->id,
            'adviser' => $teacher->id,
            'title' => $title,
            'order' => $order,
        ]);
    }

    private function enrol(Student $student, ClassSection $section): StudentSection
    {
        return StudentSection::create([
            'student_id' => $student->id,
            'section_id' => $section->id,
            'academic_year' => '2026-2027',
            'is_active' => true,
        ]);
    }

    private function asTeacher(User $teacher): self
    {
        return $this->withHeader('Authorization', 'Bearer '.$teacher->token);
    }

    private function asStudent(Student $student): self
    {
        $token = StudentAuth::where('student_id', $student->id)->value('token');

        return $this->withHeader('Authorization', 'Bearer '.$token);
    }

    /** @return array<int,string> conversation titles, sorted */
    private function conversationTitles(array $payload): array
    {
        $titles = array_map(fn ($c) => $c['title'], $payload);
        sort($titles);

        return $titles;
    }

    public function test_a_teacher_gets_one_group_for_their_advisory_and_one_per_subject_they_teach(): void
    {
        $response = $this->asTeacher($this->santos)->getJson('/api/chat/conversations');

        $response->assertOk();
        $data = $response->json('data');

        // Advisory of 7-A, plus the Mathematics she teaches there. The Science
        // taught in the same room by someone else is not hers.
        $this->assertSame(['7-A', 'Mathematics'], $this->conversationTitles($data));

        $advisory = collect($data)->firstWhere('title', '7-A');
        $this->assertSame('advisory', $advisory['type']);
        $this->assertSame('teacher', $advisory['role']);
        $this->assertTrue($advisory['can_post']);

        // Reyes advises 7-B and teaches Science into 7-A: two groups, and no
        // sight of the Mathematics next to his own subject.
        $this->assertSame(
            ['7-B', 'Science'],
            $this->conversationTitles($this->asTeacher($this->reyes)->getJson('/api/chat/conversations')->json('data'))
        );
    }

    public function test_a_student_only_sees_the_groups_their_enrolment_puts_them_in(): void
    {
        // Ana is in 7-A, so: the advisory and both subjects taught to it.
        $this->assertSame(
            ['7-A', 'Mathematics', 'Science'],
            $this->conversationTitles($this->asStudent($this->ana)->getJson('/api/chat/conversations')->json('data'))
        );

        // Cruz is in the other section entirely and shares none of them.
        $this->assertSame(
            ['7-B'],
            $this->conversationTitles($this->asStudent($this->cruz)->getJson('/api/chat/conversations')->json('data'))
        );
    }

    public function test_a_section_with_nobody_advising_it_gets_no_group(): void
    {
        $orphan = $this->makeSection('7-C', null);
        $this->enrol($this->cruz, $orphan);
        $this->syncChat();

        // A room of students with no adult in it is the one shape this feature
        // must never open, so the group is not created at all.
        $this->assertSame(
            ['7-B'],
            $this->conversationTitles($this->asStudent($this->cruz)->getJson('/api/chat/conversations')->json('data'))
        );
    }

    public function test_removing_the_adviser_closes_an_existing_group(): void
    {
        $this->sectionA->update(['adviser' => null]);
        $this->syncChat();

        $advisory = collect($this->asStudent($this->ana)->getJson('/api/chat/conversations')->json('data'))
            ->firstWhere('title', '7-A');

        // The transcript survives — it is a school record — but it is closed.
        $this->assertNotNull($advisory);
        $this->assertTrue($advisory['archived']);
        $this->assertFalse($advisory['can_post']);
    }

    public function test_a_transferred_student_keeps_the_history_and_loses_the_composer(): void
    {
        $conversationId = collect($this->asStudent($this->ana)->getJson('/api/chat/conversations')->json('data'))
            ->firstWhere('title', '7-A')['id'];

        $this->asTeacher($this->santos)
            ->postJson("/api/chat/conversations/{$conversationId}/messages", ['body' => 'Quiz on Friday.'])
            ->assertCreated();

        // Ana moves to 7-B. Written through the model, as the app does — a
        // query-builder mass update fires no events and would leave this test
        // passing for the wrong reason.
        StudentSection::where('student_id', $this->ana->id)
            ->where('section_id', $this->sectionA->id)
            ->first()
            ->update(['is_active' => false]);
        $this->enrol($this->ana, $this->sectionB);
        $this->syncChat();

        $conversations = collect($this->asStudent($this->ana)->getJson('/api/chat/conversations')->json('data'));
        $old = $conversations->firstWhere('title', '7-A');

        $this->assertTrue($old['archived'], 'the old advisory should be filed away');
        $this->assertFalse($old['can_post']);
        $this->assertTrue($conversations->contains(fn ($c) => $c['title'] === '7-B'));

        // Still readable...
        $this->asStudent($this->ana)
            ->getJson("/api/chat/conversations/{$conversationId}/messages")
            ->assertOk()
            ->assertJsonPath('data.messages.0.body', 'Quiz on Friday.');

        // ...and closed to writing.
        $this->asStudent($this->ana)
            ->postJson("/api/chat/conversations/{$conversationId}/messages", ['body' => 'Am I still here?'])
            ->assertStatus(403);
    }

    public function test_a_returning_student_rejoins_the_group_they_left(): void
    {
        $enrolment = StudentSection::where('student_id', $this->ana->id)
            ->where('section_id', $this->sectionA->id)
            ->first();

        $enrolment->update(['is_active' => false]);
        $this->syncChat();

        $enrolment->update(['is_active' => true]);
        $this->syncChat();

        $advisory = collect($this->asStudent($this->ana)->getJson('/api/chat/conversations')->json('data'))
            ->firstWhere('title', '7-A');

        $this->assertFalse($advisory['archived']);
        $this->assertTrue($advisory['can_post']);
    }

    public function test_a_limited_roster_subject_only_includes_the_students_assigned_to_it(): void
    {
        $elective = $this->makeSubject($this->sectionA, $this->santos, 'Robotics', 2);
        $elective->update(['is_limited_student' => true]);

        StudentSubject::create([
            'student_id' => $this->ana->id,
            'subject_id' => $elective->id,
            'academic_year' => '2026-2027',
            'is_active' => true,
        ]);
        $this->syncChat();

        // Ana took the elective; Ben, in the same section, did not.
        $this->assertContains(
            'Robotics',
            $this->conversationTitles($this->asStudent($this->ana)->getJson('/api/chat/conversations')->json('data'))
        );
        $this->assertNotContains(
            'Robotics',
            $this->conversationTitles($this->asStudent($this->ben)->getJson('/api/chat/conversations')->json('data'))
        );
    }

    public function test_a_parent_subject_does_not_get_a_group_of_its_own(): void
    {
        $mapeh = $this->makeSubject($this->sectionA, $this->santos, 'MAPEH', 3);
        $music = $this->makeSubject($this->sectionA, $this->santos, 'Music', 4);
        $music->update(['parent_subject_id' => $mapeh->id]);
        $this->syncChat();

        $titles = $this->conversationTitles(
            $this->asStudent($this->ana)->getJson('/api/chat/conversations')->json('data')
        );

        // The child is where the class actually happens; the container would
        // only put the same students in a second room for the same subject.
        $this->assertContains('Music', $titles);
        $this->assertNotContains('MAPEH', $titles);
    }

    public function test_a_message_is_unread_for_everyone_except_the_person_who_sent_it(): void
    {
        $conversationId = collect($this->asTeacher($this->santos)->getJson('/api/chat/conversations')->json('data'))
            ->firstWhere('title', '7-A')['id'];

        $this->asTeacher($this->santos)
            ->postJson("/api/chat/conversations/{$conversationId}/messages", ['body' => 'Bring your protractors.'])
            ->assertCreated();

        $this->asStudent($this->ana)
            ->getJson('/api/chat/unread-count')
            ->assertOk()
            ->assertJsonPath('data.count', 1);

        // Sending is reading — the sender's own message must not sit in their
        // own badge.
        $this->asTeacher($this->santos)
            ->getJson('/api/chat/unread-count')
            ->assertOk()
            ->assertJsonPath('data.count', 0);

        $this->asStudent($this->ana)->postJson("/api/chat/conversations/{$conversationId}/read")->assertOk();

        $this->asStudent($this->ana)
            ->getJson('/api/chat/unread-count')
            ->assertOk()
            ->assertJsonPath('data.count', 0);
    }

    public function test_sync_returns_what_arrived_after_the_cursor(): void
    {
        $conversationId = collect($this->asTeacher($this->santos)->getJson('/api/chat/conversations')->json('data'))
            ->firstWhere('title', '7-A')['id'];

        $this->asTeacher($this->santos)
            ->postJson("/api/chat/conversations/{$conversationId}/messages", ['body' => 'First.'])
            ->assertCreated();

        // Put the first message well clear of the overlap window the endpoint
        // re-reads, so this test is about the cursor and nothing else.
        $this->travel(10)->seconds();
        $cursor = $this->asStudent($this->ana)->getJson('/api/chat/sync')->json('data.cursor');
        $this->travel(10)->seconds();

        $this->asTeacher($this->santos)
            ->postJson("/api/chat/conversations/{$conversationId}/messages", ['body' => 'Second.'])
            ->assertCreated();

        $sync = $this->asStudent($this->ana)->getJson('/api/chat/sync?since='.urlencode($cursor));

        $sync->assertOk();
        $bodies = array_map(fn ($m) => $m['body'], $sync->json('data.messages'));

        $this->assertSame(['Second.'], $bodies);
        $this->assertFalse($sync->json('data.truncated'));
    }

    public function test_sync_re_reads_a_short_overlap_so_a_message_cannot_fall_through_the_cursor(): void
    {
        $conversationId = collect($this->asTeacher($this->santos)->getJson('/api/chat/conversations')->json('data'))
            ->firstWhere('title', '7-A')['id'];

        $this->asTeacher($this->santos)
            ->postJson("/api/chat/conversations/{$conversationId}/messages", ['body' => 'Just made it.'])
            ->assertCreated();

        // A cursor taken immediately after a write. Two messages committing at
        // once can land either side of a timestamp — the row that commits second
        // can carry the earlier created_at — so a cursor trusted exactly would
        // silently drop one. The endpoint reaches back a couple of seconds and
        // lets the client dedupe by id instead.
        $cursor = $this->asStudent($this->ana)->getJson('/api/chat/sync')->json('data.cursor');

        $bodies = array_map(
            fn ($m) => $m['body'],
            $this->asStudent($this->ana)->getJson('/api/chat/sync?since='.urlencode($cursor))->json('data.messages')
        );

        $this->assertSame(['Just made it.'], $bodies);
    }

    public function test_a_non_member_can_neither_read_nor_post(): void
    {
        $conversationId = collect($this->asTeacher($this->santos)->getJson('/api/chat/conversations')->json('data'))
            ->firstWhere('title', '7-A')['id'];

        // Cruz is in the other section. The answer is the same 404 a missing
        // conversation gets, so this endpoint cannot be walked to find out which
        // groups exist.
        $this->asStudent($this->cruz)
            ->getJson("/api/chat/conversations/{$conversationId}/messages")
            ->assertStatus(404);

        $this->asStudent($this->cruz)
            ->postJson("/api/chat/conversations/{$conversationId}/messages", ['body' => 'hello?'])
            ->assertStatus(404);

        $this->assertDatabaseMissing('chat_participants', [
            'conversation_id' => $conversationId,
            'participant_type' => ChatParticipant::TYPE_STUDENT,
            'participant_id' => $this->cruz->id,
        ]);
    }

    public function test_a_dissolved_section_keeps_its_transcript_and_closes(): void
    {
        $conversationId = collect($this->asTeacher($this->santos)->getJson('/api/chat/conversations')->json('data'))
            ->firstWhere('title', '7-A')['id'];

        $this->asTeacher($this->santos)
            ->postJson("/api/chat/conversations/{$conversationId}/messages", ['body' => 'See you next year.'])
            ->assertCreated();

        $this->sectionA->update(['deleted_at' => now()]);
        $this->syncChat();

        $advisory = collect($this->asTeacher($this->santos)->getJson('/api/chat/conversations')->json('data'))
            ->firstWhere('title', '7-A');

        $this->assertTrue($advisory['archived']);
        $this->assertFalse($advisory['can_post']);

        $this->asTeacher($this->santos)
            ->getJson("/api/chat/conversations/{$conversationId}/messages")
            ->assertOk()
            ->assertJsonPath('data.messages.0.body', 'See you next year.');
    }

    public function test_renaming_a_section_renames_its_group(): void
    {
        $this->sectionA->update(['title' => '7-Sampaguita']);
        $this->syncChat();

        $this->assertSame(
            ['7-Sampaguita', 'Mathematics'],
            $this->conversationTitles($this->asTeacher($this->santos)->getJson('/api/chat/conversations')->json('data'))
        );
    }
}
