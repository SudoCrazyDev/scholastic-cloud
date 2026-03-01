<?php

namespace App\Http\Controllers;

use App\Auth\StudentPortalUser;
use App\Models\Student;
use App\Models\StudentAssessmentAttempt;
use App\Models\StudentEcrItemScore;
use App\Models\StudentSection;
use App\Models\StudentSubject;
use App\Models\Subject;
use App\Models\SubjectEcr;
use App\Models\SubjectEcrItem;
use App\Services\RunningGradeRecalcService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * LMS-style: student lists/takes quizzes, assignments, exams; live scoring.
 * Supports both User linked to Student (students.user_id) and StudentPortalUser (student_auth login).
 */
class StudentAssessmentController extends Controller
{
    public function __construct(
        protected RunningGradeRecalcService $runningGradeRecalcService
    ) {
    }

    /**
     * Resolve the current user's student record (for student portal).
     */
    protected function resolveStudent(Request $request): ?Student
    {
        $user = $request->user();
        if (!$user) {
            return null;
        }
        if ($user instanceof StudentPortalUser) {
            return $user->student;
        }
        return Student::where('user_id', $user->id)->first();
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
            $attempt = $group->first();
            $rules = $this->assessmentRules($item);
            $submittedCount = $group->whereNotNull('submitted_at')->count();
            $inProgress = $group->first(fn (StudentAssessmentAttempt $a) => $a->submitted_at === null);
            $canRetake = $submittedCount < $rules['max_attempts'];
            $hasQuestions = !empty($item->content['questions'] ?? []);
            $status = 'not_started';
            $score = null;
            $maxScore = null;
            $submittedAt = null;

            if ($inProgress) {
                $status = 'in_progress';
            } elseif ($attempt && $attempt->submitted_at && !$canRetake) {
                $status = 'submitted';
                $score = $attempt->score;
                $maxScore = $attempt->max_score;
                $submittedAt = $attempt->submitted_at?->toIso8601String();
            } elseif ($attempt && $attempt->submitted_at) {
                $score = $attempt->score;
                $maxScore = $attempt->max_score;
                $submittedAt = $attempt->submitted_at?->toIso8601String();
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
                'attempts_allowed' => $rules['max_attempts'],
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

        $attempt = StudentAssessmentAttempt::where('student_id', $student->id)
            ->where('subject_ecr_item_id', $item->id)
            ->latest('updated_at')
            ->first();

        $rules = $this->assessmentRules($item);
        $submittedCount = StudentAssessmentAttempt::where('student_id', $student->id)
            ->where('subject_ecr_item_id', $item->id)
            ->whereNotNull('submitted_at')
            ->count();

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
            'attempts_allowed' => $rules['max_attempts'],
        ];

        $questions = $item->content['questions'] ?? [];
        if (!empty($questions)) {
            $payload['questions'] = $this->stripAnswersFromQuestions($questions);
            $payload['max_score_possible'] = $this->computeMaxScoreFromQuestions($questions);
        } else {
            $payload['questions'] = [];
            $payload['max_score_possible'] = (float) $item->score;
        }

        if ($attempt) {
            $payload['attempt'] = [
                'id' => $attempt->id,
                'started_at' => $attempt->started_at?->toIso8601String(),
                'submitted_at' => $attempt->submitted_at?->toIso8601String(),
                'score' => $attempt->score,
                'max_score' => $attempt->max_score,
                'answers' => $attempt->answers,
            ];
            if ($attempt->submitted_at) {
                $payload['attempt_status'] = 'submitted';
            } else {
                $payload['attempt_status'] = 'in_progress';
                $payload['answers'] = $attempt->answers ?? [];
            }
        } else {
            $payload['attempt_status'] = 'not_started';
            $payload['attempt'] = null;
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
        if ($submittedCount >= $rules['max_attempts']) {
            return response()->json([
                'success' => false,
                'message' => 'You have reached the maximum number of attempts for this assessment.',
            ], 422);
        }

        $maxScore = $this->computeMaxScoreFromQuestions($questions);
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

        $computed = $this->computeScore($questions, $validated['answers']);
        $attempt->update([
            'submitted_at' => now(),
            'score' => $computed['score'],
            'max_score' => $computed['max_score'],
            'answers' => $validated['answers'],
        ]);

        StudentEcrItemScore::updateOrCreate(
            [
                'student_id' => $student->id,
                'subject_ecr_item_id' => $item->id,
            ],
            ['score' => $computed['score']]
        );

        $this->runningGradeRecalcService->recalculate($student->id, $item->id);

        return response()->json([
            'success' => true,
            'data' => [
                'score' => (float) $computed['score'],
                'max_score' => (float) $computed['max_score'],
                'attempt_id' => $attempt->id,
                'submitted_at' => $attempt->submitted_at?->toIso8601String(),
            ],
        ]);
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
            $out[] = $entry;
        }
        return $out;
    }

    private function computeMaxScoreFromQuestions(array $questions): float
    {
        $sum = 0;
        foreach ($questions as $q) {
            $sum += (float) ($q['points'] ?? 1);
        }
        return $sum;
    }

    private function computeScore(array $questions, array $answers): array
    {
        $maxScore = $this->computeMaxScoreFromQuestions($questions);
        $score = 0;
        foreach ($questions as $i => $q) {
            $type = (string) ($q['type'] ?? 'single_choice');
            $points = (float) ($q['points'] ?? 1);
            $key = (string) $i;
            $givenRaw = $answers[$key] ?? $answers[$i] ?? null;
            if ($this->isQuestionCorrect($type, $q, $givenRaw)) {
                $score += $points;
            }
        }
        return ['score' => $score, 'max_score' => $maxScore];
    }

    private function isQuestionCorrect(string $type, array $q, mixed $givenRaw): bool
    {
        if ($givenRaw === null || $givenRaw === '') {
            return false;
        }
        if ($type === 'true_false') {
            $correct = trim((string) ($q['answer'] ?? ''));
            $given = is_array($givenRaw) ? trim((string) ($givenRaw[0] ?? '')) : trim((string) $givenRaw);
            return strcasecmp($correct, $given) === 0;
        }
        if ($type === 'single_choice') {
            $correct = (string) ($q['answer'] ?? '');
            $given = is_array($givenRaw) ? (string) ($givenRaw[0] ?? '') : (string) $givenRaw;
            return $this->choiceMatches($correct, $given, $q['choices'] ?? []);
        }
        if ($type === 'multiple_choice') {
            $correctRaw = $q['answer'] ?? [];
            $correct = is_array($correctRaw)
                ? array_map('trim', array_map('strtoupper', $correctRaw))
                : array_map('trim', array_map('strtoupper', explode(',', (string) $correctRaw)));
            $correct = array_values(array_filter($correct));
            sort($correct);
            $given = is_array($givenRaw)
                ? array_map('trim', array_map('strtoupper', $givenRaw))
                : array_map('trim', array_map('strtoupper', explode(',', (string) $givenRaw)));
            $given = array_values(array_filter($given));
            sort($given);
            return $correct === $given;
        }
        if ($type === 'fill_in_the_blanks') {
            $correctBlanks = $q['blanks'] ?? [];
            if (empty($correctBlanks)) {
                return false;
            }
            $givenBlanks = is_array($givenRaw) ? $givenRaw : (array) $givenRaw;
            if (count($givenBlanks) !== count($correctBlanks)) {
                return false;
            }
            foreach ($correctBlanks as $idx => $correctVal) {
                $givenVal = trim((string) ($givenBlanks[$idx] ?? ''));
                // Allow multiple acceptable answers per blank: "answer1 | answer2 | answer3"
                $alternatives = array_map('trim', explode('|', (string) $correctVal));
                $alternatives = array_filter($alternatives);
                $matched = false;
                foreach ($alternatives as $alt) {
                    if (strcasecmp($alt, $givenVal) === 0) {
                        $matched = true;
                        break;
                    }
                }
                if (!$matched) {
                    return false;
                }
            }
            return true;
        }
        if (in_array($type, ['short_answer', 'essay'], true)) {
            $correctRaw = $q['answer'] ?? '';
            $correctValues = is_array($correctRaw)
                ? $correctRaw
                : explode('|', (string) $correctRaw);
            $correctValues = array_values(array_filter(array_map(fn ($v) => trim((string) $v), $correctValues)));
            if (empty($correctValues)) {
                // No answer key means this should be manually graded.
                return false;
            }
            $given = is_array($givenRaw)
                ? trim((string) ($givenRaw[0] ?? ''))
                : trim((string) $givenRaw);
            foreach ($correctValues as $correct) {
                if (strcasecmp($correct, $given) === 0) {
                    return true;
                }
            }
            return false;
        }
        return false;
    }

    private function choiceMatches(string $correct, string $given, array $choices): bool
    {
        $normalize = function (string $v): string {
            $v = trim($v);
            if (preg_match('/^([A-Za-z])[.)\s]/', $v, $m)) {
                return strtoupper($m[1]);
            }
            return strtoupper(substr($v, 0, 1));
        };
        return $normalize($correct) === $normalize($given);
    }

    /**
     * Resolve subjects a student can access:
     * - non-limited subjects from active class sections
     * - limited subjects only when explicitly assigned via student_subjects
     * - plus explicit active assignments as fallback for migrated/legacy data.
     */
    private function eligibleSubjectIds(Student $student): array
    {
        $activeSectionIds = StudentSection::where('student_id', $student->id)
            ->where('is_active', true)
            ->pluck('section_id')
            ->toArray();

        $explicitAssignedSubjectIds = StudentSubject::where('student_id', $student->id)
            ->where('is_active', true)
            ->pluck('subject_id')
            ->toArray();

        if (empty($activeSectionIds)) {
            return array_values(array_unique($explicitAssignedSubjectIds));
        }

        $sectionSubjectIds = Subject::whereIn('class_section_id', $activeSectionIds)
            ->where(function ($query) use ($student) {
                $query
                    ->where(function ($q) {
                        $q->where('is_limited_student', false)
                            ->orWhereNull('is_limited_student');
                    })
                    ->orWhere(function ($q) use ($student) {
                        $q->where('is_limited_student', true)
                            ->whereHas('studentSubjects', function ($sq) use ($student) {
                                $sq->where('student_id', $student->id)
                                    ->where('is_active', true);
                            });
                    });
            })
            ->pluck('id')
            ->toArray();

        return array_values(array_unique(array_merge($sectionSubjectIds, $explicitAssignedSubjectIds)));
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
            'max_score' => (float) $this->computeMaxScoreFromQuestions($questions),
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
