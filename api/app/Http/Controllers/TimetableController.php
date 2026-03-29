<?php

namespace App\Http\Controllers;

use App\Models\Subject;
use App\Models\ClassSection;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class TimetableController extends Controller
{
    /**
     * Return all subjects for a class section, grouped by day for timetable display.
     */
    public function getSectionTimetable(Request $request, string $sectionId): JsonResponse
    {
        $authenticatedUser = $request->user();

        $defaultInstitution = $authenticatedUser->userInstitutions()
            ->where('is_default', true)
            ->first();

        if (!$defaultInstitution) {
            return response()->json([
                'success' => false,
                'message' => 'No default institution found for authenticated user'
            ], 403);
        }

        $section = ClassSection::where('institution_id', $defaultInstitution->institution_id)
            ->find($sectionId);

        if (!$section) {
            return response()->json([
                'success' => false,
                'message' => 'Class section not found'
            ], 404);
        }

        $subjects = Subject::with(['adviserUser'])
            ->where('institution_id', $defaultInstitution->institution_id)
            ->where('class_section_id', $sectionId)
            ->orderBy('order', 'asc')
            ->get();

        return response()->json([
            'success' => true,
            'data' => [
                'section' => $section,
                'subjects' => $subjects,
            ]
        ]);
    }

    /**
     * Detect teacher scheduling conflicts across all sections in the institution.
     * Returns subjects where the same teacher is scheduled at overlapping times on the same day.
     */
    public function getConflicts(Request $request): JsonResponse
    {
        $authenticatedUser = $request->user();

        $defaultInstitution = $authenticatedUser->userInstitutions()
            ->where('is_default', true)
            ->first();

        if (!$defaultInstitution) {
            return response()->json([
                'success' => false,
                'message' => 'No default institution found for authenticated user'
            ], 403);
        }

        // Fetch all scheduled subjects (those with start_time, end_time, meeting_days, and an adviser)
        $subjects = Subject::with(['adviserUser', 'classSection'])
            ->where('institution_id', $defaultInstitution->institution_id)
            ->whereNotNull('adviser')
            ->whereNotNull('start_time')
            ->whereNotNull('end_time')
            ->whereNotNull('meeting_days')
            ->get();

        $conflicts = [];

        // Group by adviser
        $byTeacher = $subjects->groupBy('adviser');

        foreach ($byTeacher as $teacherId => $teacherSubjects) {
            $subjectList = $teacherSubjects->values();

            for ($i = 0; $i < $subjectList->count(); $i++) {
                for ($j = $i + 1; $j < $subjectList->count(); $j++) {
                    $a = $subjectList[$i];
                    $b = $subjectList[$j];

                    $sharedDays = array_intersect(
                        $a->meeting_days ?? [],
                        $b->meeting_days ?? []
                    );

                    if (empty($sharedDays)) {
                        continue;
                    }

                    // Check time overlap: a.start < b.end AND b.start < a.end
                    $aStart = strtotime($a->start_time);
                    $aEnd   = strtotime($a->end_time);
                    $bStart = strtotime($b->start_time);
                    $bEnd   = strtotime($b->end_time);

                    if ($aStart < $bEnd && $bStart < $aEnd) {
                        $conflicts[] = [
                            'teacher_id'   => $teacherId,
                            'teacher_name' => $a->adviserUser
                                ? trim($a->adviserUser->first_name . ' ' . $a->adviserUser->last_name)
                                : 'Unknown',
                            'shared_days'  => array_values($sharedDays),
                            'subject_a'    => [
                                'id'           => $a->id,
                                'title'        => $a->title,
                                'section'      => $a->classSection?->title,
                                'start_time'   => $a->start_time,
                                'end_time'     => $a->end_time,
                                'meeting_days' => $a->meeting_days,
                            ],
                            'subject_b'    => [
                                'id'           => $b->id,
                                'title'        => $b->title,
                                'section'      => $b->classSection?->title,
                                'start_time'   => $b->start_time,
                                'end_time'     => $b->end_time,
                                'meeting_days' => $b->meeting_days,
                            ],
                        ];
                    }
                }
            }
        }

        return response()->json([
            'success' => true,
            'data'    => $conflicts,
        ]);
    }

    /**
     * Return subjects grouped by teacher for a set of teacher IDs.
     * Used for the Teacher Timetable view.
     */
    public function getTeachersTimetable(Request $request): JsonResponse
    {
        $authenticatedUser = $request->user();

        $defaultInstitution = $authenticatedUser->userInstitutions()
            ->where('is_default', true)
            ->first();

        if (!$defaultInstitution) {
            return response()->json([
                'success' => false,
                'message' => 'No default institution found for authenticated user'
            ], 403);
        }

        $teacherIds = $request->input('ids', []);

        if (empty($teacherIds)) {
            return response()->json(['success' => true, 'data' => []]);
        }

        $query = Subject::with(['classSection'])
            ->where('institution_id', $defaultInstitution->institution_id)
            ->whereIn('adviser', $teacherIds)
            ->whereNotNull('start_time')
            ->whereNotNull('end_time')
            ->whereNotNull('meeting_days');

        if ($request->filled('academic_year')) {
            $query->whereHas('classSection', function ($q) use ($request) {
                $q->where('academic_year', $request->academic_year);
            });
        }

        $subjects = $query->get();

        $grouped = [];
        foreach ($teacherIds as $teacherId) {
            $grouped[$teacherId] = $subjects
                ->where('adviser', $teacherId)
                ->values()
                ->map(fn($s) => [
                    'id'          => $s->id,
                    'title'       => $s->title,
                    'section'     => $s->classSection?->title,
                    'grade_level' => $s->classSection?->grade_level,
                    'start_time'  => $s->start_time,
                    'end_time'    => $s->end_time,
                    'meeting_days'=> $s->meeting_days,
                ]);
        }

        return response()->json([
            'success' => true,
            'data'    => $grouped,
        ]);
    }

    /**
     * Update the schedule (start_time, end_time, meeting_days) for a single subject.
     */
    public function updateSubjectSchedule(Request $request, string $subjectId): JsonResponse
    {
        $authenticatedUser = $request->user();

        $defaultInstitution = $authenticatedUser->userInstitutions()
            ->where('is_default', true)
            ->first();

        if (!$defaultInstitution) {
            return response()->json([
                'success' => false,
                'message' => 'No default institution found for authenticated user'
            ], 403);
        }

        $subject = Subject::where('institution_id', $defaultInstitution->institution_id)
            ->find($subjectId);

        if (!$subject) {
            return response()->json([
                'success' => false,
                'message' => 'Subject not found'
            ], 404);
        }

        $validated = $request->validate([
            'start_time'    => 'nullable|date_format:H:i',
            'end_time'      => 'nullable|date_format:H:i',
            'meeting_days'  => 'nullable|array',
            'meeting_days.*'=> 'string|in:monday,tuesday,wednesday,thursday,friday,saturday,sunday',
        ]);

        $subject->update($validated);

        return response()->json([
            'success' => true,
            'message' => 'Schedule updated successfully',
            'data'    => $subject->load('adviserUser'),
        ]);
    }
}
