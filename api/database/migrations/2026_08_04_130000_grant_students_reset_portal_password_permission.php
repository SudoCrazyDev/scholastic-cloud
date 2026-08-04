<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Hands `students.reset-portal-password` to the roles that should already have
 * it, so the ability arrives switched on rather than as a box every school has
 * to go and find.
 *
 * Two groups, for two different reasons:
 *
 *   1. Every role holding `students.manage`. Resetting a portal login has always
 *      been part of managing a student, through the endpoint that writes the
 *      email and password together. Splitting the password off into its own
 *      permission must not quietly take it away from whoever had it — including
 *      a role a school built itself, which is why this is granted off the
 *      permission rather than a list of slugs.
 *   2. Roles slugged as a subject teacher. This is the new grant: a teacher is
 *      the person a student who cannot sign in actually tells, so they may issue
 *      a new password. They are not given `students.manage` by this, so the
 *      email a login belongs to still is not theirs to change.
 *
 * The slug spellings mirror SystemRolePermissions::ALIASES — the same job goes
 * by more than one slug across tenants, and a school whose role is titled
 * "Teacher" means the same thing by it.
 */
return new class extends Migration
{
    private const MANAGE = 'students.manage';

    private const PERMISSION = 'students.reset-portal-password';

    /**
     * @var array<string>
     */
    private const TEACHER_SLUGS = ['subject-teacher', 'teacher', 'subject_teacher'];

    public function up(): void
    {
        $roleIds = DB::table('role_permissions')
            ->where('permission', self::MANAGE)
            ->pluck('role_id')
            ->all();

        $teacherRoleIds = DB::table('roles')
            ->whereIn('slug', self::TEACHER_SLUGS)
            ->pluck('id')
            ->all();

        foreach (array_unique(array_merge($roleIds, $teacherRoleIds)) as $roleId) {
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
