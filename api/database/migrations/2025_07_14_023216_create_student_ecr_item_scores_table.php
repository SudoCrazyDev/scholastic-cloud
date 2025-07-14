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
        Schema::create('student_ecr_item_scores', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('student_id');
            $table->uuid('subject_ecr_item_id');
            $table->decimal('score', 8, 2);
            $table->timestamps();
            
            // Add foreign key constraints
            $table->foreign('student_id')->references('id')->on('students')->onDelete('cascade');
            $table->foreign('subject_ecr_item_id')->references('id')->on('subject_ecr_items')->onDelete('cascade');
            
            // Add indexes for performance
            $table->index('student_id');
            $table->index('subject_ecr_item_id');
            
            // Add unique constraint to prevent duplicate scores for the same student and item
            $table->unique(['student_id', 'subject_ecr_item_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('student_ecr_item_scores');
    }
};
