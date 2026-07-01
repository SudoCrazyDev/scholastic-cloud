<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Audit log of student portal access changes (credentials created,
     * password reset, email changed) and who performed them.
     */
    public function up(): void
    {
        Schema::create('student_auth_logs', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('student_id')->constrained('students')->cascadeOnDelete();
            $table->uuid('performed_by')->nullable();          // staff User who performed the action
            $table->string('performed_by_name')->nullable();   // snapshot of performer name at time of action
            $table->string('action');                          // created|reset_password|changed_email
            $table->string('old_email')->nullable();
            $table->string('new_email')->nullable();
            $table->timestamps();

            $table->foreign('performed_by')->references('id')->on('users')->nullOnDelete();
            $table->index(['student_id', 'created_at'], 'student_auth_logs_student_time_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('student_auth_logs');
    }
};
