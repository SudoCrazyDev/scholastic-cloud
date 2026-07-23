<?php

namespace App\Services;

use App\Models\AssessmentQuestion;
use App\Models\StudentAssessmentAnswer;
use App\Models\StudentAssessmentAttempt;
use App\Models\SubjectEcrItem;
use Illuminate\Support\Arr;

/**
 * Storage helpers for v2 assessments (content_version = 2): questions live in
 * assessment_questions rows and answers in student_assessment_answers, both keyed by a
 * stable question id. Reading is unified with v1 through SubjectEcrItem::resolvedQuestions()
 * and the id/index maps below, so scoring/grading logic stays shared.
 */
class AssessmentV2Service
{
    // Everything that isn't a core column becomes type-specific `config`.
    private const CORE_KEYS = ['id', 'type', 'question', 'points'];

    public function __construct(protected AssessmentScoringService $scoring)
    {
    }

    /**
     * Persist a v2 question set from the authoring payload: update rows whose id is present,
     * create rows for new questions, soft-delete rows no longer in the payload (preserving
     * their answers/history), and keep positions in payload order. Recomputes item->score.
     */
    public function syncQuestions(SubjectEcrItem $item, array $questions): void
    {
        $keepIds = [];
        $total = 0.0;

        foreach (array_values($questions) as $pos => $q) {
            $points = isset($q['points']) && is_numeric($q['points']) ? (float) $q['points'] : 1.0;
            $total += $points;

            $attrs = [
                'subject_ecr_item_id' => $item->id,
                'position' => $pos,
                'type' => $q['type'] ?? 'single_choice',
                'question' => $q['question'] ?? '',
                'points' => $points,
                'config' => Arr::except(is_array($q) ? $q : [], self::CORE_KEYS),
            ];

            // Only match a live row that already belongs to this item; unknown/client-only
            // ids (e.g. nanoid keys for brand-new questions) fall through to create.
            $existing = !empty($q['id'])
                ? AssessmentQuestion::where('id', $q['id'])->where('subject_ecr_item_id', $item->id)->first()
                : null;

            if ($existing) {
                $existing->fill($attrs)->save();
                $keepIds[] = $existing->id;
            } else {
                $keepIds[] = AssessmentQuestion::create($attrs)->id;
            }
        }

        AssessmentQuestion::where('subject_ecr_item_id', $item->id)
            ->whereNotIn('id', $keepIds)
            ->delete(); // soft delete

        $item->score = $total;
        $item->save();
    }

    /**
     * Record a submission's answers as normalized rows and return the objective score.
     * $answersInput is keyed by question id (v2 client). Manual questions store null awarded
     * until a teacher grades them.
     */
    public function writeSubmissionAnswers(StudentAssessmentAttempt $attempt, array $questions, array $answersInput): float
    {
        $objective = 0.0;

        foreach ($questions as $i => $q) {
            $qid = $q['id'] ?? null;
            if ($qid === null) {
                continue; // v2 questions always carry an id; skip anything malformed
            }
            $response = $this->scoring->answerFor($q, $i, $answersInput);
            $manual = $this->scoring->isManualQuestion($q);

            if ($manual) {
                $isCorrect = null;
                $awarded = null;
            } else {
                $isCorrect = $this->scoring->isQuestionCorrect((string) ($q['type'] ?? 'single_choice'), $q, $response);
                $awarded = $isCorrect ? (float) ($q['points'] ?? 1) : 0.0;
                $objective += (float) $awarded;
            }

            StudentAssessmentAnswer::updateOrCreate(
                ['attempt_id' => $attempt->id, 'question_id' => $qid],
                ['response' => $response, 'is_correct' => $isCorrect, 'awarded' => $awarded]
            );
        }

        return $objective;
    }

    /**
     * Re-grade the auto-scored answer rows of an attempt against the current answer key
     * (used by "recheck"): refreshes is_correct/awarded for non-manual questions from each
     * stored response, leaves manual awards untouched, and returns the objective total.
     */
    public function regradeObjective(StudentAssessmentAttempt $attempt, array $questions): float
    {
        $byId = [];
        foreach ($questions as $q) {
            if (!empty($q['id'])) {
                $byId[$q['id']] = $q;
            }
        }

        $objective = 0.0;
        foreach ($attempt->assessmentAnswers as $row) {
            $q = $byId[$row->question_id] ?? null;
            if (!$q || $this->scoring->isManualQuestion($q)) {
                continue; // manual awards and orphaned answers are left as-is
            }
            $correct = $this->scoring->isQuestionCorrect((string) ($q['type'] ?? 'single_choice'), $q, $row->response);
            $awarded = $correct ? (float) ($q['points'] ?? 1) : 0.0;
            $objective += $awarded;
            if ((bool) $row->is_correct !== $correct || (float) $row->awarded !== $awarded) {
                $row->update(['is_correct' => $correct, 'awarded' => $awarded]);
            }
        }
        return $objective;
    }

    /**
     * Answer map for scoring/display: question_id => response.
     */
    public function answersMap(StudentAssessmentAttempt $attempt): array
    {
        return $attempt->assessmentAnswers
            ->mapWithKeys(fn (StudentAssessmentAnswer $a) => [$a->question_id => $a->response])
            ->all();
    }

    /**
     * Awarded points for manually-graded questions: question_id => awarded (only where set).
     * Mirrors v1's manual_scores map, but keyed by question id.
     */
    public function manualMap(StudentAssessmentAttempt $attempt): array
    {
        return $attempt->assessmentAnswers
            ->filter(fn (StudentAssessmentAnswer $a) => $a->awarded !== null && $a->is_correct === null)
            ->mapWithKeys(fn (StudentAssessmentAnswer $a) => [$a->question_id => (float) $a->awarded])
            ->all();
    }
}
