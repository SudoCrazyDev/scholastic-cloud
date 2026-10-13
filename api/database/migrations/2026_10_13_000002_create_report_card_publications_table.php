<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Which report cards a student may open in the student portal.
 *
 * A teacher publishes one learner's card at a time, and can take it back. Until
 * a row exists here the card is the school's working copy: grades are still
 * being entered, and a student reading a half-finished quarter as final is the
 * outcome this table exists to prevent.
 *
 * ## Existence is the flag
 *
 * There is no `is_published` column. Publishing inserts a row and unpublishing
 * deletes it, so "what can this student see" is a plain lookup with nothing to
 * forget to filter on.
 *
 * ## Why `card_type` is in the key
 *
 * A section can print more than one card — a Grade 2 or 3 section on MATATAG
 * also has the numeric card, or the DepEd Performance Report — and the
 * adviser publishes from the tab that prints the one they mean. The type is
 * what the portal renders, so it is recorded rather than re-derived from
 * features and permissions that can change after the card was handed out.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('report_card_publications', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('institution_id');
            $table->uuid('student_id');
            $table->uuid('class_section_id');
            $table->string('academic_year');
            $table->string('card_type', 32);

            // Null-on-delete: a card a family can already see must not vanish
            // because the teacher who published it left the school.
            $table->uuid('published_by')->nullable();
            $table->timestamps();

            $table->unique(
                ['student_id', 'class_section_id', 'academic_year', 'card_type'],
                'report_card_publications_unique'
            );
            $table->index(['class_section_id', 'academic_year'], 'report_card_publications_section_idx');

            $table->foreign('institution_id')->references('id')->on('institutions')->onDelete('cascade');
            $table->foreign('student_id')->references('id')->on('students')->onDelete('cascade');
            $table->foreign('class_section_id')->references('id')->on('class_sections')->onDelete('cascade');
            $table->foreign('published_by')->references('id')->on('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('report_card_publications');
    }
};
