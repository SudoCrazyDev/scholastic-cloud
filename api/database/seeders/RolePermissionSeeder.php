<?php

namespace Database\Seeders;

use App\Models\Role;
use App\Support\Modules;
use App\Support\SystemRolePermissions;
use Illuminate\Database\Seeder;

/**
 * Gives the built-in roles the permissions that match what they could already
 * do, so turning enforcement on changes nothing for an existing tenant.
 *
 * The sets themselves live in App\Support\SystemRolePermissions, which Role
 * also uses when a built-in role is first created.
 *
 * Safe to re-run: it replaces each built-in role's permission set outright.
 * Institution-created roles are never touched.
 */
class RolePermissionSeeder extends Seeder
{
    public function run(): void
    {
        foreach (SystemRolePermissions::slugs() as $slug) {
            // An alias only applies to tenants that happen to use that
            // spelling, so its absence is normal and not worth reporting.
            $isAlias = array_key_exists($slug, SystemRolePermissions::ALIASES);

            $this->apply($slug, SystemRolePermissions::for($slug), quiet: $isAlias);
        }

        $this->reportRolesLeftWithoutAccess();
    }

    /**
     * Name any built-in role still holding nothing, so a deploy says out loud
     * which roles will find every module missing rather than leaving it to be
     * discovered by the people holding them.
     */
    protected function reportRolesLeftWithoutAccess(): void
    {
        $stranded = Role::whereNull('institution_id')
            ->whereDoesntHave('permissions')
            ->pluck('slug')
            ->reject(fn ($slug) => in_array($slug, ['hr', 'hr-admin', 'staff'], true))
            ->values();

        if ($stranded->isEmpty()) {
            return;
        }

        $this->command?->warn(
            'These built-in roles hold no modules and will see an empty sidebar: '
            .$stranded->implode(', ')
            .'. Add each one to App\Support\SystemRolePermissions (or its ALIASES) and re-run this seeder.'
        );
    }

    /**
     * @param  array<string>  $permissions
     */
    protected function apply(string $slug, array $permissions, bool $quiet = false): void
    {
        // Only built-in roles are seeded — an institution's own roles are
        // whatever it configured and must not be overwritten by a deploy.
        $role = Role::whereNull('institution_id')->where('slug', $slug)->first();

        if (! $role) {
            if (! $quiet) {
                $this->command?->warn("RolePermissionSeeder: no system role '{$slug}', skipped.");
            }

            return;
        }

        $invalid = array_filter(
            $permissions,
            fn ($p) => $p !== Modules::WILDCARD && ! Modules::isValidPermission($p)
        );

        if ($invalid !== []) {
            $this->command?->warn(
                "RolePermissionSeeder: '{$slug}' lists unknown permissions: ".implode(', ', $invalid)
            );
        }

        $role->syncPermissions($permissions);
    }
}
