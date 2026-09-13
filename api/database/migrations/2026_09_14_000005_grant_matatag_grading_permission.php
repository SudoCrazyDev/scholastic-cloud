<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Opens MATATAG Progress for the roles that will actually use it.
 *
 * `SystemRolePermissions` now lists `matatag-grading`, but that only takes
 * effect when a built-in role is *created* — every existing tenant's roles were
 * created long ago, so without this the module ships switched off everywhere
 * and each school has to go hunting in the role builder before a Grade 1
 * adviser can mark anything.
 *
 * ## Granting this broadly is safe, and that is deliberate
 *
 * The two gates compose. `matatag-grading` is also a **feature**, defaulting to
 * off, and `EnsureFeatureEnabled` closes every route regardless of any
 * permission — it does not even honour the super-administrator wildcard. So a
 * school that has not been switched on sees nothing here whatever its roles
 * say, and a school that is switched on finds its advisers already able to
 * work rather than locked out by a tick box nobody knew about.
 *
 * ## Who gets what, and why
 *
 * The adviser rows are the load-bearing ones. A Grade 1 classroom is
 * self-contained: one adviser teaches all five learning areas, and in this
 * codebase that person is a `subject-teacher`-slugged user. Without `manage`
 * they cannot open their own grid, which is the entire module.
 *
 * `view-all` is reach across other people's sections, for the roles that
 * oversee rather than teach. `set-up` — deciding which sections report on
 * MATATAG at all, and pinning the catalog version a whole year of descriptors
 * is recorded against — stays with the principal and the administrator.
 *
 * A school that disagrees with any of it changes the role.
 */
return new class extends Migration
{
    /**
     * Role slug => abilities, including the alias spellings tenants use for the
     * same job. `super-administrator` is absent on purpose: it holds the
     * wildcard already.
     *
     * @var array<string, array<string>>
     */
    private const GRANTS = [
        'principal' => ['view', 'manage', 'view-all', 'set-up'],
        'institution-administrator' => ['view', 'manage', 'view-all', 'set-up'],
        'institution-admin' => ['view', 'manage', 'view-all', 'set-up'],

        // The advisers. Three spellings of one job across tenants.
        'subject-teacher' => ['view', 'manage'],
        'teacher' => ['view', 'manage'],
        'subject_teacher' => ['view', 'manage'],

        // Oversight: read every section, mark none of them.
        'department-head' => ['view', 'view-all'],
        'curriculum-head' => ['view', 'view-all'],
        'assistant-principal' => ['view', 'view-all'],
        'assistant-principal-head' => ['view', 'view-all'],
    ];

    public function up(): void
    {
        $now = now();

        foreach (self::GRANTS as $slug => $abilities) {
            $roleIds = DB::table('roles')->where('slug', $slug)->pluck('id')->all();

            foreach ($roleIds as $roleId) {
                foreach ($abilities as $ability) {
                    // Ignore rather than update: the unique (role_id, permission)
                    // index means a role already holding it needs nothing done.
                    DB::table('role_permissions')->insertOrIgnore([
                        'role_id' => $roleId,
                        'permission' => 'matatag-grading.'.$ability,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ]);
                }
            }
        }
    }

    public function down(): void
    {
        DB::table('role_permissions')
            ->where('permission', 'like', 'matatag-grading.%')
            ->delete();
    }
};
