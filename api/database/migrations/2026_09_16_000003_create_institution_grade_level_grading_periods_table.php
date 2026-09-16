<?php

use App\Support\GradingPeriods;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * Per-grade-level exceptions to a school year's grading period structure.
 *
 * `institution_academic_years.grading_period_type` is school-wide for the year,
 * and that was never enough. DepEd's 3-term structure does not reach Senior High:
 * Grades 11 and 12 run two semesters of two quarters each, so a school that moves
 * to terms still has to grade its SHS learners over four periods **in the same
 * year**. With only the year-level flag, `assertValidPeriod()` refuses quarter 4
 * for every Grade 11 and 12 teacher the moment the school switches.
 *
 * This table holds *only the exceptions*. The year row stays the default and is
 * untouched, so a school with no SHS never grows a row here and every existing
 * query keeps working. Resolution is: grade-level override, else year default,
 * else quarters.
 *
 * `grade_level` mirrors `class_sections.grade_level`, which is a free string a
 * school types rather than a FK, so it is stored canonicalised (see
 * `GradingPeriods::canonicalGradeLevel`) and compared the same way — otherwise
 * 'Grade 11' and 'grade  11' become two different overrides.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('institution_grade_level_grading_periods', function (Blueprint $table) {
            $table->uuid('id')->primary();

            // Carried alongside the academic-year id so an institution-scoped
            // clean-up or export never has to reach through the year row.
            $table->uuid('institution_id');
            $table->uuid('institution_academic_year_id');

            $table->string('grade_level', 50);
            $table->enum('grading_period_type', ['quarter', 'term']);

            $table->timestamps();

            $table->foreign('institution_id')
                ->references('id')->on('institutions')
                ->cascadeOnDelete();

            // The override is meaningless without the year it qualifies.
            $table->foreign('institution_academic_year_id', 'inst_gl_grading_year_fk')
                ->references('id')->on('institution_academic_years')
                ->cascadeOnDelete();

            $table->unique(
                ['institution_academic_year_id', 'grade_level'],
                'inst_gl_grading_year_level_unique'
            );

            // The hot path: resolve a structure for (institution, year, grade level).
            $table->index(['institution_id', 'grade_level'], 'inst_gl_grading_lookup_idx');
        });

        $this->backfillSeniorHigh();
    }

    /**
     * Any year already switched to terms predates this table, and its Senior High
     * grades are being averaged over three periods right now. Write the quarter
     * overrides for Grades 11 and 12 so those schools come back correct on deploy
     * rather than waiting for an administrator to notice.
     *
     * Only years on 'term' are touched — a quarter year already behaves correctly
     * for SHS and an override there would be a no-op row. Schools that genuinely
     * want SHS on terms can change it in Settings afterwards.
     */
    private function backfillSeniorHigh(): void
    {
        $termYears = DB::table('institution_academic_years')
            ->where('grading_period_type', 'term')
            ->get(['id', 'institution_id']);

        if ($termYears->isEmpty()) {
            return;
        }

        $now = now();
        $rows = [];

        foreach ($termYears as $year) {
            foreach (GradingPeriods::SENIOR_HIGH_GRADE_LEVELS as $gradeLevel) {
                $rows[] = [
                    'id' => (string) Str::uuid(),
                    'institution_id' => $year->institution_id,
                    'institution_academic_year_id' => $year->id,
                    'grade_level' => $gradeLevel,
                    'grading_period_type' => 'quarter',
                    'created_at' => $now,
                    'updated_at' => $now,
                ];
            }
        }

        DB::table('institution_grade_level_grading_periods')->insert($rows);
    }

    public function down(): void
    {
        Schema::dropIfExists('institution_grade_level_grading_periods');
    }
};
