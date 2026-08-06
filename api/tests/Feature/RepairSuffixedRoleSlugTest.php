<?php

namespace Tests\Feature;

use App\Models\Institution;
use App\Models\Role;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * The migration that drops a collision suffix from a built-in role's slug.
 *
 * The suffix is what broke Maranatha's Receipt Approvals queue, and it can be
 * sitting in any tenant's database. What matters here is how narrow the repair
 * is: it must fix `institution-administrator-1` without renaming a role a
 * school built and named for itself, and without ever collapsing two roles onto
 * one spelling.
 */
class RepairSuffixedRoleSlugTest extends TestCase
{
    use RefreshDatabase;

    private function migrate(): void
    {
        (require __DIR__.'/../../database/migrations/2026_08_06_120000_repair_suffixed_system_role_slugs.php')->up();
    }

    private function slugOf(int $id): string
    {
        return (string) DB::table('roles')->where('id', $id)->value('slug');
    }

    public function test_it_repairs_the_suffixed_administrator_slug(): void
    {
        $role = Role::factory()->create([
            'title' => 'Institution Administrator',
            'slug' => 'institution-administrator-1',
            'is_system' => true,
        ]);
        $role->syncPermissions(['finance.manage', 'announcements.manage']);

        $this->migrate();

        $this->assertSame('institution-administrator', $this->slugOf($role->id));

        // The school's permissions ride on role_id and must survive untouched.
        $this->assertEqualsCanonicalizing(
            ['finance.manage', 'finance.view', 'announcements.manage', 'announcements.view'],
            DB::table('role_permissions')->where('role_id', $role->id)->pluck('permission')->all()
        );
    }

    public function test_it_leaves_a_schools_own_role_alone(): void
    {
        $institution = Institution::factory()->create();

        $ownRole = Role::create([
            'institution_id' => $institution->id,
            'title' => 'Institution Administrator',
            'slug' => 'institution-administrator-1',
        ]);

        $this->migrate();

        $this->assertSame('institution-administrator-1', $this->slugOf($ownRole->id));
    }

    public function test_it_leaves_a_role_that_merely_ends_in_a_number_alone(): void
    {
        $role = Role::factory()->create([
            'title' => 'Coordinator 2',
            'slug' => 'coordinator-2',
            'is_system' => true,
        ]);

        $this->migrate();

        $this->assertSame('coordinator-2', $this->slugOf($role->id));
    }

    public function test_it_never_collapses_two_roles_onto_one_slug(): void
    {
        $canonical = Role::factory()->create([
            'title' => 'Institution Administrator',
            'slug' => 'institution-administrator',
            'is_system' => true,
        ]);
        $suffixed = Role::factory()->create([
            'title' => 'Institution Administrator',
            'slug' => 'institution-administrator-1',
            'is_system' => true,
        ]);

        $this->migrate();

        $this->assertSame('institution-administrator', $this->slugOf($canonical->id));
        $this->assertSame('institution-administrator-1', $this->slugOf($suffixed->id));
    }

    public function test_it_is_safe_to_run_twice(): void
    {
        $role = Role::factory()->create([
            'title' => 'Principal',
            'slug' => 'principal-1',
            'is_system' => true,
        ]);

        $this->migrate();
        $this->migrate();

        $this->assertSame('principal', $this->slugOf($role->id));
        $this->assertSame(1, DB::table('roles')->where('slug', 'principal')->count());
    }
}
