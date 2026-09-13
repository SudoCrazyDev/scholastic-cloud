<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The adviser's two paragraphs per learner per term.
 *
 * These **are** the printed report card. Everything else on it is derived — the
 * attendance table from the platform's own records, the legend from config —
 * and the competency grid prints on the attached PACE forms rather than on the
 * card itself. What a parent actually reads is these two paragraphs.
 *
 * They live in one row rather than two keyed rows because they are always
 * written together and always printed together.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('matatag_term_narratives', function (Blueprint $table) {
            $table->uuid('id')->primary();

            $table->uuid('institution_id');
            $table->uuid('class_section_id');
            $table->uuid('student_id');
            $table->string('academic_year');
            $table->unsignedTinyInteger('term');

            // 'What Your Child Can Do (Mga Nagagawa)'
            $table->text('can_do')->nullable();

            // 'What Your Child Is Learning To Improve (Dapat Linangin)'
            $table->text('to_improve')->nullable();

            $table->uuid('written_by')->nullable();
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
            $table->foreign('written_by')
                ->references('id')->on('users')
                ->nullOnDelete();

            // Two rows would mean two report cards for one learner-term, with
            // nothing to say which one a parent should have been given.
            $table->unique(['student_id', 'academic_year', 'term'], 'mtg_narratives_student_year_term_uniq');

            $table->index(['class_section_id', 'academic_year', 'term'], 'mtg_narratives_section_year_term_idx');
            $table->index(['institution_id', 'academic_year'], 'mtg_narratives_inst_year_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('matatag_term_narratives');
    }
};
