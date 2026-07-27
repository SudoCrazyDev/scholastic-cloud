<?php

namespace App\Http\Controllers;

use App\Models\Subject;
use App\Models\Topic;
use App\Support\MediaUrl;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;

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
                ->get()
                ->each(fn (Topic $topic) => $this->refreshContentUrls($topic));

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
            if (! isset($request->order)) {
                $maxOrder = Topic::where('subject_id', $request->subject_id)->max('order') ?? 0;
                $request->merge(['order' => $maxOrder + 1]);
            }

            $topic = Topic::create($request->all());

            return response()->json([
                'success' => true,
                'data' => $this->refreshContentUrls($topic),
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
                'data' => $this->refreshContentUrls($topic),
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
            $previousFiles = Topic::filePathsIn($topic->content);

            $topic->update($request->all());

            // A file block that is gone from the saved content — removed, or
            // replaced by a fresh upload — leaves its object behind in R2.
            // Drop those so storage tracks what the lesson actually shows.
            if ($request->has('content')) {
                $this->deleteOrphanedFiles($previousFiles, Topic::filePathsIn($topic->content));
            }

            return response()->json([
                'success' => true,
                'data' => $this->refreshContentUrls($topic),
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
            $files = Topic::filePathsIn($topic->content);
            $topic->delete();
            $this->deleteOrphanedFiles($files, []);

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
                ->get()
                ->each(fn (Topic $topic) => $this->refreshContentUrls($topic));

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
            $topic->update(['is_completed' => ! $topic->is_completed]);

            return response()->json([
                'success' => true,
                'data' => $this->refreshContentUrls($topic),
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
            // 100 MB ceiling so short lesson videos/audio fit alongside docs & images.
            // NOTE: PHP's upload_max_filesize / post_max_size must be >= this for
            // large uploads to actually reach the app.
            'file' => 'required|file|max:102400|mimes:pdf,png,jpg,jpeg,gif,webp,doc,docx,ppt,pptx,xls,xlsx,txt,mp4,webm,mov,m4v,mp3,wav,m4a',
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
            $fileName = Str::uuid().'.'.$extension;
            $path = $institutionId.'/subjects/'.$topic->subject_id.'/lessons/'.$topic->id.'/'.$fileName;

            Storage::disk('r2')->put($path, file_get_contents($file->getRealPath()));

            return response()->json([
                'success' => true,
                'data' => [
                    'path' => $path,
                    'url' => Topic::freshFileUrl($path),
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
     * Duplicate this lesson into one or more other subjects — typically the same
     * lesson across every section a teacher handles.
     *
     * Attached files are copied to their own object in the target lesson's
     * folder, so deleting either lesson can never break the other. Blocks that
     * link an assessment are dropped: those ids belong to the source subject
     * and have no meaning in the target.
     */
    public function copyToSubjects(Request $request, string $id): JsonResponse
    {
        $defaultInstitution = $request->user()->userInstitutions()
            ->where('is_default', true)
            ->first();

        if (! $defaultInstitution) {
            return response()->json([
                'success' => false,
                'message' => 'No default institution found for authenticated user',
            ], 403);
        }

        $validated = Validator::make($request->all(), [
            'target_subject_ids' => 'required|array|min:1',
            'target_subject_ids.*' => 'uuid|exists:subjects,id',
        ])->validate();

        $source = Topic::with('subject')->find($id);
        if (! $source || $source->subject?->institution_id !== $defaultInstitution->institution_id) {
            return response()->json([
                'success' => false,
                'message' => 'Lesson not found or access denied',
            ], 404);
        }

        $copied = 0;
        $skipped = [];
        $droppedAssessmentBlocks = 0;

        foreach (array_unique($validated['target_subject_ids']) as $targetSubjectId) {
            $target = Subject::where('id', $targetSubjectId)
                ->where('institution_id', $defaultInstitution->institution_id)
                ->first();

            if (! $target) {
                $skipped[] = [
                    'subject_id' => $targetSubjectId,
                    'subject_title' => '',
                    'reason' => 'Subject not found in your institution.',
                ];

                continue;
            }

            if ($target->id === $source->subject_id) {
                $skipped[] = [
                    'subject_id' => $target->id,
                    'subject_title' => $target->title,
                    'reason' => 'This is the subject the lesson already belongs to.',
                ];

                continue;
            }

            $copy = $source->replicate(['created_at', 'updated_at']);
            $copy->subject_id = $target->id;
            $copy->is_completed = false;
            // Copies start hidden so the teacher can adjust before students see them.
            $copy->is_published = false;
            $copy->order = (int) (Topic::where('subject_id', $target->id)->max('order') ?? -1) + 1;
            [$content, $dropped] = $this->duplicateContentFor($source->content);
            $droppedAssessmentBlocks += $dropped;
            $copy->content = $content;
            $copy->save();

            $copied++;
        }

        return response()->json([
            'success' => true,
            'data' => [
                'copied' => $copied,
                'skipped' => $skipped,
                'dropped_assessment_blocks' => $droppedAssessmentBlocks,
            ],
            'message' => $copied === 1
                ? 'Lesson copied to 1 subject as a draft.'
                : "Lesson copied to {$copied} subjects as drafts.",
        ]);
    }

    /**
     * Rebuild a lesson's content blocks for a copy.
     *
     * Attachments are shared with the original rather than duplicated in the
     * bucket — a lesson can carry a 100 MB video, and copying it to five
     * sections would store it six times for no benefit. Uploads are immutable,
     * so a copy only diverges when someone actually replaces a file, and that
     * replacement writes its own object. deleteOrphanedFiles() is what keeps
     * the shared object alive until the last lesson using it lets go.
     *
     * Assessment links are dropped: those ids belong to the source subject.
     *
     * @return array{0: array<int, array<string, mixed>>, 1: int}
     */
    private function duplicateContentFor(mixed $blocks): array
    {
        $dropped = 0;
        $result = [];

        foreach (is_array($blocks) ? $blocks : [] as $block) {
            if (($block['type'] ?? null) === 'assessment') {
                $dropped++;

                continue;
            }

            $result[] = $block;
        }

        return [$result, $dropped];
    }

    /**
     * Rebuild file-block URLs from their stored `path` before returning content
     * to the client, so old rows holding expired presigned links still resolve.
     */
    private function refreshContentUrls(Topic $topic): Topic
    {
        if (is_array($topic->content)) {
            $topic->setAttribute('content', $topic->contentWithFreshUrls());
        }

        return $topic;
    }

    /**
     * Delete R2 objects that the lesson no longer references. A path still used
     * by another lesson (e.g. one created by "copy to another subject") is kept.
     *
     * @param  array<int, string>  $before
     * @param  array<int, string>  $after
     */
    private function deleteOrphanedFiles(array $before, array $after): void
    {
        foreach (array_diff($before, $after) as $path) {
            // Match on the file name, not the full key: the JSON cast escapes
            // slashes, so the raw key never appears verbatim in the column.
            // Names are UUIDs, so this is unambiguous.
            if (Topic::where('content', 'like', '%'.basename($path).'%')->exists()) {
                continue;
            }
            MediaUrl::deleteByPath($path);
        }
    }
}
