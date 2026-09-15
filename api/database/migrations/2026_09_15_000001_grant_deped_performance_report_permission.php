<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Opens the DepEd Performance Report for the roles that will actually print it.
 *
 * `SystemRolePermissions` now lists `deped-performance-report`, but that only
 * takes effect when a built-in role is *created* — every existing tenant's roles
 * were created long ago, so without this the module ships switched off
 * everywhere and each school has to go hunting in the role builder before an
 * adviser can open the tab.
 *
 * Modelled on `2026_09_14_000005_grant_matatag_grading_permission.php`, and safe
 * for the same reason: the two gates compose. `deped-performance-report` is also
 * a **feature**, defaulting to off, and `EnsureFeatureEnabled` does not even
 * honour the super-administrator wildcard. A school that has not been switched
 * on sees nothing here whatever its roles say; a school that has finds its
 * advisers already able to print rather than locked out by a tick box nobody
 * knew about.
 *
 * ## Why there is no `manage`
 *
 * The module declares `base_abilities => ['view']`. Every figure on the form is
 * owned by another module — Consolidated Grades writes the marks, Student
 * Attendance writes the days — and this only lays them out on DepEd's newer
 * sheet. Granting a `manage` that the module does not offer would put a dead
 * permission string in `role_permissions` for every tenant.
 *
 * `view-all` is reach across other people's sections, for the roles that oversee
 * rather than teach. An adviser prints their own section without it.
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
        'principal' => ['view', 'view-all'],
        'institution-administrator' => ['view', 'view-all'],
        'institution-admin' => ['view', 'view-all'],

        // The advisers. Three spellings of one job across tenants.
        'subject-teacher' => ['view'],
        'teacher' => ['view'],
        'subject_teacher' => ['view'],

        // Oversight: read every section rather than only an advisory of their own.
        'department-head' => ['view', 'view-all'],
        'curriculum-head' => ['view', 'view-all'],
        'assistant-principal' => ['view', 'view-all'],
        'assistant-principal-head' => ['view', 'view-all'],

        // The registrar hands out and re-issues report cards without teaching,
        // so they read every section too.
        'registrar' => ['view', 'view-all'],
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
                        'permission' => 'deped-performance-report.'.$ability,
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
            ->where('permission', 'like', 'deped-performance-report.%')
            ->delete();
    }
};
