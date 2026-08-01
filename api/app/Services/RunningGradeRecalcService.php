<?php

namespace App\Services;

use App\Models\SubjectEcr;
use App\Models\SubjectEcrItem;
use App\Models\StudentEcrItemScore;
use App\Models\StudentRunningGrade;
use App\Support\AcademicYear;

class RunningGradeRecalcService
{
    public function __construct(
        protected ParentSubjectGradeService $parentSubjectGradeService
    ) {
    }

    /**
     * Recalculate and update the running grade for a student after a score is added or updated.
     */
    public function recalculate(string $studentId, string $subjectEcrItemId): void
    {
        $ecrItem = SubjectEcrItem::with('subjectEcr')->findOrFail($subjectEcrItemId);
        $subjectEcr = $ecrItem->subjectEcr;
        $subjectId = $subjectEcr->subject_id;
        $quarter = $ecrItem->quarter;

        // Items created before the year was stamped on them have none. Resolving the
        // subject's year keeps the running grade on the same row the rest of the app
        // reads, instead of stranding it under a year nothing else uses.
        $academicYear = $ecrItem->academic_year ?: AcademicYear::forSubject($subjectId);
        $includeUnstampedItems = empty($ecrItem->academic_year);

        $subjectEcrs = SubjectEcr::where('subject_id', $subjectId)->get();
        $totalGrade = 0;

        foreach ($subjectEcrs as $categoryEcr) {
            $categoryPercentage = (float) $categoryEcr->percentage;
            $categoryItems = SubjectEcrItem::where('subject_ecr_id', $categoryEcr->id)
                ->where('quarter', $quarter)
                ->where(function ($query) use ($academicYear, $includeUnstampedItems) {
                    $query->where('academic_year', $academicYear);
                    if ($includeUnstampedItems) {
                        $query->orWhereNull('academic_year');
                    }
                })
                ->get();

            $totalPossible = $categoryItems->sum('score');
            if ($totalPossible == 0) {
                continue;
            }

            $studentScores = StudentEcrItemScore::where('student_id', $studentId)
                ->whereIn('subject_ecr_item_id', $categoryItems->pluck('id'))
                ->get();
            $totalStudentScore = $studentScores->sum('score');
            $rawPercent = ($totalStudentScore / $totalPossible) * 100;
            $weighted = ($rawPercent * $categoryPercentage) / 100;
            $totalGrade += $weighted;
        }

        $runningGrade = StudentRunningGrade::firstOrNew([
            'student_id' => $studentId,
            'subject_id' => $subjectId,
            'quarter' => $quarter,
            'academic_year' => $academicYear,
        ]);
        $runningGrade->grade = round($totalGrade, 2);
        $runningGrade->save();

        $this->parentSubjectGradeService->calculateParentSubjectGrades(
            $studentId,
            $subjectId,
            $quarter,
            $academicYear
        );
    }
}
