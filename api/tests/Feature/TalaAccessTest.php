<?php

namespace Tests\Feature;

use App\Models\Institution;
use App\Models\TalaAccess;
use App\Models\User;
use App\Models\UserInstitution;
use App\Support\Modules;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Tala is granted teacher by teacher, not by role.
 *
 * Every other module is answered by the role attached to a user's institution.
 * Tala is the exception: an administrator picks individual teachers, so
 * `tala_access` is the only source of `tala.view` and `tala.manage`. That makes
 * this a permission boundary rather than a preference, and the cases worth
 * pinning are the ones where the two systems could disagree — a role that still
 * carries the old permission, an administrator who configures without chatting,
 * and a grant at one school leaking into another.
 */
class TalaAccessTest extends TestCase
{
    use RefreshDatabase;

    private Institution $institution;

    private User $admin;

    private User $teacher;

    protected function setUp(): void
    {
        parent::setUp();

        $this->institution = Institution::factory()->create();

        $this->admin = User::factory()->create([
            'email' => 'tala.admin@example.com',
            'token' => 'admin-token',
            'token_expiry' => now()->addDay()->toDateTimeString(),
        ]);
        UserInstitution::factory()
            ->role('institution-administrator')
            ->create([
                'user_id' => $this->admin->id,
                'institution_id' => $this->institution->id,
                'is_default' => true,
                'is_main' => true,
            ]);

        $this->teacher = User::factory()->create([
            'email' => 'tala.teacher@example.com',
            'token' => 'teacher-token',
            'token_expiry' => now()->addDay()->toDateTimeString(),
        ]);
        UserInstitution::factory()
            ->role('subject-teacher')
            ->create([
                'user_id' => $this->teacher->id,
                'institution_id' => $this->institution->id,
                'is_default' => true,
                'is_main' => true,
            ]);
    }

    private function talaPermissions(User $user): array
    {
        $user->forgetResolvedPermissions();

        return array_values(array_filter(
            $user->fresh()->permissionList(),
            fn (string $permission) => str_starts_with($permission, 'tala.')
        ));
    }

    public function test_a_teacher_has_no_tala_access_until_it_is_granted(): void
    {
        $this->assertSame([], $this->talaPermissions($this->teacher));
        $this->assertFalse($this->teacher->fresh()->hasModuleAccess('tala', 'manage'));
    }

    public function test_granting_gives_the_teacher_chat_access(): void
    {
        $this->withHeader('Authorization', 'Bearer admin-token')
            ->putJson('/api/tala/access', [
                'user_ids' => [$this->teacher->id],
                'granted' => true,
            ])
            ->assertOk()
            ->assertJsonPath('data.changed', 1);

        $permissions = $this->talaPermissions($this->teacher);

        $this->assertContains('tala.view', $permissions);
        $this->assertContains('tala.manage', $permissions);
        $this->assertTrue($this->teacher->fresh()->hasModuleAccess('tala', 'manage'));
    }

    public function test_revoking_takes_it_away_but_keeps_the_record(): void
    {
        TalaAccess::create([
            'institution_id' => $this->institution->id,
            'user_id' => $this->teacher->id,
            'is_active' => true,
            'granted_at' => now(),
        ]);

        $this->withHeader('Authorization', 'Bearer admin-token')
            ->putJson('/api/tala/access', [
                'user_ids' => [$this->teacher->id],
                'granted' => false,
            ])
            ->assertOk();

        $this->assertFalse($this->teacher->fresh()->hasModuleAccess('tala', 'manage'));

        // Who took it away and when has to survive the revocation.
        $row = TalaAccess::where('user_id', $this->teacher->id)->first();
        $this->assertNotNull($row, 'the row should be kept for audit, not deleted');
        $this->assertFalse($row->is_active);
        $this->assertSame($this->admin->id, $row->revoked_by);
        $this->assertNotNull($row->revoked_at);
    }

    /**
     * The case that would silently undo the whole feature: a role left over from
     * before the change, still carrying tala.manage in role_permissions.
     */
    public function test_a_role_cannot_confer_tala_even_if_it_still_stores_it(): void
    {
        $roleId = $this->teacher->roleForInstitution($this->institution->id)->id;

        DB::table('role_permissions')->insert([
            ['role_id' => $roleId, 'permission' => 'tala.view', 'created_at' => now(), 'updated_at' => now()],
            ['role_id' => $roleId, 'permission' => 'tala.manage', 'created_at' => now(), 'updated_at' => now()],
        ]);

        $this->assertSame([], $this->talaPermissions($this->teacher));
        $this->assertFalse($this->teacher->fresh()->hasModuleAccess('tala', 'manage'));
    }

    public function test_an_administrator_may_configure_without_being_able_to_chat(): void
    {
        $permissions = $this->talaPermissions($this->admin);

        // Enough to open the screen where the key and the access list live...
        $this->assertContains('tala.configure', $permissions);
        $this->assertContains('tala.view', $permissions);

        // ...but administering Tala is not the same as using it.
        $this->assertNotContains('tala.manage', $permissions);
        $this->assertFalse($this->admin->fresh()->hasModuleAccess('tala', 'manage'));
    }

    public function test_a_grant_at_another_school_does_not_carry_across(): void
    {
        $other = Institution::factory()->create();

        TalaAccess::create([
            'institution_id' => $other->id,
            'user_id' => $this->teacher->id,
            'is_active' => true,
            'granted_at' => now(),
        ]);

        $this->assertFalse(
            $this->teacher->fresh()->hasModuleAccess('tala', 'manage', $this->institution->id)
        );
    }

    public function test_staff_at_another_school_cannot_be_granted(): void
    {
        $outsider = User::factory()->create(['email' => 'outsider@example.com']);
        UserInstitution::factory()->create([
            'user_id' => $outsider->id,
            'institution_id' => Institution::factory()->create()->id,
            'is_default' => true,
        ]);

        $this->withHeader('Authorization', 'Bearer admin-token')
            ->putJson('/api/tala/access', [
                'user_ids' => [$outsider->id],
                'granted' => true,
            ])
            ->assertStatus(422);

        $this->assertDatabaseMissing('tala_access', ['user_id' => $outsider->id]);
    }

    public function test_a_teacher_cannot_grant_themselves_access(): void
    {
        $this->withHeader('Authorization', 'Bearer teacher-token')
            ->putJson('/api/tala/access', [
                'user_ids' => [$this->teacher->id],
                'granted' => true,
            ])
            ->assertStatus(403);

        $this->assertDatabaseMissing('tala_access', ['user_id' => $this->teacher->id]);
    }

    public function test_a_teacher_cannot_read_the_access_list(): void
    {
        $this->withHeader('Authorization', 'Bearer teacher-token')
            ->getJson('/api/tala/access')
            ->assertStatus(403);
    }

    public function test_the_access_list_shows_every_member_of_staff(): void
    {
        TalaAccess::create([
            'institution_id' => $this->institution->id,
            'user_id' => $this->teacher->id,
            'is_active' => true,
            'granted_at' => now(),
        ]);

        $response = $this->withHeader('Authorization', 'Bearer admin-token')
            ->getJson('/api/tala/access')
            ->assertOk();

        // Choosing who gets Tala needs the whole roster, not only the granted.
        $this->assertSame(2, $response->json('meta.staff_count'));
        $this->assertSame(1, $response->json('meta.granted_count'));

        $granted = collect($response->json('data'))->firstWhere('id', $this->teacher->id);
        $this->assertTrue($granted['granted']);
    }

    public function test_teachers_can_no_longer_supply_their_own_api_key(): void
    {
        // The route is gone entirely rather than gated: there is no teacher-side
        // setup left for it to guard.
        $this->withHeader('Authorization', 'Bearer teacher-token')
            ->putJson('/api/tala/credentials', [
                'provider' => 'anthropic',
                'api_key' => str_repeat('k', 40),
            ])
            ->assertStatus(404);
    }

    public function test_the_catalog_no_longer_offers_tala_as_a_role_permission(): void
    {
        $this->assertFalse(Modules::isValidPermission('tala.view'));
        $this->assertFalse(Modules::isValidPermission('tala.manage'));

        // The administrator's half is still a role's to give.
        $this->assertTrue(Modules::isValidPermission('tala.configure'));

        // And no other module was caught by the change.
        $this->assertTrue(Modules::isValidPermission('finance.view'));
        $this->assertTrue(Modules::isValidPermission('finance.manage'));
    }

    public function test_tala_configure_does_not_manufacture_a_view_grant_into_a_role(): void
    {
        // Modules::expand() adds `.view` alongside anything more specific. For a
        // module with no role-assignable view that would write a permission the
        // role is not allowed to hold.
        $this->assertSame(['tala.configure'], Modules::expand(['tala.configure']));
        $this->assertEqualsCanonicalizing(
            ['finance.manage', 'finance.view'],
            Modules::expand(['finance.manage'])
        );
    }
}
