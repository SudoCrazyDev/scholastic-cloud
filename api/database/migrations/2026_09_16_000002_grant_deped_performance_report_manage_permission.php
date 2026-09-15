<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Lets the roles that advise a section write the adviser's comment on it.
 *
 * `2026_09_15_000001_grant_deped_performance_report_permission.php` granted
 * `view` and `view-all` and said in so many words that there was no `manage`,
 * because at the time the module owned no data — it only laid other modules'
 * figures out on DepEd's newer sheet. That is no longer true. The module now
 * owns the adviser's comment in the TEACHER'S COMMENTS/REMARKS box, and writing
 * one is a `manage`.
 *
 * `SystemRolePermissions` has been updated to match, but that only takes effect
 * when a built-in role is *created*, and every existing tenant's roles were
 * created long ago — so without this the boxes stay blank everywhere and each
 * school has to go hunting in the role builder.
 *
 * ## Manage here is not permission to change a mark
 *
 * The one endpoint it opens writes prose to `student_adviser_comments`. There is
 * no code path in this module that reaches a grade; Consolidated Grades still
 * owns those, gated separately. A school reading the role builder should come
 * away with the same understanding, which is why the module description spells
 * it out too.
 *
 * ## Why the registrar is absent
 *
 * They hand out and re-issue cards rather than teach, and the comment is the
 * adviser's to write. They keep `view` and `view-all` from the earlier
 * migration. A school that disagrees ticks Manage in the role builder.
 */
return new class extends Migration
{
    /**
     * Role slugs that advise or oversee a section, including the alias
     * spellings tenants use for the same job. `super-administrator` is absent
     * on purpose: it holds the wildcard already.
     *
     * @var array<string>
     */
    private const SLUGS = [
        'principal',
        'institution-administrator',
        'institution-admin',

        // The advisers. Three spellings of one job across tenants.
        'subject-teacher',
        'teacher',
        'subject_teacher',

        'department-head',
        'curriculum-head',
        'assistant-principal',
        'assistant-principal-head',
    ];

    public function up(): void
    {
        $now = now();

        foreach (self::SLUGS as $slug) {
            $roleIds = DB::table('roles')->where('slug', $slug)->pluck('id')->all();

            foreach ($roleIds as $roleId) {
                // Ignore rather than update: the unique (role_id, permission)
                // index means a role already holding it needs nothing done.
                DB::table('role_permissions')->insertOrIgnore([
                    'role_id' => $roleId,
                    'permission' => 'deped-performance-report.manage',
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            }
        }
    }

    /**
     * Drops only `manage`, leaving `view` and `view-all` where the earlier
     * migration put them — rolling this back should undo this migration, not
     * close the module.
     */
    public function down(): void
    {
        DB::table('role_permissions')
            ->where('permission', 'deped-performance-report.manage')
            ->delete();
    }
};
