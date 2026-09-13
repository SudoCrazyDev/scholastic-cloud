<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Which sections report on MATATAG, and against which catalog version.
 *
 * A school opts a Grade 1-3 section in for an academic year, and that pins the
 * catalog its descriptors are recorded against for the rest of that year.
 * **Everything downstream reads this pin** — the grid, the bulk upsert, the
 * PACE payload — and never `matatag_grade_level_curricula`. That single rule is
 * what makes a new DepEd version invisible to a section already mid-year.
 *
 * Never resolve a catalog from a grade-level string instead. DepEd's own
 * workbook offers Grades 1 to 3 in its header while carrying only Grade 1's
 * competencies, so a school can print Grade 1 competencies under a Grade 2
 * heading with nothing in the file to stop it. Opt-in is where that is caught.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('matatag_section_curricula', function (Blueprint $table) {
            $table->uuid('id')->primary();

            // Carried directly rather than reached through the section. Every
            // tenant table in this module does this deliberately: it is the one
            // thing `core_value_markings` got wrong, and the reason an
            // institution clean-up has to scope that table through enrolment
            // and can take a dual-enrolled learner's other school with it.
            $table->uuid('institution_id');

            $table->uuid('class_section_id');
            $table->string('academic_year');
            $table->uuid('curriculum_version_id');

            // Snapshot of the section's grade level at opt-in.
            //
            // `class_sections.grade_level` is a free string a school types and
            // may rename mid-year — 'Grade 1' to 'Grade 1 - Sampaguita'. That
            // must not silently unpin a section that already has descriptors.
            $table->string('grade_level', 50);

            // Opting out disables; it never deletes. The descriptors and
            // narratives have to survive so the year can still be printed.
            $table->boolean('enabled')->default(true);

            $table->uuid('enabled_by')->nullable();
            $table->timestamp('enabled_at')->nullable();
            $table->timestamps();

            $table->foreign('institution_id')
                ->references('id')->on('institutions')
                ->cascadeOnDelete();
            $table->foreign('class_section_id')
                ->references('id')->on('class_sections')
                ->cascadeOnDelete();
            $table->foreign('curriculum_version_id')
                ->references('id')->on('matatag_curriculum_versions')
                ->restrictOnDelete();
            $table->foreign('enabled_by')
                ->references('id')->on('users')
                ->nullOnDelete();

            // A section runs one catalog in one year. Two rows would give the
            // grid two answers about which slots exist, and make the bulk
            // upsert's "does this slot belong to your version" check — the one
            // that stops a cross-version write — ambiguous.
            $table->unique(['class_section_id', 'academic_year'], 'mtg_section_curricula_section_year_uniq');

            $table->index(['institution_id', 'academic_year'], 'mtg_section_curricula_inst_year_idx');
            $table->index('curriculum_version_id', 'mtg_section_curricula_version_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('matatag_section_curricula');
    }
};
