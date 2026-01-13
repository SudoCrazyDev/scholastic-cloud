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

        Schema::create('subject_quarter_plans', function (Blueprint $table){
            $table->uuid('id')->primary();
            $table->foreignUuid('subject_id')->references('id')->on('subjects')->onDelete('cascade');
            $table->string('quarter');
            $table->date('start_date');
            $table->date('exam_date');
            $table->json('meeting_days')->nullable();
            $table->json('excluded_dates')->nullable();
            $table->unsignedInteger('quizzes_count')->default(0);
            $table->unsignedInteger('assignments_count')->default(0);
            $table->unsignedInteger('activities_count')->default(0);
            $table->unsignedInteger('projects_count')->default(0);
            $table->uuid('created_by')->nullable();
            $table->uuid('updated_by')->nullable();
            $table->timestamps();
            $table->unique(['subject_id', 'quarter']);
            $table->index(['subject_id', 'quarter', 'exam_date']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('subject_quarter_plans', function (Blueprint $table) {
            $table->dropForeign(['subject_id']);
        });
        Schema::dropIfExists('subject_quarter_plans');
    }
};

