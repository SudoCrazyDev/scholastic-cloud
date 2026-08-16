<?php

namespace Tests\Feature;

use App\Models\ClassSection;
use App\Models\Institution;
use App\Models\InstitutionFeature;
use App\Models\Role;
use App\Models\Student;
use App\Models\StudentAuth;
use App\Models\StudentInstitution;
use App\Models\StudentSection;
use App\Models\User;
use App\Models\UserInstitution;
use App\Services\Chat\ChatSyncQueue;
use App\Support\Features;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * Which institutions have which features.
 *
 * The platform's half of a two-part gate. A role says what a person inside a
 * school may reach; this says whether the school has the thing at all. The
 * distinction only earns its keep if it holds in the awkward case — so the case
 * that matters most here is the school's own administrator, and the platform
 * super-administrator, both being unable to use a feature that is switched off.
 */
class InstitutionFeatureAccessTest extends TestCase
{
    use RefreshDatabase;

    private Institution $school;

    private User $teacher;

    private User $superAdmin;

    private Student $student;

    protected function setUp(): void
    {
        parent::setUp();

        // No chat service configured: this is about the gate, not the transport.
        config()->set('chat.tenant', null);
        config()->set('chat.worker.url', null);
        config()->set('chat.worker.secret', null);
        Cache::flush();
        Features::flush();

        $this->school = Institution::factory()->create(['title' => 'Gated High']);

        $teacherRole = Role::firstOrCreate(['slug' => 'subject-teacher'], ['title' => 'Subject Teacher']);

        $this->teacher = User::factory()->create([
            'first_name' => 'Ana',
            'last_name' => 'Reyes',
            'email' => 'ana@gated.test',
            'token' => 'token-teacher',
            'token_expiry' => now()->addYear()->toDateTimeString(),
        ]);

        UserInstitution::factory()->create([
            'user_id' => $this->teacher->id,
            'institution_id' => $this->school->id,
            'role_id' => $teacherRole->id,
            'is_default' => true,
            'is_main' => true,
        ]);

        $section = ClassSection::create([
            'institution_id' => $this->school->id,
            'grade_level' => '7',
            'title' => '7-Bonifacio',
            'adviser' => $this->teacher->id,
            'academic_year' => '2026-2027',
        ]);

        $this->student = Student::create([
            'first_name' => 'Iñigo',
            'last_name' => 'Salazar',
            'gender' => 'male',
            'birthdate' => '2013-01-01',
            'is_active' => true,
        ]);

        StudentInstitution::create([
            'student_id' => $this->student->id,
            'institution_id' => $this->school->id,
            'is_active' => true,
        ]);

        StudentAuth::create([
            'student_id' => $this->student->id,
            'email' => 'inigo@gated.test',
            'password' => Hash::make('student-password'),
            'is_new' => false,
            'token' => 'token-student',
            'token_expiry' => now()->addYear()->toDateTimeString(),
        ]);

        StudentSection::create([
            'student_id' => $this->student->id,
            'section_id' => $section->id,
            'academic_year' => '2026-2027',
            'is_active' => true,
        ]);

        app(ChatSyncQueue::class)->flush();

        $this->superAdmin = User::factory()->create([
            'first_name' => 'Platform',
            'last_name' => 'Admin',
            'email' => 'platform@gated.test',
            'token' => 'token-super',
            'token_expiry' => now()->addYear()->toDateTimeString(),
        ]);

        UserInstitution::factory()
            ->role('super-administrator')
            ->create([
                'user_id' => $this->superAdmin->id,
                'institution_id' => $this->school->id,
                'is_default' => true,
                'is_main' => true,
            ]);

        $this->assertTrue(
            $this->superAdmin->fresh()->hasFullAccess(),
            'the fixture must actually hold the wildcard, or the tests below prove nothing',
        );
    }

    private function enableChat(bool $enabled): void
    {
        InstitutionFeature::updateOrCreate(
            ['institution_id' => $this->school->id, 'feature' => 'chat'],
            ['enabled' => $enabled],
        );

        Features::flush();
    }

    private function asTeacher(): self
    {
        return $this->withHeader('Authorization', 'Bearer token-teacher');
    }

    private function asStudent(): self
    {
        return $this->withHeader('Authorization', 'Bearer token-student');
    }

    private function asSuperAdmin(): self
    {
        return $this->withHeader('Authorization', 'Bearer token-super');
    }

    public function test_chat_is_off_until_the_platform_switches_a_school_on(): void
    {
        // Nobody has decided about this school, so the feature's own default
        // answers — and chat ships off while it is being rolled out.
        $this->asTeacher()->getJson('/api/chat/conversations')->assertStatus(403);

        $this->enableChat(true);

        $this->asTeacher()
            ->getJson('/api/chat/conversations')
            ->assertOk()
            ->assertJsonPath('data.0.title', '7-Bonifacio');
    }

    public function test_a_switched_off_feature_closes_every_chat_endpoint(): void
    {
        $this->enableChat(true);

        $conversationId = $this->asTeacher()->getJson('/api/chat/conversations')->json('data.0.id');
        $messageId = $this->asTeacher()
            ->postJson("/api/chat/conversations/{$conversationId}/messages", ['body' => 'Before.'])
            ->assertCreated()
            ->json('data.id');

        $this->enableChat(false);

        /*
         * Every route, not just the obvious ones. The gate is declared once
         * around the whole group precisely so that a route added later cannot
         * quietly miss it — this is what checks that it did not.
         */
        $this->asTeacher()->getJson('/api/chat/conversations')->assertStatus(403);
        $this->asTeacher()->getJson('/api/chat/sync')->assertStatus(403);
        $this->asTeacher()->getJson('/api/chat/unread-count')->assertStatus(403);
        $this->asTeacher()->getJson('/api/chat/socket-token')->assertStatus(403);
        $this->asTeacher()->getJson("/api/chat/conversations/{$conversationId}/messages")->assertStatus(403);
        $this->asTeacher()->postJson("/api/chat/conversations/{$conversationId}/read")->assertStatus(403);
        $this->asTeacher()->postJson("/api/chat/conversations/{$conversationId}/lock", ['locked' => true])->assertStatus(403);
        $this->asTeacher()->postJson("/api/chat/conversations/{$conversationId}/messages/{$messageId}/delete")->assertStatus(403);

        $this->asStudent()
            ->postJson("/api/chat/conversations/{$conversationId}/messages", ['body' => 'After.'])
            ->assertStatus(403);

        // And nothing was destroyed by switching it off. Turning it back on
        // returns the school to exactly where it was.
        $this->enableChat(true);

        $this->asStudent()
            ->getJson("/api/chat/conversations/{$conversationId}/messages")
            ->assertOk()
            ->assertJsonPath('data.messages.0.body', 'Before.');
    }

    public function test_the_token_endpoint_is_gated_too(): void
    {
        // Otherwise a school switched off would still be handed a signed token
        // for the chat service and could talk to the edge directly, where
        // nothing knows this feature exists.
        $this->asStudent()->getJson('/api/chat/token')->assertStatus(403);

        $this->enableChat(true);

        $this->asStudent()->getJson('/api/chat/token')->assertOk();
    }

    public function test_a_super_administrator_is_not_an_exception(): void
    {
        // The wildcard is a *permission* wildcard. Whether a school has chat is
        // not a statement about the person asking, so it does not apply — a
        // platform administrator who wants to use chat at a school switches the
        // school on rather than quietly being the one account that can.
        $this->asSuperAdmin()->getJson('/api/chat/conversations')->assertStatus(403);

        $this->enableChat(true);

        $this->asSuperAdmin()->getJson('/api/chat/conversations')->assertOk();
    }

    public function test_one_school_being_switched_on_says_nothing_about_another(): void
    {
        $this->enableChat(true);

        $other = Institution::factory()->create(['title' => 'Ungated High']);

        $outsider = User::factory()->create([
            'first_name' => 'Bea',
            'last_name' => 'Lim',
            'email' => 'bea@ungated.test',
            'token' => 'token-outsider',
            'token_expiry' => now()->addYear()->toDateTimeString(),
        ]);

        UserInstitution::factory()->create([
            'user_id' => $outsider->id,
            'institution_id' => $other->id,
            'role_id' => Role::where('slug', 'subject-teacher')->value('id'),
            'is_default' => true,
            'is_main' => true,
        ]);

        $this->withHeader('Authorization', 'Bearer token-outsider')
            ->getJson('/api/chat/conversations')
            ->assertStatus(403);
    }

    public function test_the_profile_tells_the_client_what_its_school_has(): void
    {
        $this->asTeacher()
            ->getJson('/api/profile')
            ->assertOk()
            ->assertJsonPath('data.features', []);

        $this->enableChat(true);

        $this->asTeacher()
            ->getJson('/api/profile')
            ->assertOk()
            ->assertJsonPath('data.features', ['chat']);

        // Students get the same answer, from their own institution row — chat is
        // one of the few features both sides of the app use.
        $this->asStudent()
            ->getJson('/api/profile')
            ->assertOk()
            ->assertJsonPath('data.features', ['chat']);
    }

    public function test_membership_is_not_shipped_to_the_chat_service_for_a_school_without_chat(): void
    {
        config()->set('chat.tenant', 'gated');
        config()->set('chat.worker.url', 'https://chat.example.workers.dev');
        config()->set('chat.worker.secret', 'secret-for-tests');
        Http::fake(['*' => Http::response(['success' => true])]);

        // A roster is a list of which minors sit in which class. A school that
        // does not have chat has no reason for that to reach a third party, and
        // "they might switch it on later" is not one.
        app(\App\Services\Chat\ChatRosterPublisher::class)->pushInstitution($this->school->id);
        Http::assertNothingSent();

        $this->enableChat(true);

        app(\App\Services\Chat\ChatRosterPublisher::class)->pushInstitution($this->school->id);
        Http::assertSent(fn ($request) => str_ends_with($request->url(), '/internal/rosters'));
    }

    public function test_only_the_platform_can_read_or_change_the_matrix(): void
    {
        // `feature-access` is system_only, so no institution role carries it.
        $this->asTeacher()->getJson('/api/institution-features')->assertStatus(403);
        $this->asTeacher()
            ->putJson("/api/institution-features/{$this->school->id}/chat", ['enabled' => true])
            ->assertStatus(403);

        // And the school is unchanged by the attempt.
        $this->assertDatabaseMissing('institution_features', [
            'institution_id' => $this->school->id,
            'feature' => 'chat',
        ]);

        $this->asSuperAdmin()
            ->getJson('/api/institution-features')
            ->assertOk()
            ->assertJsonPath('data.features.0.key', 'chat')
            ->assertJsonPath('data.institutions.0.features.chat.enabled', false)
            ->assertJsonPath('data.institutions.0.features.chat.decided', false);
    }

    public function test_switching_a_school_on_records_who_did_it(): void
    {
        $this->asSuperAdmin()
            ->putJson("/api/institution-features/{$this->school->id}/chat", ['enabled' => true])
            ->assertOk()
            ->assertJsonPath('data.enabled', true)
            ->assertJsonPath('data.decided', true);

        // The support conversation that starts "who turned this off?" has an
        // answer.
        $this->assertDatabaseHas('institution_features', [
            'institution_id' => $this->school->id,
            'feature' => 'chat',
            'enabled' => true,
            'updated_by' => $this->superAdmin->id,
        ]);

        // Switching it back is an update of the same decision, not a second row.
        $this->asSuperAdmin()
            ->putJson("/api/institution-features/{$this->school->id}/chat", ['enabled' => false])
            ->assertOk()
            ->assertJsonPath('data.enabled', false);

        $this->assertSame(
            1,
            InstitutionFeature::where('institution_id', $this->school->id)->where('feature', 'chat')->count(),
        );
    }

    public function test_an_unknown_feature_is_rejected_rather_than_stored(): void
    {
        $this->asSuperAdmin()
            ->putJson("/api/institution-features/{$this->school->id}/telepathy", ['enabled' => true])
            ->assertStatus(404);

        // A row for a feature that does not exist would sit in the table forever
        // looking like a decision somebody made.
        $this->assertDatabaseMissing('institution_features', ['feature' => 'telepathy']);
    }
}
