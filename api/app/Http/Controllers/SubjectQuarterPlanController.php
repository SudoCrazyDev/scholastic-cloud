<?php

namespace App\Http\Controllers;

use App\Models\Subject;
use App\Models\SubjectQuarterPlan;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class SubjectQuarterPlanController extends Controller
{
    /**
     * Get a quarter plan by subject + quarter.
     */
    public function showBySubjectAndQuarter(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'subject_id' => ['required', 'uuid', 'exists:subjects,id'],
            'quarter' => ['required', 'string', Rule::in(['1', '2', '3', '4'])],
        ]);

        $user = $request->user();
        $defaultInstitution = $user->userInstitutions()->where('is_default', true)->first();
        if (!$defaultInstitution) {
            return response()->json(['success' => false, 'message' => 'No default institution found'], 403);
        }

        $subject = Subject::where('id', $validated['subject_id'])
            ->where('institution_id', $defaultInstitution->institution_id)
            ->first();
        if (!$subject) {
            return response()->json(['success' => false, 'message' => 'Subject not found or access denied'], 404);
        }

        $plan = SubjectQuarterPlan::where('subject_id', $validated['subject_id'])
            ->where('quarter', $validated['quarter'])
            ->first();

        return response()->json(['success' => true, 'data' => $plan]);
    }

    /**
     * Upsert a quarter plan by subject + quarter.
     */
    public function upsertBySubjectAndQuarter(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'subject_id' => ['required', 'uuid', 'exists:subjects,id'],
            'quarter' => ['required', 'string', Rule::in(['1', '2', '3', '4'])],
            'start_date' => ['required', 'date_format:Y-m-d'],
            'exam_date' => ['required', 'date_format:Y-m-d', 'after_or_equal:start_date'],
            'meeting_days' => ['nullable', 'array'],
            'meeting_days.*' => ['string', Rule::in(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'])],
            'excluded_dates' => ['nullable', 'array'],
            'excluded_dates.*' => ['date_format:Y-m-d'],
            'quizzes_count' => ['nullable', 'integer', 'min:0'],
            'assignments_count' => ['nullable', 'integer', 'min:0'],
            'activities_count' => ['nullable', 'integer', 'min:0'],
            'projects_count' => ['nullable', 'integer', 'min:0'],
        ]);

        $user = $request->user();
        $defaultInstitution = $user->userInstitutions()->where('is_default', true)->first();
        if (!$defaultInstitution) {
            return response()->json(['success' => false, 'message' => 'No default institution found'], 403);
        }

        $subject = Subject::where('id', $validated['subject_id'])
            ->where('institution_id', $defaultInstitution->institution_id)
            ->first();
        if (!$subject) {
            return response()->json(['success' => false, 'message' => 'Subject not found or access denied'], 404);
        }

        $plan = SubjectQuarterPlan::updateOrCreate(
            [
                'subject_id' => $validated['subject_id'],
                'quarter' => $validated['quarter'],
            ],
            [
                'start_date' => $validated['start_date'],
                'exam_date' => $validated['exam_date'],
                'meeting_days' => $validated['meeting_days'] ?? null,
                'excluded_dates' => $validated['excluded_dates'] ?? null,
                'quizzes_count' => $validated['quizzes_count'] ?? 0,
                'assignments_count' => $validated['assignments_count'] ?? 0,
                'activities_count' => $validated['activities_count'] ?? 0,
                'projects_count' => $validated['projects_count'] ?? 0,
                'updated_by' => $user?->id,
                'created_by' => $user?->id,
            ]
        );

        return response()->json([
            'success' => true,
            'message' => 'Quarter plan saved successfully',
            'data' => $plan,
        ]);
    }
}

