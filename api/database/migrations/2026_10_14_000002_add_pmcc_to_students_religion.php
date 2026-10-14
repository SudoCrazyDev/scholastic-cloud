<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Adds `PMCC (4w)` to the `students.religion` enum.
 *
 * The student forms and StudentController's validation have offered it for a
 * while, but the column was never widened to match, so saving a student with
 * it failed in MySQL strict mode with "Data truncated for column 'religion'".
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement("ALTER TABLE students MODIFY religion ENUM('Islam', 'Catholic', 'Iglesia Ni Cristo', 'Baptists', 'PMCC (4w)', 'Others') NULL");
    }

    public function down(): void
    {
        // The narrower enum cannot hold the new value, so those students fall
        // back to the catch-all rather than failing the rollback.
        DB::table('students')->where('religion', 'PMCC (4w)')->update(['religion' => 'Others']);

        DB::statement("ALTER TABLE students MODIFY religion ENUM('Islam', 'Catholic', 'Iglesia Ni Cristo', 'Baptists', 'Others') NULL");
    }
};
