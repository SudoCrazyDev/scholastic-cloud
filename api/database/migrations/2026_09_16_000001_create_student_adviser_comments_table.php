<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The adviser's comment to a parent, one per term.
 *
 * DepEd's Annex G (DO 15, s. 2026) prints a TEACHER'S COMMENTS/REMARKS box for
 * each term, and until now the platform had nowhere to put one — the boxes
 * printed blank for the adviser to fill in by hand. That is fine for a class of
 * twenty and not fine for a school, so this stores them.
 *
 * ## Why this is not a column on `student_running_grades`
 *
 * A running grade is per *subject* per term. The comment is per *learner* per
 * term — one paragraph about the child, not eight about eight learning areas —
 * so hanging it off a grade row would mean picking an arbitrary subject to own
 * it and would multiply by however many subjects the section runs.
 *
 * ## Why the unique key has no section in it
 *
 * `(student_id, academic_year, quarter)`. A learner has one section in a year
 * and one card per term, so the comment on that card is one row. Keying on the
 * section as well would let a mid-year transfer produce two comments for the
 * same term with no rule for which one prints. `class_section_id` is recorded
 * anyway, because scoping a request to what an adviser may reach needs it, and
 * because "who wrote this" is a question a principal will ask.
 *
 * `quarter` is a string for the same reason it is one on `student_running_grades`:
 * the platform stores a plain ordinal and a three-term year simply never uses '4'.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('student_adviser_comments', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('student_id');
            $table->uuid('class_section_id');
            $table->string('academic_year');
            $table->string('quarter', 2);
            $table->text('comment');

            // Who last wrote it. Nullable and null-on-delete: a comment on a
            // card a parent already received must not vanish because the
            // teacher who wrote it left the school.
            $table->uuid('recorded_by')->nullable();

            $table->timestamps();

            $table->unique(['student_id', 'academic_year', 'quarter'], 'student_adviser_comments_unique');

            // The read path is always "every comment for this section this
            // year" — the tab loads the whole section at once so an adviser
            // can see who is still missing one.
            $table->index(['class_section_id', 'academic_year'], 'student_adviser_comments_section_idx');

            $table->foreign('student_id')->references('id')->on('students')->onDelete('cascade');
            $table->foreign('class_section_id')->references('id')->on('class_sections')->onDelete('cascade');
            $table->foreign('recorded_by')->references('id')->on('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('student_adviser_comments');
    }
};
