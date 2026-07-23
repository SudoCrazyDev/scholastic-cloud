<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Marks which storage model an assessment uses for its questions/answers.
 *   1 (legacy) = questions live in subject_ecr_items.content->questions (index-keyed answers).
 *   2 (v2)     = questions in assessment_questions rows, answers in student_assessment_answers
 *               (keyed by stable question id; editing/reordering never corrupts submissions).
 * All existing rows are stamped 1; new assessments are created as 2.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('subject_ecr_items', function (Blueprint $table) {
            $table->unsignedTinyInteger('content_version')->default(1)->after('content');
        });

        // Be explicit rather than relying on the column default for pre-existing rows.
        Schema::getConnection()->table('subject_ecr_items')->update(['content_version' => 1]);
    }

    public function down(): void
    {
        Schema::table('subject_ecr_items', function (Blueprint $table) {
            $table->dropColumn('content_version');
        });
    }
};
