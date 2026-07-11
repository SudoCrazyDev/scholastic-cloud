<?php

namespace App\Http\Controllers;

use App\Models\StudentAssessmentAttempt;
use App\Models\StudentEcrItemScore;
use App\Models\SubjectEcrItem;
use App\Services\AssessmentScoringService;
use App\Services\RunningGradeRecalcService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

/**
 * Teacher-facing grading for student assessment submissions, with emphasis on
 * manually-graded questions (essays, key-less short answers, image/video uploads).
 */
class AssessmentGradingController extends Controller
{
    public function __construct(
        protected AssessmentScoringService $scoringService,
        protected RunningGradeRecalcService $runningGradeRecalcService
    ) {
    }

    /**
     * List submitted attempts for an assessment, with answers and a per-question breakdown.
     */
    public function submissions(Request $request, string $itemId): JsonResponse
    {
        $item = $this->authorizeItem($request, $itemId);
        if ($item instanceof JsonResponse) {
            return $item;
        }

        $questions = $item->content['questions'] ?? [];
        $maxScore = $this->scoringService->maxScore($questions);

        $attempts = StudentAssessmentAttempt::with('student')
            ->where('subject_ecr_item_id', $item->id)
            ->whereNotNull('submitted_at')
            ->orderByDesc('submitted_at')
            ->get();

        $submissions = $attempts->map(function (StudentAssessmentAttempt $attempt) use ($questions) {
            return $this->buildSubmission($attempt, $questions);
        })->values();

        return response()->json([
            'success' => true,
            'data' => [
                'assessment' => [
                    'id' => $item->id,
                    'title' => $item->title,
                    'type' => $item->type,
                    'quarter' => $item->quarter,
                    'max_score' => (float) $maxScore,
                    'questions' => $this->buildQuestionMeta($questions),
                ],
                'submissions' => $submissions,
            ],
        ]);
    }

    /**
     * Award manual points for a submission and recompute its total + running grade.
     */
    public function grade(Request $request, string $itemId, string $attemptId): JsonResponse
    {
        $item = $this->authorizeItem($request, $itemId);
        if ($item instanceof JsonResponse) {
            return $item;
        }

        $validated = $request->validate([
            'manual_scores' => 'present|array',
            'manual_scores.*' => 'nullable|numeric|min:0',
        ]);

        $attempt = StudentAssessmentAttempt::where('subject_ecr_item_id', $item->id)
            ->whereNotNull('submitted_at')
            ->find($attemptId);
        if (!$attempt) {
            return response()->json(['success' => false, 'message' => 'Submission not found.'], 404);
        }

        $questions = $item->content['questions'] ?? [];
        $answers = $attempt->answers ?? [];

        // Keep only valid manual-question indices, clamped to each question's points.
        $manualScores = [];
        foreach ($validated['manual_scores'] as $index => $value) {
            $i = (int) $index;
            $question = $questions[$i] ?? null;
            if (!$question || !$this->scoringService->isManualQuestion($question) || $value === null) {
                continue;
            }
            $points = (float) ($question['points'] ?? 1);
            $manualScores[(string) $i] = max(0.0, min($points, (float) $value));
        }

        $objectiveScore = $this->scoringService->objectiveScore($questions, $answers);
        $total = $objectiveScore + array_sum($manualScores);
        $maxScore = $this->scoringService->maxScore($questions);

        $attempt->update([
            'manual_scores' => $manualScores,
            'score' => $total,
            'max_score' => $maxScore,
            'graded_at' => now(),
            'graded_by' => $request->user()->id,
        ]);

        StudentEcrItemScore::updateOrCreate(
            ['student_id' => $attempt->student_id, 'subject_ecr_item_id' => $item->id],
            ['score' => $total]
        );

        $this->runningGradeRecalcService->recalculate($attempt->student_id, $item->id);

        return response()->json([
            'success' => true,
            'data' => $this->buildSubmission($attempt->fresh('student'), $questions),
        ]);
    }

    /**
     * Re-check every submitted attempt against the current answer key: recompute
     * objective scores (keeping awarded manual points), persist attempt totals,
     * refresh ECR item scores, and recalc running grades. Used after fixing an
     * answer key or a scoring bug so stored scores match what grading shows.
     */
    public function recheck(Request $request, string $itemId): JsonResponse
    {
        $item = $this->authorizeItem($request, $itemId);
        if ($item instanceof JsonResponse) {
            return $item;
        }

        $questions = $item->content['questions'] ?? [];
        $maxScore = $this->scoringService->maxScore($questions);

        $attempts = StudentAssessmentAttempt::with('student')
            ->where('subject_ecr_item_id', $item->id)
            ->whereNotNull('submitted_at')
            ->orderByDesc('submitted_at')
            ->get();

        $updated = 0;
        $seenStudents = [];
        foreach ($attempts as $attempt) {
            $objectiveScore = $this->scoringService->objectiveScore($questions, $attempt->answers ?? []);

            // Keep only manual scores that still map to a manual question, clamped to its points.
            $manualScores = [];
            foreach ($attempt->manual_scores ?? [] as $index => $value) {
                $i = (int) $index;
                $question = $questions[$i] ?? null;
                if (!$question || !$this->scoringService->isManualQuestion($question) || $value === null) {
                    continue;
                }
                $points = (float) ($question['points'] ?? 1);
                $manualScores[(string) $i] = max(0.0, min($points, (float) $value));
            }

            $total = $objectiveScore + array_sum($manualScores);
            $changed = (float) $attempt->score !== $total || (float) $attempt->max_score !== $maxScore;
            if ($changed) {
                $attempt->update([
                    'manual_scores' => $manualScores,
                    'score' => $total,
                    'max_score' => $maxScore,
                ]);
                $updated++;
            }

            // Attempts are ordered latest-first; only the latest per student drives the ECR score.
            if (!isset($seenStudents[$attempt->student_id])) {
                $seenStudents[$attempt->student_id] = true;
                if ($changed) {
                    StudentEcrItemScore::updateOrCreate(
                        ['student_id' => $attempt->student_id, 'subject_ecr_item_id' => $item->id],
                        ['score' => $total]
                    );
                    $this->runningGradeRecalcService->recalculate($attempt->student_id, $item->id);
                }
            }
        }

        $submissions = $attempts->map(function (StudentAssessmentAttempt $attempt) use ($questions) {
            return $this->buildSubmission($attempt, $questions);
        })->values();

        return response()->json([
            'success' => true,
            'data' => [
                'updated' => $updated,
                'total' => $attempts->count(),
                'submissions' => $submissions,
            ],
        ]);
    }

    /**
     * Resolve the assessment item and confirm it belongs to the user's institution.
     * Returns the item, or a JsonResponse on failure.
     */
    private function authorizeItem(Request $request, string $itemId): SubjectEcrItem|JsonResponse
    {
        $item = SubjectEcrItem::with(['subjectEcr.subject'])->find($itemId);
        if (!$item || !in_array($item->type, ['quiz', 'activity', 'assignment', 'exam'], true)) {
            return response()->json(['success' => false, 'message' => 'Assessment not found.'], 404);
        }

        $defaultInstitution = $request->user()->userInstitutions()
            ->where('is_default', true)
            ->first();
        if (!$defaultInstitution) {
            return response()->json([
                'success' => false,
                'message' => 'No default institution found for authenticated user',
            ], 403);
        }

        $subjectInstitutionId = $item->subjectEcr?->subject?->institution_id;
        if (!$subjectInstitutionId || $subjectInstitutionId !== $defaultInstitution->institution_id) {
            return response()->json(['success' => false, 'message' => 'Access denied.'], 403);
        }

        return $item;
    }

    /**
     * Question metadata for the grading UI (includes correct answers for teacher reference).
     */
    private function buildQuestionMeta(array $questions): array
    {
        $meta = [];
        foreach ($questions as $i => $q) {
            $type = (string) ($q['type'] ?? 'single_choice');
            $meta[] = [
                'index' => $i,
                'type' => $type,
                'question' => $q['question'] ?? '',
                'points' => (float) ($q['points'] ?? 1),
                'choices' => $q['choices'] ?? [],
                'choiceImages' => $q['choiceImages'] ?? [],
                'answer' => $q['answer'] ?? null,
                'blanks' => $q['blanks'] ?? [],
                'instructions' => $q['instructions'] ?? '',
                'manual' => $this->scoringService->isManualQuestion($q),
            ];
        }
        return $meta;
    }

    private function buildSubmission(StudentAssessmentAttempt $attempt, array $questions): array
    {
        $answers = $attempt->answers ?? [];
        $manualScores = $attempt->manual_scores ?? [];

        $perQuestion = [];
        $objectiveScore = 0.0;
        $manualTotal = 0.0;
        $allManualGraded = true;

        foreach ($questions as $i => $q) {
            $type = (string) ($q['type'] ?? 'single_choice');
            $points = (float) ($q['points'] ?? 1);
            $given = $answers[(string) $i] ?? $answers[$i] ?? null;
            $isManual = $this->scoringService->isManualQuestion($q);

            if ($isManual) {
                $awarded = $manualScores[(string) $i] ?? $manualScores[$i] ?? null;
                if ($awarded === null) {
                    $allManualGraded = false;
                } else {
                    $manualTotal += (float) $awarded;
                }
                $perQuestion[] = [
                    'index' => $i,
                    'manual' => true,
                    'answer' => $this->resolveAnswerForView($given),
                    'awarded' => $awarded === null ? null : (float) $awarded,
                    'auto_correct' => null,
                ];
            } else {
                $correct = $this->scoringService->isQuestionCorrect($type, $q, $given);
                if ($correct) {
                    $objectiveScore += $points;
                }
                $perQuestion[] = [
                    'index' => $i,
                    'manual' => false,
                    'answer' => $this->resolveAnswerForView($given),
                    'awarded' => $correct ? $points : 0.0,
                    'auto_correct' => $correct,
                ];
            }
        }

        $student = $attempt->student;
        $name = $student
            ? trim(implode(' ', array_filter([$student->first_name, $student->middle_name, $student->last_name, $student->ext_name])))
            : 'Unknown student';

        return [
            'attempt_id' => $attempt->id,
            'student' => [
                'id' => $attempt->student_id,
                'name' => $name !== '' ? $name : 'Unknown student',
                'lrn' => $student?->lrn,
            ],
            'submitted_at' => $attempt->submitted_at?->toIso8601String(),
            'graded_at' => $attempt->graded_at?->toIso8601String(),
            'is_fully_graded' => $allManualGraded,
            'objective_score' => (float) $objectiveScore,
            'manual_total' => (float) $manualTotal,
            'total_score' => (float) ($objectiveScore + $manualTotal),
            'max_score' => (float) $this->scoringService->maxScore($questions),
            'per_question' => $perQuestion,
        ];
    }

    /**
     * For upload answers, refresh the viewable URL from the stored R2 path
     * (the URL captured at upload time may have expired).
     */
    private function resolveAnswerForView(mixed $given): mixed
    {
        if (is_array($given) && isset($given['path']) && is_string($given['path'])) {
            $given['url'] = $this->temporaryFileUrl($given['path']);
        }
        return $given;
    }

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
