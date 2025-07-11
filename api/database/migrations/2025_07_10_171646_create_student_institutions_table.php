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
        Schema::create('student_institutions', function (Blueprint $table) {
            $table->id();
            $table->uuid('student_id');
            $table->uuid('institution_id');
            $table->boolean('is_active')->default(false);
            $table->string('academic_year')->nullable();
            $table->timestamps();

            $table->foreign('student_id')->references('id')->on('students')->onDelete('cascade');
            $table->foreign('institution_id')->references('id')->on('institutions')->onDelete('cascade');
            $table->unique(['student_id', 'institution_id']);
            $table->unique(['student_id', 'is_active'], 'unique_active_institution_per_student')->where('is_active', true);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('student_institutions');
    }
};
