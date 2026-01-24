<?php

namespace App\Jobs;

use App\Models\AiGenerationTask;
use App\Models\LessonPlan;
use App\Models\Subject;
use App\Models\SubjectQuarterPlan;
use App\Models\Topic;
use App\Services\Ai\AiManager;
use Carbon\Carbon;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Validator;

class GenerateLessonPlansJob implements ShouldQueue
{
    use Queueable;

    public $timeout = 600; // 10 minutes
    public $tries = 1; // Don't retry automatically

    /**
     * Create a new job instance.
     */
    public function __construct(
        public string $taskId,
        public string $subjectId,
        public string $quarter,
        public bool $overwrite,
        public ?string $userId = null
    ) {
        //
    }

    /**
     * Execute the job.
     */
    public function handle(): void
    {
        $task = AiGenerationTask::find($this->taskId);
        if (!$task) {
            Log::error('AiGenerationTask not found', ['task_id' => $this->taskId]);
            return;
        }

        try {
            $task->update(['status' => 'processing']);

            $subject = Subject::with(['classSection'])->find($this->subjectId);
            if (!$subject) {
                throw new \Exception('Subject not found');
            }

            $plan = SubjectQuarterPlan::where('subject_id', $this->subjectId)
                ->where('quarter', $this->quarter)
                ->first();
            if (!$plan) {
                throw new \Exception('Quarter plan not found');
            }

            $topics = Topic::where('subject_id', $this->subjectId)
                ->where('quarter', $this->quarter)
                ->orderBy('order')
                ->get();

            if ($topics->count() === 0) {
                throw new \Exception('No topics found');
            }

            // Calculate session dates
            $sessionDates = $this->calculateSessionDates($plan);
            $examDateStr = Carbon::parse($plan->exam_date)->toDateString();

            // Update total items count
            $task->update(['total_items' => count($sessionDates) + 1]); // +1 for exam day

            DB::beginTransaction();
            try {
                if ($this->overwrite) {
                    LessonPlan::where('subject_id', $this->subjectId)
                        ->where('quarter', $this->quarter)
                        ->delete();
                }

                $created = [];
                $topicIndex = 0;
                $ai = AiManager::make();

                // Generate lesson plans for each session date
                foreach ($sessionDates as $i => $dateStr) {
                    $topic = $topics[$topicIndex % $topics->count()];
                    $topicIndex++;

                    $content = $ai->generateLessonPlanContent([
                        'subject_title' => trim(($subject->title ?? '') . ' ' . ($subject->variant ?? '')),
                        'quarter' => $this->quarter,
                        'lesson_date' => $dateStr,
                        'topic_title' => $topic->title,
                        'grade_level' => $subject->classSection?->grade_level ?? null,
                    ]);

                    // Validate and use fallback if needed
                    $contentValidator = Validator::make(['content' => $content], [
                        'content' => ['required', 'array'],
                        'content.kind' => ['nullable', 'string'],
                        'content.objectives' => ['nullable', 'array'],
                        'content.objectives.*' => ['string'],
                        'content.materials' => ['nullable', 'array'],
                        'content.materials.*' => ['string'],
                        'content.procedure' => ['nullable', 'array'],
                        'content.procedure.*' => ['string'],
                    ]);

                    if ($contentValidator->fails()) {
                        $content = [
                            'kind' => 'lesson',
                            'topic' => [
                                'id' => $topic->id,
                                'title' => $topic->title,
                            ],
                            'objectives' => [
                                "Explain key ideas from '{$topic->title}'.",
                                "Apply the concept through guided practice.",
                            ],
                            'materials' => [
                                "Learner's material / textbook",
                                'Board/markers or slides',
                            ],
                            'procedure' => [
                                'Review of previous lesson',
                                'Motivation / engagement activity',
                                'Discussion / demonstration',
                                'Guided practice',
                                'Independent practice',
                                'Wrap-up / reflection',
                            ],
                            'assessment' => [
                                'exit_ticket' => 'Short formative check (5 items).',
                            ],
                            'homework' => 'Practice exercises related to the topic.',
                        ];
                    }

                    $payload = [
                        'subject_id' => $this->subjectId,
                        'subject_quarter_plan_id' => $plan->id,
                        'topic_id' => $topic->id,
                        'quarter' => $this->quarter,
                        'lesson_date' => $dateStr,
                        'title' => 'Lesson ' . ($i + 1) . ': ' . $topic->title,
                        'content' => $content,
                        'generated_by' => 'ai',
                        'generated_by_user_id' => $this->userId,
                    ];

                    $created[] = LessonPlan::updateOrCreate(
                        [
                            'subject_id' => $this->subjectId,
                            'quarter' => $this->quarter,
                            'lesson_date' => $dateStr,
                        ],
                        $payload
                    );

                    // Update progress
                    $task->updateProgress($i + 1);
                }

                // Create exam day entry
                $created[] = LessonPlan::updateOrCreate(
                    [
                        'subject_id' => $this->subjectId,
                        'quarter' => $this->quarter,
                        'lesson_date' => $examDateStr,
                    ],
                    [
                        'subject_id' => $this->subjectId,
                        'subject_quarter_plan_id' => $plan->id,
                        'topic_id' => null,
                        'quarter' => $this->quarter,
                        'lesson_date' => $examDateStr,
                        'title' => "Quarter {$this->quarter} Exam",
                        'content' => [
                            'kind' => 'exam',
                            'notes' => 'Summative assessment day.',
                        ],
                        'generated_by' => 'ai',
                        'generated_by_user_id' => $this->userId,
                    ]
                );

                DB::commit();

                // Mark as completed
                $task->markCompleted([
                    'total_created' => count($created),
                    'message' => 'Lesson plans generated successfully',
                ]);

            } catch (\Throwable $e) {
                DB::rollBack();
                throw $e;
            }

        } catch (\Throwable $e) {
            Log::error('GenerateLessonPlansJob failed', [
                'task_id' => $this->taskId,
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);
            $task->markFailed($e->getMessage());
        }
    }

    private function calculateSessionDates(SubjectQuarterPlan $plan): array
    {
        $meetingDays = $plan->meeting_days ?? [];
        $excluded = collect($plan->excluded_dates ?? [])->map(fn ($d) => (string)$d)->flip();
        $start = Carbon::parse($plan->start_date)->startOfDay();
        $exam = Carbon::parse($plan->exam_date)->startOfDay();

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

        $sessionDates = [];
        $cursor = $start->copy();
        while ($cursor->lessThanOrEqualTo($exam)) {
            $dateStr = $cursor->toDateString();
            $isExcluded = $excluded->has($dateStr);
            $isMeetingDay = $meetingDow->contains($cursor->dayOfWeek);

            if (!$isExcluded && $isMeetingDay && $dateStr !== $exam->toDateString()) {
                $sessionDates[] = $dateStr;
            }
            $cursor->addDay();
        }

        return $sessionDates;
    }
}
