<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * v2 answers: one normalized row per (attempt, question). Keyed by stable question id,
 * so reordering/removing questions can never misalign a student's responses.
 * Enables per-question analytics (GROUP BY question_id). question_id is restrict-on-delete;
 * questions are soft-deleted rather than hard-deleted, so answers always keep their referent.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('student_assessment_answers', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('attempt_id')->constrained('student_assessment_attempts')->onDelete('cascade');
            $table->foreignUuid('question_id')->constrained('assessment_questions')->restrictOnDelete();
            $table->json('response')->nullable();       // student's answer (shape varies by type)
            $table->decimal('awarded', 8, 2)->nullable(); // points awarded (auto or manual)
            $table->boolean('is_correct')->nullable();   // auto-graded outcome (null for manual/ungraded)
            $table->timestamp('graded_at')->nullable();
            $table->uuid('graded_by')->nullable();
            $table->timestamps();

            $table->unique(['attempt_id', 'question_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('student_assessment_answers');
    }
};
