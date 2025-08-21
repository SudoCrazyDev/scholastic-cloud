<?php

namespace App\Services;

use App\Models\Subject;
use App\Models\StudentRunningGrade;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class ParentSubjectGradeService
{
    /**
     * Calculate and update parent subject grades based on child subjects
     * This method should be called whenever a child subject grade is updated
     */
    public function calculateParentSubjectGrades(string $studentId, string $subjectId, string $quarter, string $academicYear): void
    {
        try {
            Log::info("Starting parent subject grade calculation", [
                'student_id' => $studentId,
                'subject_id' => $subjectId,
                'quarter' => $quarter,
                'academic_year' => $academicYear
            ]);

            // Get the subject to check if it has a parent
            $subject = Subject::find($subjectId);
            if (!$subject) {
                Log::warning("Subject not found", ['subject_id' => $subjectId]);
                return;
            }

            Log::info("Subject found", [
                'subject_id' => $subjectId,
                'subject_title' => $subject->title,
                'subject_type' => $subject->subject_type,
                'parent_subject_id' => $subject->parent_subject_id
            ]);

            if (!$subject->parent_subject_id) {
                Log::info("Subject has no parent, no calculation needed", ['subject_id' => $subjectId]);
                return; // No parent subject to update
            }

            $parentSubjectId = $subject->parent_subject_id;
            Log::info("Parent subject found", ['parent_subject_id' => $parentSubjectId]);
            
            // Get all child subjects of the parent
            $childSubjects = Subject::where('parent_subject_id', $parentSubjectId)->get();
            
            Log::info("Child subjects found", [
                'parent_subject_id' => $parentSubjectId,
                'child_count' => $childSubjects->count(),
                'child_subjects' => $childSubjects->pluck('id', 'title')->toArray()
            ]);
            
            if ($childSubjects->isEmpty()) {
                Log::warning("No child subjects found for parent", ['parent_subject_id' => $parentSubjectId]);
                return; // No child subjects found
            }

            // Get all child subject IDs
            $childSubjectIds = $childSubjects->pluck('id');

            // Get all grades for child subjects for this student, quarter, and academic year
            $childGrades = StudentRunningGrade::where('student_id', $studentId)
                ->whereIn('subject_id', $childSubjectIds)
                ->where('quarter', $quarter)
                ->where('academic_year', $academicYear)
                ->whereNotNull('final_grade')
                ->get();

            Log::info("Child grades found", [
                'student_id' => $studentId,
                'quarter' => $quarter,
                'academic_year' => $academicYear,
                'child_grades_count' => $childGrades->count(),
                'child_grades' => $childGrades->map(function($grade) {
                    return [
                        'subject_id' => $grade->subject_id,
                        'final_grade' => $grade->final_grade
                    ];
                })->toArray()
            ]);

            // Only calculate if we have at least one child subject with a final grade
            if ($childGrades->isEmpty()) {
                Log::warning("No child grades found for calculation", [
                    'student_id' => $studentId,
                    'quarter' => $quarter,
                    'academic_year' => $academicYear
                ]);
                return;
            }

            // Calculate the average of child subject final grades
            $totalGrade = $childGrades->sum('final_grade');
            $averageGrade = $totalGrade / $childGrades->count();

            // Round to 2 decimal places
            $averageGrade = round($averageGrade, 2);

            Log::info("Calculated average grade", [
                'total_grade' => $totalGrade,
                'child_count' => $childGrades->count(),
                'average_grade' => $averageGrade
            ]);

            // Update or create the parent subject grade
            $parentGrade = StudentRunningGrade::firstOrNew([
                'student_id' => $studentId,
                'subject_id' => $parentSubjectId,
                'quarter' => $quarter,
                'academic_year' => $academicYear,
            ]);

            // Set both grade and final_grade to the calculated average
            $parentGrade->grade = $averageGrade;
            $parentGrade->final_grade = $averageGrade;
            $parentGrade->save();

            Log::info("Parent subject grade saved successfully", [
                'student_id' => $studentId,
                'parent_subject_id' => $parentSubjectId,
                'quarter' => $quarter,
                'academic_year' => $academicYear,
                'average_grade' => $averageGrade,
                'child_grades_count' => $childGrades->count(),
                'is_new_record' => $parentGrade->wasRecentlyCreated
            ]);

        } catch (\Exception $e) {
            Log::error("Error calculating parent subject grades", [
                'student_id' => $studentId,
                'subject_id' => $subjectId,
                'quarter' => $quarter,
                'academic_year' => $academicYear,
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString()
            ]);
        }
    }

    /**
     * Recalculate all parent subject grades for a specific student, quarter, and academic year
     * This is useful for bulk operations or when data needs to be recalculated
     */
    public function recalculateAllParentSubjectGrades(string $studentId, string $quarter, string $academicYear): void
    {
        try {
            // Get all subjects that have child subjects
            $parentSubjects = Subject::whereHas('childSubjects')->get();

            foreach ($parentSubjects as $parentSubject) {
                $this->calculateParentSubjectGrades($studentId, $parentSubject->id, $quarter, $academicYear);
            }

            Log::info("All parent subject grades recalculated", [
                'student_id' => $studentId,
                'quarter' => $quarter,
                'academic_year' => $academicYear
            ]);

        } catch (\Exception $e) {
            Log::error("Error recalculating all parent subject grades", [
                'student_id' => $studentId,
                'quarter' => $quarter,
                'academic_year' => $academicYear,
                'error' => $e->getMessage()
            ]);
        }
    }

    /**
     * Get the calculated grade for a parent subject
     * Returns null if no child subjects have grades yet
     */
    public function getParentSubjectGrade(string $studentId, string $parentSubjectId, string $quarter, string $academicYear): ?float
    {
        try {
            // Get all child subjects of the parent
            $childSubjects = Subject::where('parent_subject_id', $parentSubjectId)->get();
            
            if ($childSubjects->isEmpty()) {
                return null; // No child subjects found
            }

            // Get all child subject IDs
            $childSubjectIds = $childSubjects->pluck('id');

            // Get all grades for child subjects for this student, quarter, and academic year
            $childGrades = StudentRunningGrade::where('student_id', $studentId)
                ->whereIn('subject_id', $childSubjectIds)
                ->where('quarter', $quarter)
                ->where('academic_year', $academicYear)
                ->whereNotNull('final_grade')
                ->get();

            if ($childGrades->isEmpty()) {
                return null; // No child grades found
            }

            // Calculate the average of child subject final grades
            $totalGrade = $childGrades->sum('final_grade');
            $averageGrade = $totalGrade / $childGrades->count();

            return round($averageGrade, 2);

        } catch (\Exception $e) {
            Log::error("Error getting parent subject grade", [
                'student_id' => $studentId,
                'parent_subject_id' => $parentSubjectId,
                'quarter' => $quarter,
                'academic_year' => $academicYear,
                'error' => $e->getMessage()
            ]);
            return null;
        }
    }
}
