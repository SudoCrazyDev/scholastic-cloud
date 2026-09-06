<?php

namespace App\Http\Controllers;

use App\Models\SubjectEcrItem;
use App\Models\UserInstitution;
use App\Services\TeachingActivityReport;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Teaching Activity — what an institution administrator or principal sees of
 * their teachers' lesson and assessment output, and of how much of it students
 * have submitted.
 *
 * Read-only throughout: the module offers no `manage` ability, and every route
 * here is a GET. Anything that needs changing is changed on the screen that
 * owns it (My Assigned Subjects), by the person whose subject it is.
 *
 * Scoping is per controller, as everywhere else in this app: the reporting
 * institution is the signed-in user's default one, never a parameter, so a
 * principal cannot ask about a school they do not belong to.
 */
class TeachingActivityController extends Controller
{
    public function __construct(protected TeachingActivityReport $report) {}

    /**
     * One row per teacher for a school year, plus the school's own totals.
     */
    public function overview(Request $request): JsonResponse
    {
        $institutionId = $this->institutionId($request);
        if ($institutionId instanceof JsonResponse) {
            return $institutionId;
        }

        $filters = $request->validate([
            'academic_year' => 'nullable|string|max:20',
            'quarter' => 'nullable|string|max:10',
            'department_id' => 'nullable|uuid',
            'search' => 'nullable|string|max:100',
            'sort' => 'nullable|string|in:name,lessons,assessments,submission_rate,last_activity',
        ]);

        $data = $this->report->overview($institutionId, $filters);
        $data['available_academic_years'] = $this->report->academicYears($institutionId);

        return response()->json(['success' => true, 'data' => $data]);
    }

    /**
     * One teacher in full: their subjects, their lessons with the files
     * attached to each, and their assessments with per-assessment submissions.
     */
    public function teacher(Request $request, string $userId): JsonResponse
    {
        $institutionId = $this->institutionId($request);
        if ($institutionId instanceof JsonResponse) {
            return $institutionId;
        }

        $filters = $request->validate([
            'academic_year' => 'nullable|string|max:20',
            'quarter' => 'nullable|string|max:10',
        ]);

        // Reporting on somebody outside the school would be a cross-tenant
        // read even though every figure under it is scoped — the name and
        // email alone are the leak.
        $belongs = UserInstitution::where('institution_id', $institutionId)
            ->where('user_id', $userId)
            ->exists();

        $data = $belongs ? $this->report->forTeacher($institutionId, $userId, $filters) : null;

        if (! $data) {
            return response()->json([
                'success' => false,
                'message' => 'Teacher not found in your institution.',
            ], 404);
        }

        // The detail screen carries the same year selector as the overview, so
        // it needs the same options — a principal who lands here from a link
        // has no overview response to have taken them from.
        $data['available_academic_years'] = $this->report->academicYears($institutionId);

        return response()->json(['success' => true, 'data' => $data]);
    }

    /**
     * Who has and has not submitted one assessment — the roster, not just the
     * submissions, so the missing students are visible.
     */
    public function assessmentSubmissions(Request $request, string $itemId): JsonResponse
    {
        $institutionId = $this->institutionId($request);
        if ($institutionId instanceof JsonResponse) {
            return $institutionId;
        }

        $item = SubjectEcrItem::with(['subjectEcr.subject.classSection', 'questions'])->find($itemId);

        if (
            ! $item
            || ! in_array($item->type, TeachingActivityReport::ASSESSMENT_TYPES, true)
            || $item->subjectEcr?->subject?->institution_id !== $institutionId
        ) {
            return response()->json(['success' => false, 'message' => 'Assessment not found.'], 404);
        }

        return response()->json([
            'success' => true,
            'data' => $this->report->assessmentSubmissions($item),
        ]);
    }

    /**
     * The school this request reports on, or the 403 to send instead.
     */
    private function institutionId(Request $request): string|JsonResponse
    {
        $default = $request->user()->userInstitutions()
            ->where('is_default', true)
            ->first();

        if (! $default) {
            return response()->json([
                'success' => false,
                'message' => 'No default institution found for authenticated user',
            ], 403);
        }

        return $default->institution_id;
    }
}
