<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Hands `finance.clear-data` to the roles that should be able to authorise it.
 *
 * Unlike most new-ability migrations this one is **not** granted off an existing
 * permission. `finance.manage` is held by every cashier, and clearing a year's
 * receipts is not a cashiering action — inferring the grant from it would hand
 * an irreversible delete to whoever happens to run the POS.
 *
 * So the grant goes by slug, to the two institution-wide roles that already
 * carry the other escalations in SystemRolePermissions::SPECIAL. The
 * super-administrator holds the wildcard and needs nothing here. A school that
 * wants anyone else to have it ticks the box in the role builder, which is the
 * point of it being a separate ability.
 *
 * Slug spellings mirror SystemRolePermissions::ALIASES — the same job goes by
 * more than one slug across tenants.
 */
return new class extends Migration
{
    private const PERMISSION = 'finance.clear-data';

    /**
     * @var array<string>
     */
    private const ROLE_SLUGS = [
        'institution-administrator',
        'institution-admin',
        'principal',
    ];

    public function up(): void
    {
        // Only roles that can already reach Finance at all. A "Principal" role
        // at a school that never granted it Finance should not gain a Finance
        // ability from this.
        $financeRoleIds = DB::table('role_permissions')
            ->where('permission', 'finance.manage')
            ->pluck('role_id')
            ->all();

        if (empty($financeRoleIds)) {
            return;
        }

        $roleIds = DB::table('roles')
            ->whereIn('slug', self::ROLE_SLUGS)
            ->whereIn('id', $financeRoleIds)
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
