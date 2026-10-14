<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Takes back `students.edit-profile`, granted the day before.
 *
 * Editing a student's details no longer sits behind any permission — every
 * staff member may do it from My Class Sections — so the ability is gone from
 * the module catalog. Its rows would otherwise be strings the role builder no
 * longer recognises.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('role_permissions')->where('permission', 'students.edit-profile')->delete();
    }

    public function down(): void
    {
        // Nothing to restore: the permission no longer exists to be granted.
    }
};
