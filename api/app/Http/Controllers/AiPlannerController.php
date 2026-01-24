<?php

namespace App\Http\Controllers;

use App\Jobs\GenerateLessonPlansJob;
use App\Models\AiGenerationTask;
use App\Models\LessonPlan;
use App\Models\Subject;
use App\Models\SubjectEcr;
use App\Models\SubjectEcrItem;
use App\Models\SubjectQuarterPlan;
use App\Models\Topic;
use App\Services\Ai\AiManager;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

class AiPlannerController extends Controller
{
    /**
     * Generate topic suggestions (no persistence).
     */
    public function generateTopics(Request $request, string $subjectId, string $quarter): JsonResponse
    {
        $validated = $request->validate([
            'count' => ['nullable', 'integer', 'min:1', 'max:50'],
        ]);

        $quarterValidated = validator(['quarter' => $quarter], [
            'quarter' => ['required', 'string', Rule::in(['1', '2', '3', '4'])],
        ])->validate();

        $user = $request->user();
        $defaultInstitution = $user->userInstitutions()->where('is_default', true)->first();
        if (!$defaultInstitution) {
            return response()->json(['success' => false, 'message' => 'No default institution found'], 403);
        }

        $subject = Subject::with(['classSection'])
            ->where('id', $subjectId)
            ->where('institution_id', $defaultInstitution->institution_id)
            ->first();
        if (!$subject) {
            return response()->json(['success' => false, 'message' => 'Subject not found or access denied'], 404);
        }

        $count = $validated['count'] ?? 10;
        $subjectTitle = trim(($subject->title ?? '') . ' ' . ($subject->variant ?? ''));
        $subjectTitle = trim($subjectTitle) ?: 'the subject';
        $gradeLevel = $subject->classSection?->grade_level ?? null;

        $ai = AiManager::make();
        $raw = $ai->generateTopics([
            'subject_title' => $subjectTitle,
            'quarter' => $quarterValidated['quarter'],
            'count' => $count,
            'grade_level' => $gradeLevel,
        ]);

        $topics = $raw['topics'] ?? [];
        $topicsValidator = Validator::make(['topics' => $topics], [
            'topics' => ['required', 'array', 'min:1'],
            'topics.*.title' => ['required', 'string', 'max:255'],
            'topics.*.description' => ['nullable', 'string'],
            'topics.*.quarter' => ['required', 'string', Rule::in([$quarterValidated['quarter']])],
        ]);

        $suggestions = $topicsValidator->fails() ? [] : $topics;
        if (count($suggestions) !== $count) {
            // If the provider returned an invalid count, keep it safe and predictable.
            $suggestions = array_slice($suggestions, 0, $count);
        }

        return response()->json([
            'success' => true,
            'data' => [
                'subject_id' => $subjectId,
                'quarter' => $quarterValidated['quarter'],
                'topics' => $suggestions,
            ],
        ]);
    }

    /**
     * Generate and persist lesson plans for a subject + quarter (background job).
     * Returns immediately with a task_id for polling progress.
     */
    public function generateLessonPlans(Request $request, string $subjectId, string $quarter): JsonResponse
    {
        $validated = $request->validate([
            'overwrite' => ['nullable', 'boolean'],
        ]);

        $quarterValidated = validator(['quarter' => $quarter], [
            'quarter' => ['required', 'string', Rule::in(['1', '2', '3', '4'])],
        ])->validate();

        $user = $request->user();
        $defaultInstitution = $user->userInstitutions()->where('is_default', true)->first();
        if (!$defaultInstitution) {
            return response()->json(['success' => false, 'message' => 'No default institution found'], 403);
        }

        $subject = Subject::where('id', $subjectId)
            ->where('institution_id', $defaultInstitution->institution_id)
            ->first();
        if (!$subject) {
            return response()->json(['success' => false, 'message' => 'Subject not found or access denied'], 404);
        }

        $plan = SubjectQuarterPlan::where('subject_id', $subjectId)
            ->where('quarter', $quarterValidated['quarter'])
            ->first();
        if (!$plan) {
            return response()->json(['success' => false, 'message' => 'Quarter plan not found. Save schedule first.'], 422);
        }

        $meetingDays = $plan->meeting_days ?? [];
        if (empty($meetingDays)) {
            return response()->json(['success' => false, 'message' => 'Meeting days are required to generate daily lesson plans.'], 422);
        }

        $topics = Topic::where('subject_id', $subjectId)
            ->where('quarter', $quarterValidated['quarter'])
            ->orderBy('order')
            ->get();

        if ($topics->count() === 0) {
            return response()->json(['success' => false, 'message' => 'No topics found for this quarter. Add or generate topics first.'], 422);
        }

        // Create a task record for background processing
        $task = AiGenerationTask::create([
            'type' => 'lesson_plans',
            'subject_id' => $subjectId,
            'quarter' => $quarterValidated['quarter'],
            'user_id' => $user->id,
            'status' => 'pending',
        ]);

        // Dispatch the job to background queue
        GenerateLessonPlansJob::dispatch(
            $task->id,
            $subjectId,
            $quarterValidated['quarter'],
            !empty($validated['overwrite']),
            $user->id
        );

        return response()->json([
            'success' => true,
            'task_id' => $task->id,
            'message' => 'Lesson plan generation started in background. Use the task_id to check progress.',
        ]);
    }

    /**
     * Check the status of an AI generation task.
     */
    public function checkGenerationStatus(Request $request, string $taskId): JsonResponse
    {
        $task = AiGenerationTask::find($taskId);
        if (!$task) {
            return response()->json(['success' => false, 'message' => 'Task not found'], 404);
        }

        // Only allow users to check their own tasks
        if ($task->user_id !== $request->user()->id) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        $response = [
            'success' => true,
            'task' => [
                'id' => $task->id,
                'type' => $task->type,
                'status' => $task->status,
                'total_items' => $task->total_items,
                'processed_items' => $task->processed_items,
                'progress_percentage' => $task->total_items > 0 
                    ? round(($task->processed_items / $task->total_items) * 100) 
                    : 0,
                'result' => $task->result,
                'error_message' => $task->error_message,
                'created_at' => $task->created_at,
                'updated_at' => $task->updated_at,
            ],
        ];

        return response()->json($response);
    }

    /**
     * Generate and persist assessment items (quizzes/assignments/activities/projects) based on counts.
     * Items are stored as SubjectEcrItems so they plug into the existing grading flow.
     */
    public function generateAssessments(Request $request, string $subjectId, string $quarter): JsonResponse
    {
        $validated = $request->validate([
            // If omitted, we'll use the first available subject_ecr component for the subject.
            'subject_ecr_id' => ['nullable', 'uuid', 'exists:subjects_ecr,id'],
            'overwrite' => ['nullable', 'boolean'],
        ]);

        $quarterValidated = validator(['quarter' => $quarter], [
            'quarter' => ['required', 'string', Rule::in(['1', '2', '3', '4'])],
        ])->validate();

        $user = $request->user();
        $defaultInstitution = $user->userInstitutions()->where('is_default', true)->first();
        if (!$defaultInstitution) {
            return response()->json(['success' => false, 'message' => 'No default institution found'], 403);
        }

        $subject = Subject::with(['classSection'])
            ->where('id', $subjectId)
            ->where('institution_id', $defaultInstitution->institution_id)
            ->first();
        if (!$subject) {
            return response()->json(['success' => false, 'message' => 'Subject not found or access denied'], 404);
        }

        $plan = SubjectQuarterPlan::where('subject_id', $subjectId)
            ->where('quarter', $quarterValidated['quarter'])
            ->first();
        if (!$plan) {
            return response()->json(['success' => false, 'message' => 'Quarter plan not found. Save schedule first.'], 422);
        }

        // Compute lesson dates (meeting days excluding exam day and excluded dates).
        $meetingDays = $plan->meeting_days ?? [];
        $excluded = collect($plan->excluded_dates ?? [])->map(fn ($d) => (string)$d)->flip();

        $weekdayMap = [
            'monday' => Carbon::MONDAY,
            'tuesday' => Carbon::TUESDAY,
            'wednesday' => Carbon::WEDNESDAY,
            'thursday' => Carbon::THURSDAY,
            'friday' => Carbon::FRIDAY,
            'saturday' => Carbon::SATURDAY,
            'sunday' => Carbon::SUNDAY,
        ];
        $meetingDow = collect($meetingDays)
            ->map(fn ($d) => $weekdayMap[strtolower($d)] ?? null)
            ->filter()
            ->unique()
            ->values();

        $start = Carbon::parse($plan->start_date)->startOfDay();
        $exam = Carbon::parse($plan->exam_date)->startOfDay();
        $examDateStr = $exam->toDateString();

        $lessonDates = [];
        if ($meetingDow->isNotEmpty()) {
            $cursor = $start->copy();
            while ($cursor->lessThanOrEqualTo($exam)) {
                $dateStr = $cursor->toDateString();
                $isExcluded = $excluded->has($dateStr);
                $isMeetingDay = $meetingDow->contains($cursor->dayOfWeek);
                if (!$isExcluded && $isMeetingDay && $dateStr !== $examDateStr) {
                    $lessonDates[] = $dateStr;
                }
                $cursor->addDay();
            }
        }

        $subjectEcrId = $validated['subject_ecr_id'] ?? null;
        if (!$subjectEcrId) {
            $firstEcr = SubjectEcr::where('subject_id', $subjectId)->orderBy('created_at')->first();
            $subjectEcrId = $firstEcr?->id;
        }
        if (!$subjectEcrId) {
            return response()->json([
                'success' => false,
                'message' => 'No summative assessment component found. Please set Components of Summative Assessment first.',
            ], 422);
        }

        // Ensure subject_ecr_id belongs to this subject
        $ecr = SubjectEcr::where('id', $subjectEcrId)->where('subject_id', $subjectId)->first();
        if (!$ecr) {
            return response()->json(['success' => false, 'message' => 'Invalid assessment component selected'], 422);
        }

        $topics = Topic::where('subject_id', $subjectId)
            ->where('quarter', $quarterValidated['quarter'])
            ->orderBy('order')
            ->get();

        $topicTitles = $topics->pluck('title')->values();
        $topicCount = max(1, $topicTitles->count());

        $academicYear = $subject->classSection?->academic_year;

        $makeItems = function (string $type, int $count, float $defaultScore) use ($subjectEcrId, $quarterValidated, $topicTitles, $topicCount, $academicYear) {
            $items = [];
            for ($i = 1; $i <= $count; $i++) {
                $topicTitle = $topicTitles->isNotEmpty() ? $topicTitles[($i - 1) % $topicCount] : null;
                $items[] = [
                    'subject_ecr_id' => $subjectEcrId,
                    'type' => $type,
                    'title' => ucfirst($type) . " {$i}" . ($topicTitle ? ": {$topicTitle}" : ''),
                    'description' => "AI-generated {$type} for Quarter {$quarterValidated['quarter']}." . ($topicTitle ? " Focus: {$topicTitle}." : ''),
                    'quarter' => $quarterValidated['quarter'],
                    'academic_year' => $academicYear,
                    'score' => $defaultScore,
                ];
            }
            return $items;
        };

        DB::beginTransaction();
        try {
            if (!empty($validated['overwrite'])) {
                SubjectEcrItem::where('subject_ecr_id', $subjectEcrId)
                    ->where('quarter', $quarterValidated['quarter'])
                    ->whereIn('type', ['quiz', 'assignment', 'activity', 'project'])
                    ->delete();
            }

            // Try AI provider first (fallback to deterministic creation if invalid).
            $ai = AiManager::make();
            $raw = $ai->generateAssessments([
                'subject_title' => trim(($subject->title ?? '') . ' ' . ($subject->variant ?? '')),
                'quarter' => $quarterValidated['quarter'],
                'grade_level' => $subject->classSection?->grade_level ?? null,
                'counts' => [
                    'quizzes' => (int)$plan->quizzes_count,
                    'assignments' => (int)$plan->assignments_count,
                    'activities' => (int)$plan->activities_count,
                    'projects' => (int)$plan->projects_count,
                ],
                'topics' => $topics->map(fn ($t) => ['title' => $t->title])->values()->all(),
            ]);

            $aiItems = $raw['items'] ?? [];
            $aiItemsValidator = Validator::make(['items' => $aiItems], [
                'items' => ['required', 'array'],
                'items.*.type' => ['required', 'string', Rule::in(['quiz', 'assignment', 'activity', 'project'])],
                'items.*.title' => ['required', 'string', 'max:255'],
                'items.*.description' => ['nullable', 'string'],
                'items.*.score' => ['nullable', 'numeric', 'min:0'],
            ]);

            if ($aiItemsValidator->fails()) {
                $items = array_merge(
                    $makeItems('quiz', (int)$plan->quizzes_count, 10),
                    $makeItems('assignment', (int)$plan->assignments_count, 20),
                    $makeItems('activity', (int)$plan->activities_count, 10),
                    $makeItems('project', (int)$plan->projects_count, 50),
                );
            } else {
                // Convert provider items to SubjectEcrItem inputs, with sane default score.
                $defaultScores = ['quiz' => 10, 'assignment' => 20, 'activity' => 10, 'project' => 50];
                $items = collect($aiItems)->map(function ($it) use ($subjectEcrId, $quarterValidated, $academicYear, $defaultScores) {
                    $type = (string)($it['type'] ?? 'activity');
                    $score = array_key_exists('score', $it) ? (float)$it['score'] : (float)($defaultScores[$type] ?? 10);
                    
                    // Extract questions if present (for quizzes and activities)
                    $content = null;
                    if (isset($it['questions']) && is_array($it['questions']) && count($it['questions']) > 0) {
                        $content = [
                            'questions' => $it['questions'],
                        ];
                    }
                    
                    return [
                        'subject_ecr_id' => $subjectEcrId,
                        'type' => $type,
                        'title' => (string)$it['title'],
                        'description' => isset($it['description']) ? (string)$it['description'] : null,
                        'content' => $content,
                        'quarter' => $quarterValidated['quarter'],
                        'academic_year' => $academicYear,
                        'scheduled_date' => null,
                        'score' => $score,
                    ];
                })->values()->all();
            }

            // Assign scheduled dates to items (round-robin across lesson days; if no lesson days, leave null).
            if (!empty($lessonDates)) {
                $lessonCount = count($lessonDates);
                foreach ($items as $idx => &$item) {
                    $item['scheduled_date'] = $lessonDates[$idx % $lessonCount];
                }
                unset($item);
            }

            $created = [];
            foreach ($items as $item) {
                $created[] = SubjectEcrItem::create($item);
            }

            DB::commit();

            return response()->json([
                'success' => true,
                'data' => $created,
                'message' => 'Assessment items generated successfully',
            ]);
        } catch (\Throwable $e) {
            DB::rollBack();
            return response()->json(['success' => false, 'message' => 'Failed to generate assessment items', 'error' => $e->getMessage()], 500);
        }
    }
}
