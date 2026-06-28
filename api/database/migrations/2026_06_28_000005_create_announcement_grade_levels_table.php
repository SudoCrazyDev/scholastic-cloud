<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Targeting rows used when an announcement's scope is 'grade_levels'.
        // grade_level is stored as a string to match class_sections.grade_level
        // (which is a free string, not a FK to the grade_levels table).
        Schema::create('announcement_grade_levels', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('announcement_id');
            $table->string('grade_level');
            $table->timestamps();

            $table->foreign('announcement_id')->references('id')->on('announcements')->cascadeOnDelete();

            $table->unique(['announcement_id', 'grade_level'], 'announcement_grade_levels_unique');
            $table->index('grade_level', 'announcement_grade_levels_grade_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('announcement_grade_levels');
    }
};
