<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Extended personal information captured on the admission form that does not
     * live on the core `students` table. One row per student.
     */
    public function up(): void
    {
        Schema::create('student_profiles', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('student_id')->unique()->constrained('students')->onDelete('cascade');
            $table->text('complete_address')->nullable();
            $table->string('mobile_number')->nullable();
            $table->string('place_of_birth')->nullable();
            $table->string('mother_tongue')->nullable();
            $table->string('last_school_attended')->nullable();
            $table->string('school_year')->nullable();
            $table->string('school_address')->nullable();
            $table->unsignedSmallInteger('brothers_count')->nullable();
            $table->unsignedSmallInteger('sisters_count')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('student_profiles');
    }
};
