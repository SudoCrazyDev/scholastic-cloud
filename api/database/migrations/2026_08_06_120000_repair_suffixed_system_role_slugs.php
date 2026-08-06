<?php

use App\Support\SystemRolePermissions;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Drops the collision suffix from a built-in role's slug.
 *
 * Maranatha's administrator role is titled "Institution Administrator" and
 * slugged `institution-administrator-1` — the `-1` that Role::generateSlug()
 * appends when the name is already taken, left behind by however the role was
 * first created. The role holds every permission it should. The slug is the
 * only thing wrong with it.
 *
 * That one character cost them the Receipt Approvals queue: the controller
 * matched the caller against a list of slug spellings, `-1` was not one of
 * them, and two receipts a student had really uploaded sat unreviewed for over
 * a week behind a screen that said there were none. Seventeen other checks
 * across the API and the app match on the same spelling, so their
 * administrators were quietly missing announcements, sibling discounts,
 * appearance settings, impersonation, grading scales and institution settings
 * as well.
 *
 * The controllers are being moved onto permissions, which is the real fix and
 * the direction the rest of the codebase already went. This repairs the data
 * behind them, because every one of those seventeen sites is wrong for this
 * role until it is renamed — and because the same suffix can be sitting in any
 * tenant's database for any built-in role.
 *
 * Deliberately narrow. It only touches:
 *
 *   - roles in the system namespace (`institution_id` null) — a school's own
 *     "Cashier 1" is its own role with its own name, and never this;
 *   - a slug that is a *known* built-in slug with a numeric suffix, so a role
 *     genuinely named "Coordinator 2" is left alone;
 *   - a canonical slug nothing else already holds, so it can never collapse two
 *     roles into one spelling.
 *
 * Permissions live on `role_id` and are not touched, so a renamed role keeps
 * exactly what its school ticked.
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
