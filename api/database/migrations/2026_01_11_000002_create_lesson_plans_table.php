<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('lesson_plans', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('subject_id')->constrained('subjects')->onDelete('cascade');
            $table->foreignUuid('subject_quarter_plan_id')->nullable()->constrained('subject_quarter_plans')->nullOnDelete();
            $table->foreignUuid('topic_id')->nullable()->constrained('topics')->nullOnDelete();

            // Stored as string to match existing Topic.quarter usage.
            $table->string('quarter');
            $table->date('lesson_date');

            $table->string('title')->nullable();
            // JSON payload so we can evolve schema without migrations.
            $table->json('content')->nullable();

            // "ai" or "manual" (kept simple)
            $table->string('generated_by')->nullable();
            $table->uuid('generated_by_user_id')->nullable();

            $table->timestamps();

            $table->unique(['subject_id', 'quarter', 'lesson_date']);
            $table->index(['subject_id', 'quarter', 'lesson_date']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('lesson_plans');
    }
};

