<?php

namespace App\Http\Controllers;

use App\Auth\StudentPortalUser;
use App\Http\Controllers\Concerns\ResolvesStudentSubjects;
use App\Models\Student;
use App\Models\StudentAssessmentAttempt;
use App\Models\StudentEcrItemScore;
use App\Models\StudentSection;
use App\Models\StudentSubject;
use App\Models\Subject;
use App\Models\SubjectEcr;
use App\Models\SubjectEcrItem;
use App\Services\AssessmentScoringService;
use App\Services\RunningGradeRecalcService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * LMS-style: student lists/takes quizzes, assignments, exams; live scoring.
 * Supports both User linked to Student (students.user_id) and StudentPortalUser (student_auth login).
 */
class StudentAssessmentController extends Controller
{
    use ResolvesStudentSubjects;

    public function __construct(
        protected RunningGradeRecalcService $runningGradeRecalcService,
        protected AssessmentScoringService $scoringService
    ) {
    }

    /**
     * List assessments (quizzes, assignments, exams) for the current student.
     * Returns items the student is eligible to take + attempt status and last score.
     */
    public function index(Request $request): JsonResponse
    {
        $student = $this->resolveStudent($request);
        if (!$student) {
            return response()->json([
                'success' => false,
                'message' => 'Not linked to a student account. Link your user to a student to see assessments.',
            ], 403);
        }

        $subjectIds = $this->eligibleSubjectIds($student);
        if (empty($subjectIds)) {
            return response()->json(['success' => true, 'data' => []]);
        }

        $ecrIds = SubjectEcr::whereIn('subject_id', $subjectIds)->pluck('id')->toArray();
        if (empty($ecrIds)) {
            return response()->json(['success' => true, 'data' => []]);
        }

        $items = SubjectEcrItem::with(['subjectEcr.subject'])
            ->whereIn('subject_ecr_id', $ecrIds)
            ->whereIn('type', ['quiz', 'assignment', 'exam'])
            ->where(function ($q) {
                // Backward-compatible: legacy rows may have NULL status but should behave as published.
                $q->where('status', 'published')
                    ->orWhereNull('status');
            })
            ->orderBy('scheduled_date')
            ->orderBy('created_at')
            ->get();

        $itemIds = $items->pluck('id')->toArray();
        $attemptsCollection = StudentAssessmentAttempt::where('student_id', $student->id)
            ->whereIn('subject_ecr_item_id', $itemIds)
            ->orderByRaw('submitted_at IS NULL, submitted_at DESC')
            ->orderByDesc('id')
            ->get();
        $attempts = $attemptsCollection->groupBy('subject_ecr_item_id');

        $data = $items->map(function (SubjectEcrItem $item) use ($attempts) {
            $group = $attempts->get($item->id) ?? collect();
            $latestSubmitted = $group->first(fn (StudentAssessmentAttempt $a) => $a->submitted_at !== null);
            $rules = $this->assessmentRules($item);
            $submittedCount = $group->whereNotNull('submitted_at')->count();
            $inProgress = $group->first(fn (StudentAssessmentAttempt $a) => $a->submitted_at === null);
            $attemptsAllowed = $this->effectiveMaxAttempts($item, $rules);
            $canRetake = $submittedCount < $attemptsAllowed;
            $hasQuestions = !empty($item->content['questions'] ?? []);
            $status = 'not_started';
            $score = null;
            $maxScore = null;
            $submittedAt = null;

            if ($inProgress) {
                $status = 'in_progress';
            } elseif ($latestSubmitted && !$canRetake) {
                $status = 'submitted';
                $score = $latestSubmitted->score;
                $maxScore = $latestSubmitted->max_score;
                $submittedAt = $latestSubmitted->submitted_at?->toIso8601String();
            } elseif ($latestSubmitted) {
                $score = $latestSubmitted->score;
                $maxScore = $latestSubmitted->max_score;
                $submittedAt = $latestSubmitted->submitted_at?->toIso8601String();
            }

            return [
                'id' => $item->id,
                'type' => $item->type,
                'status' => $item->status,
                'title' => $item->title,
                'description' => $item->description,
                'quarter' => $item->quarter,
                'academic_year' => $item->academic_year,
                'max_score' => (float) $item->score,
                'scheduled_date' => $item->scheduled_date?->format('Y-m-d'),
                'open_at' => $item->open_at?->toIso8601String(),
                'close_at' => $item->close_at?->toIso8601String(),
                'due_at' => $item->due_at?->toIso8601String(),
                'allow_late_submission' => (bool) $item->allow_late_submission,
                'subject_title' => $item->subjectEcr?->subject?->title ?? '',
                'has_questions' => $hasQuestions,
                'attempt_status' => $status,
                'attempt_score' => $score,
                'attempt_max_score' => $maxScore,
                'attempt_submitted_at' => $submittedAt,
                'attempts_used' => $submittedCount,
                'attempts_allowed' => $attemptsAllowed,
                'can_retake' => $canRetake,
            ];
        });

        return response()->json(['success' => true, 'data' => $data->values()]);
    }

    /**
     * Get one assessment for taking or viewing result.
     * Strips correct answers unless viewing a submitted attempt (then includes score only).
     */
    public function show(Request $request, string $id): JsonResponse
    {
        $student = $this->resolveStudent($request);
        if (!$student) {
            return response()->json(['success' => false, 'message' => 'Not linked to a student account.'], 403);
        }

        $item = SubjectEcrItem::with(['subjectEcr.subject'])->find($id);
        if (!$this->isSupportedAssessmentItem($item) || !$this->isPublishedForStudents($item)) {
            return response()->json(['success' => false, 'message' => 'Assessment not found.'], 404);
        }

        $subjectId = $item->subjectEcr?->subject_id;
        $eligibleSubjectIds = $this->eligibleSubjectIds($student);
        if (!$subjectId || !in_array($subjectId, $eligibleSubjectIds, true)) {
            return response()->json(['success' => false, 'message' => 'Access denied.'], 403);
        }

        $rules = $this->assessmentRules($item);
        $attemptsAllowed = $this->effectiveMaxAttempts($item, $rules);
        $submittedCount = StudentAssessmentAttempt::where('student_id', $student->id)
            ->where('subject_ecr_item_id', $item->id)
            ->whereNotNull('submitted_at')
            ->count();
        $canRetake = $submittedCount < $attemptsAllowed;

        $inProgressAttempt = StudentAssessmentAttempt::where('student_id', $student->id)
            ->where('subject_ecr_item_id', $item->id)
            ->whereNull('submitted_at')
            ->latest('updated_at')
            ->first();

        $latestSubmittedAttempt = StudentAssessmentAttempt::where('student_id', $student->id)
            ->where('subject_ecr_item_id', $item->id)
            ->whereNotNull('submitted_at')
            ->latest('submitted_at')
            ->first();

        $payload = [
            'id' => $item->id,
            'type' => $item->type,
            'status' => $item->status,
            'title' => $item->title,
            'description' => $item->description,
            'quarter' => $item->quarter,
            'max_score' => (float) $item->score,
            'subject_title' => $item->subjectEcr?->subject?->title ?? '',
            'settings' => $rules,
            'open_at' => $item->open_at?->toIso8601String(),
            'close_at' => $item->close_at?->toIso8601String(),
            'due_at' => $item->due_at?->toIso8601String(),
            'allow_late_submission' => (bool) $item->allow_late_submission,
            'attempts_used' => $submittedCount,
            'attempts_allowed' => $attemptsAllowed,
        ];

        $questions = $item->content['questions'] ?? [];
        if (!empty($questions)) {
            $payload['questions'] = $this->stripAnswersFromQuestions($questions);
            $payload['max_score_possible'] = $this->scoringService->maxScore($questions);
        } else {
            $payload['questions'] = [];
            $payload['max_score_possible'] = (float) $item->score;
        }

        if ($inProgressAttempt) {
            $payload['attempt'] = [
                'id' => $inProgressAttempt->id,
                'started_at' => $inProgressAttempt->started_at?->toIso8601String(),
                'submitted_at' => $inProgressAttempt->submitted_at?->toIso8601String(),
                'score' => $inProgressAttempt->score,
                'max_score' => $inProgressAttempt->max_score,
                'answers' => $inProgressAttempt->answers,
            ];
            $payload['attempt_status'] = 'in_progress';
            $payload['answers'] = $inProgressAttempt->answers ?? [];
        } elseif ($latestSubmittedAttempt && !$canRetake) {
            $payload['attempt'] = [
                'id' => $latestSubmittedAttempt->id,
                'started_at' => $latestSubmittedAttempt->started_at?->toIso8601String(),
                'submitted_at' => $latestSubmittedAttempt->submitted_at?->toIso8601String(),
                'score' => $latestSubmittedAttempt->score,
                'max_score' => $latestSubmittedAttempt->max_score,
                'answers' => $latestSubmittedAttempt->answers,
            ];
            $payload['attempt_status'] = 'submitted';
            $payload['answers'] = [];
        } else {
            $payload['attempt_status'] = 'not_started';
            $payload['attempt'] = $latestSubmittedAttempt ? [
                'id' => $latestSubmittedAttempt->id,
                'started_at' => $latestSubmittedAttempt->started_at?->toIso8601String(),
                'submitted_at' => $latestSubmittedAttempt->submitted_at?->toIso8601String(),
                'score' => $latestSubmittedAttempt->score,
                'max_score' => $latestSubmittedAttempt->max_score,
            ] : null;
            $payload['answers'] = [];
        }

        return response()->json(['success' => true, 'data' => $payload]);
    }

    /**
     * Start an attempt: create StudentAssessmentAttempt, return assessment with questions (no answers).
     */
    public function start(Request $request, string $id): JsonResponse
    {
        $student = $this->resolveStudent($request);
        if (!$student) {
            return response()->json(['success' => false, 'message' => 'Not linked to a student account.'], 403);
        }

        $item = SubjectEcrItem::with(['subjectEcr.subject'])->find($id);
        if (!$this->isSupportedAssessmentItem($item) || !$this->isPublishedForStudents($item)) {
            return response()->json(['success' => false, 'message' => 'Assessment not found.'], 404);
        }

        $subjectId = $item->subjectEcr?->subject_id;
        $eligibleSubjectIds = $this->eligibleSubjectIds($student);
        if (!$subjectId || !in_array($subjectId, $eligibleSubjectIds, true)) {
            return response()->json(['success' => false, 'message' => 'Access denied.'], 403);
        }

        $availabilityError = $this->availabilityError($item);
        if ($availabilityError !== null) {
            return response()->json([
                'success' => false,
                'message' => $availabilityError,
            ], 422);
        }

        $questions = $item->content['questions'] ?? [];
        if (empty($questions)) {
            return response()->json([
                'success' => false,
                'message' => 'This assessment has no questions yet. It cannot be taken interactively.',
            ], 422);
        }

        $inProgress = StudentAssessmentAttempt::where('student_id', $student->id)
            ->where('subject_ecr_item_id', $item->id)
            ->whereNull('submitted_at')
            ->first();
        if ($inProgress) {
            return response()->json([
                'success' => true,
                'data' => $this->buildTakePayload($item, $inProgress),
                'message' => 'You already have an attempt in progress.',
            ]);
        }

        $rules = $this->assessmentRules($item);
        $submittedCount = StudentAssessmentAttempt::where('student_id', $student->id)
            ->where('subject_ecr_item_id', $item->id)
            ->whereNotNull('submitted_at')
            ->count();
        $attemptsAllowed = $this->effectiveMaxAttempts($item, $rules);
        if ($submittedCount >= $attemptsAllowed) {
            $message = in_array($item->type, ['quiz', 'exam'], true)
                ? 'You have already submitted this assessment. Answers can no longer be changed.'
                : 'You have reached the maximum number of attempts for this assessment.';
            return response()->json([
                'success' => false,
                'message' => $message,
            ], 422);
        }

        $maxScore = $this->scoringService->maxScore($questions);
        $attempt = StudentAssessmentAttempt::create([
            'student_id' => $student->id,
            'subject_ecr_item_id' => $item->id,
            'started_at' => now(),
            'submitted_at' => null,
            'score' => null,
            'max_score' => $maxScore,
            'answers' => [],
        ]);

        return response()->json([
            'success' => true,
            'data' => $this->buildTakePayload($item, $attempt),
        ]);
    }

    /**
     * Submit answers; compute score and persist to StudentEcrItemScore; recalc running grade.
     */
    public function submit(Request $request, string $id): JsonResponse
    {
        $student = $this->resolveStudent($request);
        if (!$student) {
            return response()->json(['success' => false, 'message' => 'Not linked to a student account.'], 403);
        }

        $validated = $request->validate([
            'answers' => 'required|array',
            // answers.* can be string (single choice, true/false, or "A,B" for multiple) or array (fill_in_the_blanks)
            'answers.*' => ['nullable'],
        ]);

        $item = SubjectEcrItem::find($id);
        if (!$this->isSupportedAssessmentItem($item) || !$this->isPublishedForStudents($item)) {
            return response()->json(['success' => false, 'message' => 'Assessment not found.'], 404);
        }

        $subjectId = $item->subjectEcr?->subject_id;
        $eligibleSubjectIds = $this->eligibleSubjectIds($student);
        if (!$subjectId || !in_array($subjectId, $eligibleSubjectIds, true)) {
            return response()->json(['success' => false, 'message' => 'Access denied.'], 403);
        }

        $availabilityError = $this->availabilityError($item);
        if ($availabilityError !== null) {
            return response()->json([
                'success' => false,
                'message' => $availabilityError,
            ], 422);
        }

        $rules = $this->assessmentRules($item);
        $submittedCount = StudentAssessmentAttempt::where('student_id', $student->id)
            ->where('subject_ecr_item_id', $item->id)
            ->whereNotNull('submitted_at')
            ->count();
        $attemptsAllowed = $this->effectiveMaxAttempts($item, $rules);
        if ($submittedCount >= $attemptsAllowed) {
            $message = in_array($item->type, ['quiz', 'exam'], true)
                ? 'You have already submitted this assessment. Answers can no longer be changed.'
                : 'You have reached the maximum number of attempts for this assessment.';
            return response()->json([
                'success' => false,
                'message' => $message,
            ], 422);
        }

        $attempt = StudentAssessmentAttempt::where('student_id', $student->id)
            ->where('subject_ecr_item_id', $item->id)
            ->whereNull('submitted_at')
            ->latest('created_at')
            ->first();

        if (!$attempt) {
            return response()->json([
                'success' => false,
                'message' => 'No attempt in progress. Start the assessment first.',
            ], 422);
        }

        $questions = $item->content['questions'] ?? [];
        if (empty($questions)) {
            return response()->json(['success' => false, 'message' => 'Assessment has no questions.'], 422);
        }

        $objectiveScore = $this->scoringService->objectiveScore($questions, $validated['answers']);
        $maxScore = $this->scoringService->maxScore($questions);
        $attempt->update([
            'submitted_at' => now(),
            'score' => $objectiveScore,
            'max_score' => $maxScore,
            'answers' => $validated['answers'],
        ]);

        StudentEcrItemScore::updateOrCreate(
            [
                'student_id' => $student->id,
                'subject_ecr_item_id' => $item->id,
            ],
            ['score' => $objectiveScore]
        );

        $this->runningGradeRecalcService->recalculate($student->id, $item->id);

        // Whether any question still needs a teacher to grade it manually.
        $needsManualGrading = false;
        foreach ($questions as $q) {
            if ($this->scoringService->isManualQuestion($q)) {
                $needsManualGrading = true;
                break;
            }
        }

        return response()->json([
            'success' => true,
            'data' => [
                'score' => (float) $objectiveScore,
                'max_score' => (float) $maxScore,
                'attempt_id' => $attempt->id,
                'submitted_at' => $attempt->submitted_at?->toIso8601String(),
                'needs_manual_grading' => $needsManualGrading,
            ],
        ]);
    }

    /**
     * Upload an image/video answer for an upload-type question to R2.
     * Returns a file reference the client stores in its answers map and sends back on submit.
     */
    public function uploadAttachment(Request $request, string $id): JsonResponse
    {
        $student = $this->resolveStudent($request);
        if (!$student) {
            return response()->json(['success' => false, 'message' => 'Not linked to a student account.'], 403);
        }

        $validated = $request->validate([
            'question_index' => 'required|integer|min:0',
            // Hard ceiling; per-type limits enforced below. 204800 KB = 200 MB.
            'file' => 'required|file|max:204800',
        ]);

        $item = SubjectEcrItem::with(['subjectEcr.subject'])->find($id);
        if (!$this->isSupportedAssessmentItem($item) || !$this->isPublishedForStudents($item)) {
            return response()->json(['success' => false, 'message' => 'Assessment not found.'], 404);
        }

        $subjectId = $item->subjectEcr?->subject_id;
        $eligibleSubjectIds = $this->eligibleSubjectIds($student);
        if (!$subjectId || !in_array($subjectId, $eligibleSubjectIds, true)) {
            return response()->json(['success' => false, 'message' => 'Access denied.'], 403);
        }

        $availabilityError = $this->availabilityError($item);
        if ($availabilityError !== null) {
            return response()->json(['success' => false, 'message' => $availabilityError], 422);
        }

        // A file can only be attached to an attempt that is in progress.
        $attempt = StudentAssessmentAttempt::where('student_id', $student->id)
            ->where('subject_ecr_item_id', $item->id)
            ->whereNull('submitted_at')
            ->latest('created_at')
            ->first();
        if (!$attempt) {
            return response()->json([
                'success' => false,
                'message' => 'No attempt in progress. Start the assessment first.',
            ], 422);
        }

        $questions = $item->content['questions'] ?? [];
        $qIndex = (int) $validated['question_index'];
        $question = $questions[$qIndex] ?? null;
        $type = $question['type'] ?? null;
        if (!$question || !in_array($type, ['image_upload', 'video_upload'], true)) {
            return response()->json(['success' => false, 'message' => 'This question does not accept file uploads.'], 422);
        }

        $file = $request->file('file');
        $mime = $file->getMimeType() ?? $file->getClientMimeType();
        $isImage = str_starts_with((string) $mime, 'image/');
        $isVideo = str_starts_with((string) $mime, 'video/');

        if ($type === 'image_upload' && !$isImage) {
            return response()->json(['success' => false, 'message' => 'Please upload an image file.'], 422);
        }
        if ($type === 'video_upload' && !$isVideo) {
            return response()->json(['success' => false, 'message' => 'Please upload a video file.'], 422);
        }
        if ($type === 'image_upload' && $file->getSize() > 25 * 1024 * 1024) {
            return response()->json(['success' => false, 'message' => 'Image must be 25 MB or smaller.'], 422);
        }

        $institutionId = $student->institutions()->first()?->id ?? 'unknown';
        $extension = $file->getClientOriginalExtension() ?: ($isVideo ? 'mp4' : 'bin');
        $fileName = Str::uuid() . '.' . $extension;
        $path = $institutionId . '/student/' . $student->id . '/assessments/' . $item->id . '/' . $attempt->id . '/q' . $qIndex . '/' . $fileName;

        Storage::disk('r2')->put($path, file_get_contents($file->getRealPath()));

        return response()->json([
            'success' => true,
            'data' => [
                'path' => $path,
                'url' => $this->temporaryFileUrl($path),
                'name' => $file->getClientOriginalName(),
                'mime' => $mime,
                'size' => $file->getSize(),
            ],
        ], 201);
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

    private function stripAnswersFromQuestions(array $questions): array
    {
        $out = [];
        foreach ($questions as $i => $q) {
            $type = (string) ($q['type'] ?? 'single_choice');
            $entry = [
                'index' => $i,
                'type' => $type,
                'question' => $q['question'] ?? '',
                'points' => (float) ($q['points'] ?? 1),
            ];
            if (in_array($type, ['true_false', 'single_choice', 'multiple_choice'], true)) {
                $entry['choices'] = $type === 'true_false'
                    ? ['True', 'False']
                    : ($q['choices'] ?? []);
            }
            if ($type === 'fill_in_the_blanks') {
                $blanks = $q['blanks'] ?? [];
                $entry['num_blanks'] = count($blanks);
            }
            if (in_array($type, ['short_answer', 'essay'], true)) {
                $entry['placeholder'] = $type === 'essay'
                    ? 'Write your detailed answer here...'
                    : 'Write your answer here...';
            }
            if (in_array($type, ['image_upload', 'video_upload'], true)) {
                $entry['instructions'] = (string) ($q['instructions'] ?? '');
                $entry['accept'] = $type === 'image_upload' ? 'image/*' : 'video/*';
            }
            $out[] = $entry;
        }
        return $out;
    }

    private function isSupportedAssessmentItem(?SubjectEcrItem $item): bool
    {
        return $item !== null && in_array($item->type, ['quiz', 'assignment', 'exam'], true);
    }

    private function isPublishedForStudents(SubjectEcrItem $item): bool
    {
        return ($item->status ?? 'published') === 'published';
    }

    private function assessmentRules(SubjectEcrItem $item): array
    {
        $defaults = $this->defaultRulesForType((string) $item->type);
        $content = is_array($item->content) ? $item->content : [];
        $contentSettings = is_array($content['settings'] ?? null) ? $content['settings'] : [];
        $settings = is_array($item->settings) ? $item->settings : [];
        $merged = array_merge($defaults, $contentSettings, $settings);

        return [
            'max_attempts' => max(1, (int) ($merged['max_attempts'] ?? $defaults['max_attempts'])),
            'time_limit_minutes' => isset($merged['time_limit_minutes']) && $merged['time_limit_minutes'] !== null && $merged['time_limit_minutes'] !== ''
                ? max(1, (int) $merged['time_limit_minutes'])
                : null,
            'pass_mark' => isset($merged['pass_mark']) && $merged['pass_mark'] !== null && $merged['pass_mark'] !== ''
                ? max(0, min(100, (float) $merged['pass_mark']))
                : null,
            'randomize_questions' => (bool) ($merged['randomize_questions'] ?? false),
        ];
    }

    private function effectiveMaxAttempts(SubjectEcrItem $item, array $rules): int
    {
        // Business rule: quiz/exam answers are final after first submission.
        if (in_array($item->type, ['quiz', 'exam'], true)) {
            return 1;
        }

        return max(1, (int) ($rules['max_attempts'] ?? 1));
    }

    private function defaultRulesForType(string $type): array
    {
        return match ($type) {
            'quiz' => [
                'max_attempts' => 3,
                'time_limit_minutes' => 30,
                'pass_mark' => 60,
                'randomize_questions' => false,
            ],
            'exam' => [
                'max_attempts' => 1,
                'time_limit_minutes' => 90,
                'pass_mark' => 70,
                'randomize_questions' => false,
            ],
            default => [
                'max_attempts' => 1,
                'time_limit_minutes' => null,
                'pass_mark' => null,
                'randomize_questions' => false,
            ],
        };
    }

    private function availabilityError(SubjectEcrItem $item): ?string
    {
        if (!$this->isPublishedForStudents($item)) {
            return 'This assessment is still in draft mode.';
        }

        $now = now();
        if ($item->open_at && $now->lt($item->open_at)) {
            return 'This assessment is not open yet.';
        }
        if ($item->close_at && $now->gt($item->close_at)) {
            return 'This assessment is already closed.';
        }
        if ($item->due_at && !$item->allow_late_submission && $now->gt($item->due_at)) {
            return 'The due date for this assessment has passed.';
        }

        return null;
    }

    private function buildTakePayload(SubjectEcrItem $item, StudentAssessmentAttempt $attempt): array
    {
        $questions = $item->content['questions'] ?? [];
        $rules = $this->assessmentRules($item);
        return [
            'id' => $item->id,
            'type' => $item->type,
            'status' => $item->status,
            'title' => $item->title,
            'description' => $item->description,
            'quarter' => $item->quarter,
            'max_score' => (float) $this->scoringService->maxScore($questions),
            'subject_title' => $item->subjectEcr?->subject?->title ?? '',
            'settings' => $rules,
            'open_at' => $item->open_at?->toIso8601String(),
            'close_at' => $item->close_at?->toIso8601String(),
            'due_at' => $item->due_at?->toIso8601String(),
            'allow_late_submission' => (bool) $item->allow_late_submission,
            'questions' => $this->stripAnswersFromQuestions($questions),
            'attempt_id' => $attempt->id,
            'answers' => $attempt->answers ?? [],
        ];
    }
}
