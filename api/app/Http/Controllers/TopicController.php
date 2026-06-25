<?php

namespace App\Http\Controllers;

use App\Models\Topic;
use App\Models\Subject;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class TopicController extends Controller
{
    /**
     * Display a listing of topics for a subject.
     */
    public function index(Request $request): JsonResponse
    {
        Log::info('Topic index request:', $request->all());
        
        $validator = Validator::make($request->all(), [
            'subject_id' => 'required|exists:subjects,id',
        ]);

        if ($validator->fails()) {
            Log::error('Topic index validation failed:', $validator->errors()->toArray());
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        try {
            $topics = Topic::where('subject_id', $request->subject_id)
                ->orderBy('order')
                ->get();

            Log::info('Topics retrieved:', ['count' => $topics->count(), 'subject_id' => $request->subject_id]);

            return response()->json([
                'success' => true,
                'data' => $topics,
                'message' => 'Topics retrieved successfully',
            ]);
        } catch (\Exception $e) {
            Log::error('Topic index error:', ['error' => $e->getMessage()]);
            return response()->json([
                'success' => false,
                'message' => 'Failed to retrieve topics',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Store a newly created topic.
     */
    public function store(Request $request): JsonResponse
    {
        Log::info('Topic store request:', $request->all());
        
        $validator = Validator::make($request->all(), [
            'subject_id' => 'required|exists:subjects,id',
            'quarter' => 'nullable|string',
            'title' => 'required|string|max:255',
            'description' => 'nullable|string',
            'content' => 'nullable|array',
            'learning_objectives' => 'nullable|array',
            'learning_objectives.*' => 'string',
            'estimated_minutes' => 'nullable|integer|min:0',
            'order' => 'nullable|integer|min:0',
            'is_completed' => 'boolean',
            'is_published' => 'boolean',
        ]);

        if ($validator->fails()) {
            Log::error('Topic validation failed:', $validator->errors()->toArray());
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        try {
            // If order is not provided, get the next order number
            if (!isset($request->order)) {
                $maxOrder = Topic::where('subject_id', $request->subject_id)->max('order') ?? 0;
                $request->merge(['order' => $maxOrder + 1]);
            }

            $topic = Topic::create($request->all());

            return response()->json([
                'success' => true,
                'data' => $topic,
                'message' => 'Topic created successfully',
            ], 201);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to create topic',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Display the specified topic.
     */
    public function show(string $id): JsonResponse
    {
        try {
            $topic = Topic::with('subject')->findOrFail($id);

            return response()->json([
                'success' => true,
                'data' => $topic,
                'message' => 'Topic retrieved successfully',
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Topic not found',
                'error' => $e->getMessage(),
            ], 404);
        }
    }

    /**
     * Update the specified topic.
     */
    public function update(Request $request, string $id): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'title' => 'sometimes|required|string|max:255',
            'description' => 'nullable|string',
            'content' => 'nullable|array',
            'learning_objectives' => 'nullable|array',
            'learning_objectives.*' => 'string',
            'estimated_minutes' => 'nullable|integer|min:0',
            'order' => 'sometimes|required|integer|min:0',
            'is_completed' => 'boolean',
            'is_published' => 'boolean',
            'quarter' => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        try {
            $topic = Topic::findOrFail($id);
            $topic->update($request->all());

            return response()->json([
                'success' => true,
                'data' => $topic,
                'message' => 'Topic updated successfully',
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to update topic',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Remove the specified topic.
     */
    public function destroy(string $id): JsonResponse
    {
        try {
            $topic = Topic::findOrFail($id);
            $topic->delete();

            return response()->json([
                'success' => true,
                'message' => 'Topic deleted successfully',
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to delete topic',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Reorder topics for a subject.
     */
    public function reorder(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'subject_id' => 'required|exists:subjects,id',
            'topic_orders' => 'required|array',
            'topic_orders.*.id' => 'required|exists:topics,id',
            'topic_orders.*.order' => 'required|integer|min:0',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        try {
            foreach ($request->topic_orders as $topicOrder) {
                Topic::where('id', $topicOrder['id'])
                    ->where('subject_id', $request->subject_id)
                    ->update(['order' => $topicOrder['order']]);
            }

            $topics = Topic::where('subject_id', $request->subject_id)
                ->orderBy('order')
                ->get();

            return response()->json([
                'success' => true,
                'data' => $topics,
                'message' => 'Topics reordered successfully',
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to reorder topics',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Toggle completion status of a topic.
     */
    public function toggleCompletion(string $id): JsonResponse
    {
        try {
            $topic = Topic::findOrFail($id);
            $topic->update(['is_completed' => !$topic->is_completed]);

            return response()->json([
                'success' => true,
                'data' => $topic,
                'message' => 'Topic completion status updated successfully',
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to update topic completion status',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Upload a lesson attachment (PDF / slides / image / doc) to R2.
     * Returns a file reference the client stores inside a `file` content block.
     */
    public function uploadAttachment(Request $request, string $id): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            // 25 MB ceiling. mimes kept broad enough for typical lesson resources.
            'file' => 'required|file|max:25600|mimes:pdf,png,jpg,jpeg,gif,webp,doc,docx,ppt,pptx,xls,xlsx,txt',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        try {
            $topic = Topic::with('subject')->findOrFail($id);
            $institutionId = $topic->subject?->institution_id ?? 'unknown';

            $file = $request->file('file');
            $extension = $file->getClientOriginalExtension() ?: 'bin';
            $fileName = Str::uuid() . '.' . $extension;
            $path = $institutionId . '/subjects/' . $topic->subject_id . '/lessons/' . $topic->id . '/' . $fileName;

            Storage::disk('r2')->put($path, file_get_contents($file->getRealPath()));

            return response()->json([
                'success' => true,
                'data' => [
                    'path' => $path,
                    'url' => $this->temporaryFileUrl($path),
                    'name' => $file->getClientOriginalName(),
                    'mime' => $file->getMimeType() ?? $file->getClientMimeType(),
                    'size' => $file->getSize(),
                ],
            ], 201);
        } catch (\Exception $e) {
            Log::error('Topic attachment upload error:', ['error' => $e->getMessage()]);
            return response()->json([
                'success' => false,
                'message' => 'Failed to upload attachment',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Best-effort viewable URL for an R2 object: presigned if supported, else public URL.
     */
    private function temporaryFileUrl(string $path): ?string
    {
        try {
            return Storage::disk('r2')->temporaryUrl($path, now()->addDays(7));
        } catch (\Throwable) {
            try {
                return Storage::disk('r2')->url($path);
            } catch (\Throwable) {
                return null;
            }
        }
    }
}
