<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A switch a school can throw to close the student portal for a while — during
 * exam week, while grades are being finalized, or when fees are being settled.
 *
 * Defaults to open so existing schools are unaffected. The optional message is
 * what a student is told at the login screen while it is closed; empty means the
 * generic notice.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('institutions', function (Blueprint $table) {
            $table->boolean('student_portal_enabled')->default(true)->after('admission_form_open');
            $table->string('student_portal_disabled_message', 300)->nullable()->after('student_portal_enabled');
        });
    }

    public function down(): void
    {
        Schema::table('institutions', function (Blueprint $table) {
            $table->dropColumn(['student_portal_enabled', 'student_portal_disabled_message']);
        });
    }
};
