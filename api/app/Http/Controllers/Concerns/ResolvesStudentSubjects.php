<?php

namespace App\Http\Controllers\Concerns;

use App\Auth\StudentPortalUser;
use App\Models\Student;
use App\Models\StudentSection;
use App\Models\StudentSubject;
use App\Models\Subject;
use Illuminate\Http\Request;

/**
 * Shared student-portal helpers: resolve the logged-in student and the
 * subjects they may access. Used by student-facing controllers
 * (assessments, lessons) so the eligibility rules live in one place.
 */
trait ResolvesStudentSubjects
{
    /**
     * Resolve the current user's student record (for student portal).
     * Supports both User linked to Student (students.user_id) and
     * StudentPortalUser (student_auth login).
     */
    protected function resolveStudent(Request $request): ?Student
    {
        $user = $request->user();
        if (!$user) {
            return null;
        }
        if ($user instanceof StudentPortalUser) {
            return $user->student;
        }
        return Student::where('user_id', $user->id)->first();
    }

    /**
     * Resolve subjects a student can access:
     * - non-limited subjects from active class sections
     * - limited subjects only when explicitly assigned via student_subjects
     * - plus explicit active assignments as fallback for migrated/legacy data.
     *
     * @return array<int, string>
     */
    protected function eligibleSubjectIds(Student $student): array
    {
        $activeSectionIds = StudentSection::where('student_id', $student->id)
            ->where('is_active', true)
            ->pluck('section_id')
            ->toArray();

        $explicitAssignedSubjectIds = StudentSubject::where('student_id', $student->id)
            ->where('is_active', true)
            ->pluck('subject_id')
            ->toArray();

        if (empty($activeSectionIds)) {
            return array_values(array_unique($explicitAssignedSubjectIds));
        }

        $sectionSubjectIds = Subject::whereIn('class_section_id', $activeSectionIds)
            ->where(function ($query) use ($student) {
                $query
                    ->where(function ($q) {
                        $q->where('is_limited_student', false)
                            ->orWhereNull('is_limited_student');
                    })
                    ->orWhere(function ($q) use ($student) {
                        $q->where('is_limited_student', true)
                            ->whereHas('studentSubjects', function ($sq) use ($student) {
                                $sq->where('student_id', $student->id)
                                    ->where('is_active', true);
                            });
                    });
            })
            ->pluck('id')
            ->toArray();

        return array_values(array_unique(array_merge($sectionSubjectIds, $explicitAssignedSubjectIds)));
    }
}
