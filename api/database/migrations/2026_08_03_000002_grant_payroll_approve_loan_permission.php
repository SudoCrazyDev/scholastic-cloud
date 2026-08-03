<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Hands `payroll.approve-loan` to the roles that were already trusted to
 * release a payroll period.
 *
 * Approving a loan and releasing a period are the same kind of decision — both
 * move money out of a salary — so a school that already decided who may do the
 * second has effectively answered the first. Granting it off `payroll.release`
 * rather than off a slug list means a school that built its own "Finance
 * Officer" role and gave it release gets loan approval too, which is the
 * outcome they would have asked for.
 *
 * Nobody else is touched. A role with `payroll.manage` can encode a loan and
 * watch it sit pending until an approver reaches it, which is the separation
 * the feature exists for.
 */
return new class extends Migration
{
    private const RELEASE = 'payroll.release';

    private const PERMISSION = 'payroll.approve-loan';

    public function up(): void
    {
        $roleIds = DB::table('role_permissions')
            ->where('permission', self::RELEASE)
            ->pluck('role_id');

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
