<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Opens Teaching Activity for the two roles that run a school.
 *
 * `SystemRolePermissions` now lists `teaching-activity` for institution
 * administrator and principal, but that only takes effect when a built-in role
 * is *created* — every existing tenant's roles were created long ago, so
 * without this the screen ships switched off everywhere and each school has to
 * find the tick box before it can see anything.
 *
 * Granted off the slug rather than off an existing permission, because there
 * is no permission that means "oversees other teachers". The closest is
 * `subjects.view-all`, which department heads also hold — and a department
 * head seeing every teacher in the school is a decision for the school to
 * make in the role builder, not one to make for them here.
 *
 * A school that wants another role to have it ticks it; one that wants a
 * principal not to have it unticks it.
 */
return new class extends Migration
{
    private const PERMISSION = 'teaching-activity.view';

    /**
     * Institution-wide leadership, including the alias spelling tenants use.
     * `super-administrator` is absent on purpose: it holds the wildcard.
     *
     * @var array<string>
     */
    private const SLUGS = [
        'principal',
        'institution-administrator',
        'institution-admin',
    ];

    public function up(): void
    {
        $roleIds = DB::table('roles')
            ->whereIn('slug', self::SLUGS)
            ->pluck('id')
            ->all();

        foreach ($roleIds as $roleId) {
            // Ignore rather than update: the unique (role_id, permission) index
            // means a role that already holds it needs nothing done.
            DB::table('role_permissions')->insertOrIgnore([
                'role_id' => $roleId,
                'permission' => self::PERMISSION,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    public function down(): void
    {
        DB::table('role_permissions')->where('permission', self::PERMISSION)->delete();
    }
};
