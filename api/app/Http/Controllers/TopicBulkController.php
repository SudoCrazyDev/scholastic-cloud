<?php

namespace App\Http\Controllers;

use App\Models\Subject;
use App\Models\Topic;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

class TopicBulkController extends Controller
{
    /**
     * Bulk create topics for a subject (optionally for a quarter).
     */
    public function store(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'subject_id' => ['required', 'uuid', 'exists:subjects,id'],
            'quarter' => ['nullable', 'string', Rule::in(['1', '2', '3', '4'])],
            'topics' => ['required', 'array', 'min:1', 'max:100'],
            'topics.*.title' => ['required', 'string', 'max:255'],
            'topics.*.description' => ['nullable', 'string'],
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        $validated = $validator->validated();

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

        DB::beginTransaction();
        try {
            $maxOrder = Topic::where('subject_id', $validated['subject_id'])->max('order') ?? 0;

            $created = [];
            foreach ($validated['topics'] as $i => $topicInput) {
                $created[] = Topic::create([
                    'subject_id' => $validated['subject_id'],
                    'quarter' => $validated['quarter'] ?? ($topicInput['quarter'] ?? null),
                    'title' => $topicInput['title'],
                    'description' => $topicInput['description'] ?? null,
                    'order' => $maxOrder + $i + 1,
                    'is_completed' => false,
                ]);
            }

            DB::commit();
            return response()->json([
                'success' => true,
                'data' => $created,
                'message' => 'Topics created successfully',
            ], 201);
        } catch (\Throwable $e) {
            DB::rollBack();
            return response()->json([
                'success' => false,
                'message' => 'Failed to create topics',
                'error' => $e->getMessage(),
            ], 500);
        }
    }
}

