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
        Schema::create('student_sections', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('student_id')->references('id')->on('students')->onDelete('cascade');
            $table->foreignUuid('section_id')->references('id')->on('class_sections')->onDelete('cascade');
            $table->string('academic_year');
            $table->boolean('is_active')->default(true);
            $table->boolean('is_promoted')->default(false);
            $table->timestamps();
            
            // Add unique constraint to prevent duplicate student-section assignments
            $table->unique(['student_id', 'section_id', 'academic_year']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('student_sections');
    }
};
