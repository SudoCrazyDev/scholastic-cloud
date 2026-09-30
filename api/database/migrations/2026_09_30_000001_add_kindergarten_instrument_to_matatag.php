<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Makes room for DepEd's Kindergarten progress report beside Key Stage 1's.
 *
 * Three additive changes, each forced by one way Kindergarten's instrument
 * differs from Grade 1's:
 *
 * - **`instrument` on a catalog version.** Kindergarten rates on CO/DV/BG,
 *   writes one remarks paragraph per term, and prints its marks on the card
 *   itself. The version says which instrument it is so that nothing downstream
 *   has to infer it from a grade-level string — see config('matatag.instruments').
 *   Every existing version is Key Stage 1's, which is what the default says.
 * - **`descriptor` widened from `char(1)` to `varchar(4)`.** CO, DV and BG are
 *   two letters. Widening a column keeps every existing value as it is.
 * - **`comments` on a narrative.** Kindergarten's "Teacher's Comments/Remarks"
 *   is not either of Grade 1's two paragraphs, and storing it in `can_do` would
 *   leave the column meaning two things depending on the section.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('matatag_curriculum_versions', function (Blueprint $table) {
            // A string, not an enum, for the reason `shape` is one: a third
            // instrument must be a config entry, not an ALTER TABLE.
            $table->string('instrument', 20)->default('ks1')->after('grade_level');
        });

        Schema::table('matatag_competency_ratings', function (Blueprint $table) {
            $table->string('descriptor', 4)->change();
        });

        Schema::table('matatag_term_narratives', function (Blueprint $table) {
            $table->text('comments')->nullable()->after('to_improve');
        });
    }

    /**
     * Refuses rather than truncating a mark. Narrowing `descriptor` back to
     * one character with CO/DV/BG rows in it would turn every one of them into
     * a C, D or B — a Grade 1 letter on a Kindergarten learner's record.
     */
    public function down(): void
    {
        $wide = DB::table('matatag_competency_ratings')
            ->whereRaw('CHAR_LENGTH(descriptor) > 1')
            ->count();

        if ($wide > 0) {
            throw new RuntimeException(
                "Refusing to roll back: {$wide} Kindergarten rating(s) are two letters long and "
                .'would be truncated to one.'
            );
        }

        $comments = DB::table('matatag_term_narratives')->whereNotNull('comments')->count();

        if ($comments > 0) {
            throw new RuntimeException(
                "Refusing to roll back: {$comments} narrative(s) hold Kindergarten remarks, which "
                .'dropping the column would destroy.'
            );
        }

        Schema::table('matatag_term_narratives', function (Blueprint $table) {
            $table->dropColumn('comments');
        });

        Schema::table('matatag_competency_ratings', function (Blueprint $table) {
            $table->char('descriptor', 1)->change();
        });

        Schema::table('matatag_curriculum_versions', function (Blueprint $table) {
            $table->dropColumn('instrument');
        });
    }
};
