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
        Schema::create('student_running_grades', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('student_id');
            $table->uuid('subject_id');
            $table->enum('quarter', ['1', '2', '3', '4']);
            $table->decimal('grade', 5, 2);
            $table->string('academic_year');
            $table->timestamps();
            
            // Add foreign key constraints
            $table->foreign('student_id')->references('id')->on('students')->onDelete('cascade');
            $table->foreign('subject_id')->references('id')->on('subjects')->onDelete('cascade');
            
            // Add indexes for performance
            $table->index('student_id');
            $table->index('subject_id');
            $table->index(['student_id', 'subject_id', 'quarter', 'academic_year']);
            
            // Add unique constraint to prevent duplicate grades for the same student, subject, quarter, and academic year
            $table->unique(['student_id', 'subject_id', 'quarter', 'academic_year']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('student_running_grades');
    }
}; 