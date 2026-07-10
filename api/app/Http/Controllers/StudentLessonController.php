<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\ResolvesStudentSubjects;
use App\Models\StudentLessonProgress;
use App\Models\Subject;
use App\Models\SubjectEcrItem;
use App\Models\Topic;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * LMS-style: student lists/reads published lessons for their subjects and
 * tracks their own progress (started / completed).
 */
class StudentLessonController extends Controller
{
    use ResolvesStudentSubjects;

    /**
     * List published lessons for the current student's eligible subjects,
     * annotated with the student's progress.
     */
    public function index(Request $request): JsonResponse
    {
        $student = $this->resolveStudent($request);
        if (!$student) {
            return response()->json([
                'success' => false,
                'message' => 'Not linked to a student account. Link your user to a student to see lessons.',
            ], 403);
        }

        $subjectIds = $this->eligibleSubjectIds($student);
        if (empty($subjectIds)) {
            return response()->json(['success' => true, 'data' => [], 'subjects' => []]);
        }

        $subjectTitles = Subject::whereIn('id', $subjectIds)->pluck('title', 'id');

        // All eligible subjects (even those without published lessons yet) so the
        // portal can show every subject instead of silently omitting empty ones.
        $subjects = $subjectTitles
            ->map(fn ($title, $id) => ['id' => $id, 'title' => $title])
            ->values()
            ->sortBy('title')
            ->values();

        $topics = Topic::whereIn('subject_id', $subjectIds)
            ->where('is_published', true)
            ->orderBy('quarter')
            ->orderBy('order')
            ->get();

        $progress = StudentLessonProgress::where('student_id', $student->id)
            ->whereIn('topic_id', $topics->pluck('id'))
            ->get()
            ->keyBy('topic_id');

        $data = $topics->map(function (Topic $topic) use ($subjectTitles, $progress) {
            $blocks = is_array($topic->content) ? $topic->content : [];
            $p = $progress->get($topic->id);

            return [
                'id' => $topic->id,
                'title' => $topic->title,
                'description' => $topic->description,
                'quarter' => $topic->quarter,
                'subject_id' => $topic->subject_id,
                'subject_title' => $subjectTitles[$topic->subject_id] ?? '',
                'estimated_minutes' => $topic->estimated_minutes,
                'learning_objectives' => $topic->learning_objectives ?? [],
                'block_count' => count($blocks),
                'progress_status' => $p->status ?? 'not_started',
                'started_at' => $p?->started_at?->toIso8601String(),
                'completed_at' => $p?->completed_at?->toIso8601String(),
            ];
        });

        return response()->json(['success' => true, 'data' => $data->values(), 'subjects' => $subjects]);
    }

    /**
     * Get one published lesson's full content. Assessment blocks are enriched
     * with the linked assessment's current title/type so the reader can deep-link.
     */
    public function show(Request $request, string $id): JsonResponse
    {
        $student = $this->resolveStudent($request);
        if (!$student) {
            return response()->json(['success' => false, 'message' => 'Not linked to a student account.'], 403);
        }

        $topic = Topic::with('subject')->find($id);
        if (!$topic || !$topic->is_published) {
            return response()->json(['success' => false, 'message' => 'Lesson not found.'], 404);
        }

        $eligibleSubjectIds = $this->eligibleSubjectIds($student);
        if (!in_array($topic->subject_id, $eligibleSubjectIds, true)) {
            return response()->json(['success' => false, 'message' => 'Access denied.'], 403);
        }

        $blocks = is_array($topic->content) ? $this->enrichAssessmentBlocks($topic->content) : [];

        $p = StudentLessonProgress::where('student_id', $student->id)
            ->where('topic_id', $topic->id)
            ->first();

        return response()->json([
            'success' => true,
            'data' => [
                'id' => $topic->id,
                'title' => $topic->title,
                'description' => $topic->description,
                'quarter' => $topic->quarter,
                'subject_id' => $topic->subject_id,
                'subject_title' => $topic->subject?->title ?? '',
                'estimated_minutes' => $topic->estimated_minutes,
                'learning_objectives' => $topic->learning_objectives ?? [],
                'content' => $blocks,
                'progress_status' => $p->status ?? 'not_started',
                'started_at' => $p?->started_at?->toIso8601String(),
                'completed_at' => $p?->completed_at?->toIso8601String(),
            ],
        ]);
    }

    /**
     * Mark the lesson as started (idempotent; never downgrades a completed lesson).
     */
    public function start(Request $request, string $id): JsonResponse
    {
        return $this->upsertProgress($request, $id, 'in_progress');
    }

    /**
     * Mark the lesson as completed.
     */
    public function complete(Request $request, string $id): JsonResponse
    {
        return $this->upsertProgress($request, $id, 'completed');
    }

    private function upsertProgress(Request $request, string $id, string $target): JsonResponse
    {
        $student = $this->resolveStudent($request);
        if (!$student) {
            return response()->json(['success' => false, 'message' => 'Not linked to a student account.'], 403);
        }

        $topic = Topic::find($id);
        if (!$topic || !$topic->is_published) {
            return response()->json(['success' => false, 'message' => 'Lesson not found.'], 404);
        }

        $eligibleSubjectIds = $this->eligibleSubjectIds($student);
        if (!in_array($topic->subject_id, $eligibleSubjectIds, true)) {
            return response()->json(['success' => false, 'message' => 'Access denied.'], 403);
        }

        $progress = StudentLessonProgress::firstOrNew([
            'student_id' => $student->id,
            'topic_id' => $topic->id,
        ]);

        if ($target === 'completed') {
            $progress->status = 'completed';
            $progress->started_at = $progress->started_at ?? now();
            $progress->completed_at = $progress->completed_at ?? now();
        } else {
            // Starting: do not downgrade an already-completed lesson.
            if ($progress->status !== 'completed') {
                $progress->status = 'in_progress';
                $progress->started_at = $progress->started_at ?? now();
            }
        }

        $progress->save();

        return response()->json([
            'success' => true,
            'data' => [
                'progress_status' => $progress->status,
                'started_at' => $progress->started_at?->toIso8601String(),
                'completed_at' => $progress->completed_at?->toIso8601String(),
            ],
        ]);
    }

    /**
     * Attach current title/type/availability to each `assessment` content block.
     */
    private function enrichAssessmentBlocks(array $blocks): array
    {
        $assessmentIds = collect($blocks)
            ->where('type', 'assessment')
            ->pluck('subject_ecr_item_id')
            ->filter()
            ->unique()
            ->values();

        if ($assessmentIds->isEmpty()) {
            return $blocks;
        }

        $items = SubjectEcrItem::whereIn('id', $assessmentIds)->get()->keyBy('id');

        return collect($blocks)->map(function ($block) use ($items) {
            if (($block['type'] ?? null) !== 'assessment') {
                return $block;
            }
            $item = $items->get($block['subject_ecr_item_id'] ?? null);
            $block['assessment_available'] = $item !== null
                && in_array($item->type, ['quiz', 'activity', 'assignment', 'exam'], true)
                && ($item->status ?? 'published') === 'published';
            if ($item) {
                $block['title'] = $item->title;
                $block['assessmentType'] = $item->type;
            }
            return $block;
        })->all();
    }
}
