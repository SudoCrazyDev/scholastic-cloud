<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * v2 questions: one row per question, with a stable id and an explicit order.
 * Type-specific data (choices, choiceImages, answer, blanks, pairs, targets, cards,
 * instructions, allow_multiple) lives in `config` because question shapes are polymorphic.
 * Removing a question soft-deletes it, so student answers/history are never destroyed.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('assessment_questions', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('subject_ecr_item_id')->constrained('subject_ecr_items')->onDelete('cascade');
            $table->unsignedInteger('position')->default(0);
            $table->string('type');
            $table->longText('question')->nullable();
            $table->decimal('points', 8, 2)->default(1);
            $table->json('config')->nullable();
            $table->softDeletes();
            $table->timestamps();

            $table->index(['subject_ecr_item_id', 'position']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('assessment_questions');
    }
};
