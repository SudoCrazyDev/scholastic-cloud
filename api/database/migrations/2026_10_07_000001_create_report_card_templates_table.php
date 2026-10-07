<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A school's own report card designs, and the grade levels each one prints for.
 *
 * Every section has always printed the same DepEd SF-9 card, whatever its grade
 * level. A template is a layout the frontend knows how to draw (`layout`) plus
 * the wording the school fills into it (`settings`): its name as printed, the
 * letter to parents, the paper size. Assigning one to a grade level makes it
 * that grade level's Report Card; a grade level nobody assigned keeps the
 * standard card, so a school that never opens this screen sees no change.
 *
 * `grade_level` mirrors `class_sections.grade_level`, a free string a school
 * types, so it is stored canonicalised and compared case-insensitively, the
 * same way the grade-level grading period overrides are. A grade level belongs
 * to at most one template per school — the unique index is what makes "which
 * card does Grade 11 print?" have one answer.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('report_card_templates', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('institution_id');
            $table->string('name');
            $table->string('layout', 50);
            $table->json('settings')->nullable();
            $table->timestamps();

            $table->foreign('institution_id')
                ->references('id')->on('institutions')
                ->cascadeOnDelete();

            $table->index('institution_id');
        });

        Schema::create('report_card_template_grade_levels', function (Blueprint $table) {
            $table->uuid('id')->primary();
            // Carried alongside the template id so the uniqueness of a grade level
            // can be enforced per school without reaching through the template.
            $table->uuid('institution_id');
            $table->uuid('report_card_template_id');
            $table->string('grade_level', 50);
            $table->timestamps();

            $table->foreign('institution_id')
                ->references('id')->on('institutions')
                ->cascadeOnDelete();

            $table->foreign('report_card_template_id', 'rct_grade_levels_template_fk')
                ->references('id')->on('report_card_templates')
                ->cascadeOnDelete();

            $table->unique(['institution_id', 'grade_level'], 'rct_grade_levels_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('report_card_template_grade_levels');
        Schema::dropIfExists('report_card_templates');
    }
};
