<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Hands `subjects.view-all` to the roles that already behaved as if they had it,
 * so nobody's My Assigned Subjects changes on the day this ships.
 *
 * Until now the screen decided its scope from a hardcoded list of slug
 * spellings in UserController. That list is the bug: a suffixed slug missed it
 * and five of Maranatha's department heads quietly got a teacher's view. The
 * check is a permission now, and this grants that permission to exactly the
 * roles the old list named — principal, institution administrator, department
 * head, and the alias spellings tenants actually use.
 *
 * It cannot be granted off an existing permission the way
 * `students.reset-portal-password` was. A department head's module set is
 * identical to a subject teacher's, `subjects.manage` included, so there is no
 * permission that separates them; granting off `subjects.manage` would hand
 * every teacher in every school the whole school's subject list. Slugs are the
 * only signal that exists in the data, which is precisely why this runs once and
 * the runtime check never looks at a slug again.
 *
 * Runs after 2026_08_14_120000, so suffixed slugs are canonical by the time the
 * whereIn below is evaluated.
 *
 * A school that wants a different role to hold this can tick it in the role
 * builder; a school that wants one of these roles not to hold it can untick it.
 */
return new class extends Migration
{
    private const PERMISSION = 'subjects.view-all';

    /**
     * The old UserController::SUBJECT_OVERVIEW_ROLES, plus the alias spellings
     * from SystemRolePermissions::ALIASES for the same three jobs.
     *
     * @var array<string>
     */
    private const OVERVIEW_SLUGS = [
        'principal',
        'institution-administrator',
        'institution-admin',
        'department-head',
    ];

    public function up(): void
    {
        $roleIds = DB::table('roles')
            ->whereIn('slug', self::OVERVIEW_SLUGS)
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
