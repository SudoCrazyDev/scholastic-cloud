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
        Schema::create('ai_generation_tasks', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('type'); // 'lesson_plans', 'assessments', 'topics'
            $table->uuid('subject_id');
            $table->string('quarter');
            $table->uuid('user_id');
            $table->string('status')->default('pending'); // pending, processing, completed, failed
            $table->integer('total_items')->nullable();
            $table->integer('processed_items')->default(0);
            $table->json('result')->nullable();
            $table->text('error_message')->nullable();
            $table->timestamps();

            $table->index(['subject_id', 'quarter', 'type']);
            $table->index(['user_id']);
            $table->index(['status']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('ai_generation_tasks');
    }
};
