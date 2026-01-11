<?php

namespace App\Http\Controllers;

use App\Models\LessonPlan;
use App\Models\Subject;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class LessonPlanController extends Controller
{
    /**
     * List lesson plans by subject (+ optional quarter).
     */
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'subject_id' => ['required', 'uuid', 'exists:subjects,id'],
            'quarter' => ['nullable', 'string', Rule::in(['1', '2', '3', '4'])],
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

        $query = LessonPlan::with(['topic'])
            ->where('subject_id', $validated['subject_id']);

        if (!empty($validated['quarter'])) {
            $query->where('quarter', $validated['quarter']);
        }

        $plans = $query->orderBy('lesson_date')->get();

        return response()->json(['success' => true, 'data' => $plans]);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        $defaultInstitution = $user->userInstitutions()->where('is_default', true)->first();
        if (!$defaultInstitution) {
            return response()->json(['success' => false, 'message' => 'No default institution found'], 403);
        }

        $plan = LessonPlan::with(['subject', 'topic'])->find($id);
        if (!$plan) {
            return response()->json(['success' => false, 'message' => 'Not found'], 404);
        }

        $subject = Subject::where('id', $plan->subject_id)
            ->where('institution_id', $defaultInstitution->institution_id)
            ->first();
        if (!$subject) {
            return response()->json(['success' => false, 'message' => 'Access denied'], 404);
        }

        return response()->json(['success' => true, 'data' => $plan]);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $validated = $request->validate([
            'title' => ['nullable', 'string', 'max:255'],
            'content' => ['nullable', 'array'],
            'topic_id' => ['nullable', 'uuid', 'exists:topics,id'],
        ]);

        $user = $request->user();
        $defaultInstitution = $user->userInstitutions()->where('is_default', true)->first();
        if (!$defaultInstitution) {
            return response()->json(['success' => false, 'message' => 'No default institution found'], 403);
        }

        $plan = LessonPlan::find($id);
        if (!$plan) {
            return response()->json(['success' => false, 'message' => 'Not found'], 404);
        }

        $subject = Subject::where('id', $plan->subject_id)
            ->where('institution_id', $defaultInstitution->institution_id)
            ->first();
        if (!$subject) {
            return response()->json(['success' => false, 'message' => 'Access denied'], 404);
        }

        $plan->update([
            'title' => $validated['title'] ?? $plan->title,
            'content' => array_key_exists('content', $validated) ? $validated['content'] : $plan->content,
            'topic_id' => array_key_exists('topic_id', $validated) ? $validated['topic_id'] : $plan->topic_id,
            'generated_by' => 'manual',
            'generated_by_user_id' => $user?->id,
        ]);

        return response()->json(['success' => true, 'data' => $plan->fresh(['topic'])]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        $defaultInstitution = $user->userInstitutions()->where('is_default', true)->first();
        if (!$defaultInstitution) {
            return response()->json(['success' => false, 'message' => 'No default institution found'], 403);
        }

        $plan = LessonPlan::find($id);
        if (!$plan) {
            return response()->json(['success' => false, 'message' => 'Not found'], 404);
        }

        $subject = Subject::where('id', $plan->subject_id)
            ->where('institution_id', $defaultInstitution->institution_id)
            ->first();
        if (!$subject) {
            return response()->json(['success' => false, 'message' => 'Access denied'], 404);
        }

        $plan->delete();
        return response()->json(['success' => true, 'message' => 'Deleted']);
    }
}

