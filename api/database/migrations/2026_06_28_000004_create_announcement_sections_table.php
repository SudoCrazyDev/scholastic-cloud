<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Targeting rows used when an announcement's scope is 'sections'.
        Schema::create('announcement_sections', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('announcement_id');
            $table->uuid('class_section_id');
            $table->timestamps();

            $table->foreign('announcement_id')->references('id')->on('announcements')->cascadeOnDelete();
            $table->foreign('class_section_id')->references('id')->on('class_sections')->cascadeOnDelete();

            $table->unique(['announcement_id', 'class_section_id'], 'announcement_sections_unique');
            $table->index('class_section_id', 'announcement_sections_section_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('announcement_sections');
    }
};
