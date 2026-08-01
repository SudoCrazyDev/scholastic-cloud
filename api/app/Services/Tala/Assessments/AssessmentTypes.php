<?php

namespace App\Services\Tala\Assessments;

/**
 * What kinds of assessment, and what kinds of question, Tala is allowed to draft.
 *
 * Both lists are narrower than the gradebook accepts, and deliberately so.
 *
 * **Assessment types** omit `other`, which the schema allows. It has no meaning
 * a model can reason about, so it would only ever be a guess.
 *
 * **Question types** are limited to the five whose answer key and student
 * submission shapes were traced end-to-end through AssessmentScoringService and
 * TakeAssessment.tsx. The exclusions are not arbitrary:
 *
 *   - `fill_in_the_blanks` — the student UI renders one input per
 *     `question.num_blanks`, but `num_blanks` is not in SubjectEcrItemController's
 *     validation rules, so `validate()` strips it before it can be stored. Every
 *     such question written through the API therefore shows a single blank
 *     regardless of its key. That is a bug in the existing write path, not
 *     something Tala should route around.
 *   - `matching` — storable, but the answer key is compared as free text and the
 *     pairs need care a first version should not spend.
 *   - `image_upload`, `video_upload`, `drag_picture` — need uploaded media, which
 *     Tala cannot produce.
 */
class AssessmentTypes
{
    /**
     * Assessment kinds, in the order a teacher would think of them.
     *
     * @var array<string, string>
     */
    public const TYPES = [
        'quiz' => 'Quiz',
        'assignment' => 'Assignment',
        'activity' => 'Activity',
        'exam' => 'Exam',
        'project' => 'Project',
    ];

    /**
     * Question kinds Tala may author, with what the model needs to supply.
     *
     * @var array<string, string>
     */
    public const QUESTION_TYPES = [
        'single_choice' => 'Multiple choice, one correct answer. Needs `choices` and one `answer`.',
        'multiple_choice' => 'Multiple choice, more than one correct answer. Needs `choices` and an `answer` array.',
        'true_false' => 'True or false. Needs `answer` of "True" or "False".',
        'short_answer' => 'A word or phrase, auto-marked. Needs `answer`; separate acceptable alternatives with "|".',
        'essay' => 'Extended writing, marked by the teacher. Takes no answer key.',
    ];

    /** Types that carry a `choices` list. */
    public const CHOICE_TYPES = ['single_choice', 'multiple_choice'];

    /** Types the teacher marks by hand — no answer key, no auto-score. */
    public const MANUAL_TYPES = ['essay'];

    /**
     * The `status` a new assessment is created with.
     *
     * Named here because `subject_ecr_items.status` defaults to **`published`**
     * in the database. Anything that creates an item and forgets to set this
     * exposes it to students the moment it is saved.
     */
    public const STATUS_DRAFT = 'draft';

    public const STATUS_PUBLISHED = 'published';

    /**
     * The content version new assessments are written at.
     *
     * v2 stores questions as rows with stable ids, so a later edit that removes
     * a question keeps every other answer aligned. v1 keys answers by array
     * index, which is how re-keying a published exam silently corrupts
     * submissions.
     */
    public const CONTENT_VERSION = 2;

    public static function isType(?string $type): bool
    {
        return $type !== null && array_key_exists($type, self::TYPES);
    }

    public static function isQuestionType(?string $type): bool
    {
        return $type !== null && array_key_exists($type, self::QUESTION_TYPES);
    }

    public static function label(?string $type): string
    {
        return self::TYPES[$type] ?? ucfirst((string) $type);
    }

    /**
     * @return array<int, string>
     */
    public static function typeKeys(): array
    {
        return array_keys(self::TYPES);
    }

    /**
     * @return array<int, string>
     */
    public static function questionTypeKeys(): array
    {
        return array_keys(self::QUESTION_TYPES);
    }

    /**
     * The question-type list as it appears in a tool description.
     */
    public static function questionTypeGuide(): string
    {
        $lines = [];

        foreach (self::QUESTION_TYPES as $key => $description) {
            $lines[] = '- `'.$key.'` — '.$description;
        }

        return implode("\n", $lines);
    }
}
