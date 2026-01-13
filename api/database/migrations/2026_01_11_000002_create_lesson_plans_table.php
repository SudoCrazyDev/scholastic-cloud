<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('lesson_plans', function (Blueprint $table){
            $table->uuid('id')->primary();
            $table->foreignUuid('subject_id')->references('id')->on('subjects')->onDelete('cascade');
            $table->uuid('subject_quarter_plan_id');
            $table->uuid('topic_id');
            $table->string('quarter');
            $table->date('lesson_date');
            $table->string('title')->nullable();
            $table->json('content')->nullable();
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
        Schema::table('lesson_plans', function (Blueprint $table) {
            $table->dropForeign(['subject_id']);
            $table->dropForeign(['subject_quarter_plan_id']);
            $table->dropForeign(['topic_id']);
        });
        Schema::dropIfExists('lesson_plans');
    }
};

