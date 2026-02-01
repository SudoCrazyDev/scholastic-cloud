<?php

namespace App\Services;

use App\Models\SubjectEcr;
use App\Models\SubjectEcrItem;
use App\Models\StudentEcrItemScore;
use App\Models\StudentRunningGrade;

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
        $academicYear = $ecrItem->academic_year ?? '2025-2026';

        $subjectEcrs = SubjectEcr::where('subject_id', $subjectId)->get();
        $totalGrade = 0;

        foreach ($subjectEcrs as $categoryEcr) {
            $categoryPercentage = (float) $categoryEcr->percentage;
            $categoryItems = SubjectEcrItem::where('subject_ecr_id', $categoryEcr->id)
                ->where('quarter', $quarter)
                ->where('academic_year', $academicYear)
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
