<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Adds manual grading support for teacher-graded questions
     * (essays, key-less short answers, image/video uploads).
     */
    public function up(): void
    {
        Schema::table('student_assessment_attempts', function (Blueprint $table) {
            // Teacher-awarded points per manually-graded question: {"2": 5, "4": 8}
            $table->json('manual_scores')->nullable()->after('answers');
            $table->timestamp('graded_at')->nullable()->after('manual_scores');
            $table->foreignUuid('graded_by')->nullable()->after('graded_at')
                ->constrained('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('student_assessment_attempts', function (Blueprint $table) {
            $table->dropConstrainedForeignId('graded_by');
            $table->dropColumn(['manual_scores', 'graded_at']);
        });
    }
};
