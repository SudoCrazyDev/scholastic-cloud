<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Which of a section's own subjects stands for each MATATAG learning area.
 *
 * A Grade 1 section already has its five learning areas as `subjects` rows —
 * GMRC, Makabansa, Reading and Literacy, Language, Mathematics — each with its
 * subject teacher in `subjects.adviser`. Linking an area to that subject is what
 * lets the subject teacher mark that one area's competencies, while the adviser
 * keeps the whole grid.
 *
 * The link names a **subject**, never a person, on purpose: when a school
 * reassigns a subject to another teacher, the right to mark the area moves with
 * it and nobody has to remember to update a second list.
 *
 * It is stored rather than matched by title on every request, because a school
 * renaming "Math" to "Mathematics 1" mid-year must not silently lock a teacher
 * out of marks they have already made. Titles are only used to *suggest* a link.
 *
 * This is a `matatag_*` table and not a column on `subjects`: the module writes
 * only its own tables. See MATATAG.md, "Learning-area teachers".
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('matatag_subject_learning_areas', function (Blueprint $table) {
            $table->uuid('id')->primary();

            // Carried directly, like every tenant table in this module, so an
            // institution clean-up never has to scope it through a join.
            $table->uuid('institution_id');

            $table->uuid('class_section_id');
            $table->string('academic_year');
            $table->uuid('learning_area_id');
            $table->uuid('subject_id');

            $table->uuid('linked_by')->nullable();
            $table->timestamps();

            $table->foreign('institution_id')
                ->references('id')->on('institutions')
                ->cascadeOnDelete();
            $table->foreign('class_section_id')
                ->references('id')->on('class_sections')
                ->cascadeOnDelete();
            $table->foreign('learning_area_id')
                ->references('id')->on('matatag_learning_areas')
                ->cascadeOnDelete();

            // A deleted subject hands its area back to the adviser rather than
            // leaving a link to nothing.
            $table->foreign('subject_id')
                ->references('id')->on('subjects')
                ->cascadeOnDelete();
            $table->foreign('linked_by')
                ->references('id')->on('users')
                ->nullOnDelete();

            // One subject per area per section-year. Two would make "who may
            // mark Mathematics" have two answers.
            $table->unique(['class_section_id', 'academic_year', 'learning_area_id'], 'mtg_subject_areas_section_year_area_uniq');

            $table->index('subject_id', 'mtg_subject_areas_subject_idx');
            $table->index(['institution_id', 'academic_year'], 'mtg_subject_areas_inst_year_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('matatag_subject_learning_areas');
    }
};
