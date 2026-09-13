<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The descriptors themselves: one letter, A to E, per learner per slot.
 *
 * This is the module's whole record of achievement. There is nothing numeric
 * here and nothing derived from it — no score, no average, no transmutation, no
 * general average. If a future change wants to compute one, it has
 * misunderstood the instrument.
 *
 * Clearing a cell **deletes the row**. There is no "no mark" sentinel, and the
 * model deliberately has no SoftDeletes: a trashed row would keep occupying the
 * unique slot and silently block the teacher from re-marking it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('matatag_competency_ratings', function (Blueprint $table) {
            $table->uuid('id')->primary();

            $table->uuid('institution_id');
            $table->uuid('class_section_id');
            $table->uuid('student_id');
            $table->string('academic_year');

            $table->uuid('slot_id');

            // Denormalised from the slot so the grid and the report card can be
            // fetched without joining up through slots and competencies.
            $table->unsignedTinyInteger('term');
            $table->uuid('learning_area_id');

            // Denormalised so a reprint years later resolves the exact catalog
            // this mark was made against, without walking joins that may by
            // then point into a superseded tree.
            $table->uuid('curriculum_version_id');

            // Validated against config('matatag.descriptors') — deliberately
            // not a MySQL enum. `core_value_markings.marking` is an enum and
            // would need an ALTER TABLE on a large table the day DepEd renames
            // a descriptor, which has already happened once.
            $table->char('descriptor', 1);

            $table->uuid('marked_by')->nullable();
            $table->timestamp('marked_at')->nullable();
            $table->timestamps();

            $table->foreign('institution_id')
                ->references('id')->on('institutions')
                ->cascadeOnDelete();
            $table->foreign('class_section_id')
                ->references('id')->on('class_sections')
                ->cascadeOnDelete();
            $table->foreign('student_id')
                ->references('id')->on('students')
                ->cascadeOnDelete();

            // RESTRICT, and this is the load-bearing guarantee of the whole
            // versioning scheme: a recorded descriptor physically pins its slot
            // row, so deleting a catalog that is in use fails at the database
            // rather than depending on application code being correct.
            $table->foreign('slot_id')
                ->references('id')->on('matatag_competency_slots')
                ->restrictOnDelete();

            $table->foreign('curriculum_version_id')
                ->references('id')->on('matatag_curriculum_versions')
                ->restrictOnDelete();
            $table->foreign('marked_by')
                ->references('id')->on('users')
                ->nullOnDelete();

            // The slot already carries its term and area, so (student, slot) is
            // nearly the whole identity — but `academic_year` must be in it
            // because a retained Grade 1 learner re-sits the same 606 slots
            // next year, and without it the new mark would overwrite last
            // year's record.
            //
            // This is also what makes the bulk upsert idempotent: a teacher who
            // double-clicks Save writes the same column twice and gets no
            // duplicates.
            $table->unique(['student_id', 'academic_year', 'slot_id'], 'mtg_ratings_student_year_slot_uniq');

            $table->index(['class_section_id', 'academic_year', 'term', 'learning_area_id'], 'mtg_ratings_section_year_term_area_idx');
            $table->index(['student_id', 'academic_year', 'term'], 'mtg_ratings_student_year_term_idx');
            $table->index(['institution_id', 'academic_year'], 'mtg_ratings_inst_year_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('matatag_competency_ratings');
    }
};
