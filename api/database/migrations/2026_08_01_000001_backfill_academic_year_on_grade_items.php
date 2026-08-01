<?php

use App\Support\AcademicYear;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Give every grade item the school year it belongs to.
     *
     * The "Add Grade Item" form never sent an academic year, so items created
     * through it were stored with none. Nothing year-scoped could see them: the
     * running-grade calculation looked for sibling items in a fixed "2025-2026"
     * bucket, found no item worth any points, and stored a calculated grade of
     * zero on a row filed under that same made-up year. A teacher who had just
     * entered scores was then told there was no calculated grade to apply.
     *
     * The year comes from the subject's class section, which is what already
     * scopes a subject to a school year; institutions that predate that setting
     * fall back to their configured current year.
     */
    public function up(): void
    {
        $subjectIds = DB::table('subject_ecr_items')
            ->join('subjects_ecr', 'subjects_ecr.id', '=', 'subject_ecr_items.subject_ecr_id')
            ->whereNull('subject_ecr_items.academic_year')
            ->distinct()
            ->pluck('subjects_ecr.subject_id');

        foreach ($subjectIds as $subjectId) {
            $year = AcademicYear::forSubject($subjectId);

            DB::table('subject_ecr_items')
                ->whereNull('academic_year')
                ->whereIn('subject_ecr_id', DB::table('subjects_ecr')->where('subject_id', $subjectId)->pluck('id'))
                ->update(['academic_year' => $year]);

            $this->dropStrandedRunningGrades($subjectId);
        }
    }

    /**
     * Clear the zero-grade rows the bug filed under a year the subject never had.
     *
     * These shadow the real running grade in the class record, which keys rows by
     * grading period alone. Only rows that hold nothing a teacher entered are
     * dropped — a row with a final grade on it is left for the school to reconcile,
     * and so is any row whose year the subject genuinely has grade items for.
     */
    private function dropStrandedRunningGrades(string $subjectId): void
    {
        $realYears = DB::table('subject_ecr_items')
            ->join('subjects_ecr', 'subjects_ecr.id', '=', 'subject_ecr_items.subject_ecr_id')
            ->where('subjects_ecr.subject_id', $subjectId)
            ->whereNotNull('subject_ecr_items.academic_year')
            ->distinct()
            ->pluck('subject_ecr_items.academic_year');

        if ($realYears->isEmpty()) {
            return;
        }

        DB::table('student_running_grades')
            ->where('subject_id', $subjectId)
            ->whereNotIn('academic_year', $realYears)
            ->whereNull('final_grade')
            ->where(function ($query) {
                $query->whereNull('grade')->orWhere('grade', '<=', 0);
            })
            ->delete();
    }

    /**
     * Irreversible, and harmlessly so: the stamped year is the one every other
     * query already assumed, and the deleted rows carried neither a calculated
     * nor a final grade.
     */
    public function down(): void
    {
        //
    }
};
