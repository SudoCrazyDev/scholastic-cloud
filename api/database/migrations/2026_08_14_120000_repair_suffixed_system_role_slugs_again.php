<?php

use App\Support\SystemRolePermissions;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * The same repair as 2026_08_06_120000, run again.
 *
 * That migration fixed Maranatha's `institution-administrator-1` on 2026-08-06.
 * Six days later their Department Head picked up the identical suffix, because
 * the thing writing it had not been fixed — only the data had. Role::generateSlug()
 * did not exclude the row being renamed, so any role-builder save that included
 * the title found the role's own slug already taken and appended `-1`. Opening
 * "Department Head", changing nothing, and pressing save was enough.
 *
 * Five department heads lost their institution-wide subject list to it, and it
 * flip-flops: the next such save would have set the slug back, and the one after
 * that would have broken it again.
 *
 * generateSlug() now takes the id to ignore and RoleController::update() passes
 * it, so this is the last time the damage can be done. This migration cleans up
 * what was done between the two dates — on every tenant, since the same save is
 * available to all of them.
 *
 * Deliberately narrow, unchanged from the original:
 *
 *   - roles in the system namespace (`institution_id` null) only — a school's own
 *     "Cashier 1" is its own role with its own name, and never this;
 *   - a slug that is a *known* built-in slug with a numeric suffix, so a role
 *     genuinely named "Coordinator 2" is left alone;
 *   - a canonical slug nothing else already holds, so it can never collapse two
 *     roles into one spelling.
 *
 * Permissions live on `role_id` and are not touched, so a repaired role keeps
 * exactly what its school ticked — including anything ticked by hand during the
 * window this repairs.
 */
return new class extends Migration
{
    public function up(): void
    {
        $roles = DB::table('roles')
            ->whereNull('institution_id')
            ->get(['id', 'slug']);

        foreach ($roles as $role) {
            $canonical = $this->canonicalFor((string) $role->slug);
            if ($canonical === null) {
                continue;
            }

            $taken = DB::table('roles')
                ->whereNull('institution_id')
                ->where('slug', $canonical)
                ->exists();

            if ($taken) {
                continue;
            }

            DB::table('roles')
                ->where('id', $role->id)
                ->update(['slug' => $canonical, 'updated_at' => now()]);
        }
    }

    /**
     * The built-in slug a suffixed one is a copy of, or null when the slug is
     * not a suffixed built-in at all.
     */
    private function canonicalFor(string $slug): ?string
    {
        if (! preg_match('/^(.*)-\d+$/', $slug, $matches)) {
            return null;
        }

        $base = $matches[1];

        // `knows()` resolves aliases, so `institution-admin-1` is recognised as
        // a copy of a built-in too. The stored slug stays the alias spelling the
        // tenant already uses — this repairs a suffix, it does not rename roles.
        return SystemRolePermissions::knows($base) ? $base : null;
    }

    public function down(): void
    {
        // Not reversible: the suffix carried no information, and restoring it
        // would put the tenants it was repaired on back into the broken state.
    }
};
