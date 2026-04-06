<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('admission_form_submissions', function (Blueprint $table) {
            $table->string('status')->default('pending')->after('payload'); // pending | accepted | rejected
            $table->char('student_id', 36)->nullable()->after('status');
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::table('admission_form_submissions', function (Blueprint $table) {
            $table->dropIndex(['status']);
            $table->dropColumn(['status', 'student_id']);
        });
    }
};
