<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Hands `students.edit-profile` to roles slugged as a subject teacher, so they
 * can correct the details of the students in their own class sections without
 * every school having to find and tick the box.
 *
 * Roles holding `students.manage` need nothing: the edit routes accept either
 * grant, and Manage already reaches every student in the school.
 *
 * The slug spellings mirror SystemRolePermissions::ALIASES — the same job goes
 * by more than one slug across tenants.
 */
return new class extends Migration
{
    private const PERMISSION = 'students.edit-profile';

    /**
     * @var array<string>
     */
    private const TEACHER_SLUGS = ['subject-teacher', 'teacher', 'subject_teacher'];

    public function up(): void
    {
        $teacherRoleIds = DB::table('roles')
            ->whereIn('slug', self::TEACHER_SLUGS)
            ->pluck('id')
            ->all();

        foreach ($teacherRoleIds as $roleId) {
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
