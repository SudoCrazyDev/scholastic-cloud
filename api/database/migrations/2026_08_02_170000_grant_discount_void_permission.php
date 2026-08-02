<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Voiding a discount used to be decided by a hardcoded list of role slugs in
 * StudentDiscountController and GradeLevelDiscountController. It is a role
 * builder ability now — `discounts.void` — so this hands it to the roles that
 * already had it, and a school that deployed today notices nothing.
 *
 * The slugs are the old VOID_ROLES list. Institution-created roles are not
 * included: the slug check refused them before, so granting it here would be
 * handing out access nobody asked for. A school that wants a "Cashier" who can
 * void now ticks the box.
 *
 * `super-administrator` is absent because it holds the wildcard, not an
 * enumerated set.
 */
return new class extends Migration
{
    private const SLUGS = ['finance', 'institution-administrator', 'institution-admin', 'principal'];

    private const PERMISSION = 'discounts.void';

    public function up(): void
    {
        $roleIds = DB::table('roles')->whereIn('slug', self::SLUGS)->pluck('id');

        foreach ($roleIds as $roleId) {
            // A role that cannot open Discounts at all is left alone — the
            // ability would sit in the role unusable, and `view` is the row
            // this permission is meaningless without.
            $hasDiscounts = DB::table('role_permissions')
                ->where('role_id', $roleId)
                ->where('permission', 'discounts.view')
                ->exists();

            if (! $hasDiscounts) {
                continue;
            }

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
        $roleIds = DB::table('roles')->whereIn('slug', self::SLUGS)->pluck('id');

        DB::table('role_permissions')
            ->whereIn('role_id', $roleIds)
            ->where('permission', self::PERMISSION)
            ->delete();
    }
};
