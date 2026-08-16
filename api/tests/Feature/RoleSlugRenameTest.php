<?php

namespace Tests\Feature;

use App\Models\Institution;
use App\Models\Role;
use App\Models\User;
use App\Models\UserInstitution;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * A role must not collide with itself when it is renamed.
 *
 * Role::generateSlug() appends `-1` when the slug it wants is taken. It used to
 * count the role being renamed as a competitor, so saving a role without
 * changing its name was enough to suffix it. Maranatha's Department Head went
 * from `department-head` to `department-head-1` that way on 2026-08-12, six days
 * after a migration repaired the same suffix on their administrator role, and
 * five department heads lost their institution-wide subject list to it.
 *
 * It flip-flops, which is what made it hard to see: the next save finds the
 * canonical spelling free and puts it back, and the one after that breaks it
 * again.
 */
class RoleSlugRenameTest extends TestCase
{
    use RefreshDatabase;

    private function platformAdmin(string $token): User
    {
        $role = Role::create([
            'institution_id' => null,
            'title' => 'Super Administrator',
            'slug' => 'super-administrator',
            'is_system' => true,
        ]);

        $user = User::factory()->create([
            'email' => 'platform-admin@roles.test',
            'token' => $token,
            'token_expiry' => now()->addYear()->toDateTimeString(),
        ]);

        UserInstitution::factory()->create([
            'user_id' => $user->id,
            'institution_id' => Institution::factory()->create()->id,
            'role_id' => $role->id,
            'is_default' => true,
            'is_main' => true,
        ]);

        return $user;
    }

    public function test_generate_slug_ignores_the_role_being_renamed(): void
    {
        $role = Role::create([
            'institution_id' => null,
            'title' => 'Department Head',
            'slug' => 'department-head',
            'is_system' => true,
        ]);

        $this->assertSame(
            'department-head',
            Role::generateSlug('Department Head', null, $role->id)
        );
    }

    public function test_generate_slug_still_suffixes_a_genuine_collision(): void
    {
        Role::create([
            'institution_id' => null,
            'title' => 'Department Head',
            'slug' => 'department-head',
            'is_system' => true,
        ]);

        $other = Role::create([
            'institution_id' => null,
            'title' => 'Curriculum Head',
            'slug' => 'curriculum-head',
            'is_system' => true,
        ]);

        // A different role trying to take the name still has to yield.
        $this->assertSame(
            'department-head-1',
            Role::generateSlug('Department Head', null, $other->id)
        );
    }

    /**
     * The exact interaction that broke it: open the role, change nothing about
     * the name, save.
     */
    public function test_saving_a_role_without_renaming_it_keeps_the_slug(): void
    {
        $this->platformAdmin('platform-admin-token');

        $role = Role::create([
            'institution_id' => null,
            'title' => 'Department Head',
            'slug' => 'department-head',
            'is_system' => true,
        ]);

        $this->withHeader('Authorization', 'Bearer platform-admin-token')
            ->putJson("/api/roles/{$role->id}", [
                'title' => 'Department Head',
                'permissions' => ['subjects.manage', 'subjects.view-all'],
            ])
            ->assertOk();

        $this->assertSame('department-head', $role->fresh()->slug);
    }

    public function test_a_real_rename_still_moves_the_slug(): void
    {
        $this->platformAdmin('platform-admin-token');

        $role = Role::create([
            'institution_id' => null,
            'title' => 'Department Head',
            'slug' => 'department-head',
            'is_system' => true,
        ]);

        $this->withHeader('Authorization', 'Bearer platform-admin-token')
            ->putJson("/api/roles/{$role->id}", ['title' => 'Academic Head'])
            ->assertOk();

        $this->assertSame('academic-head', $role->fresh()->slug);
    }
}
