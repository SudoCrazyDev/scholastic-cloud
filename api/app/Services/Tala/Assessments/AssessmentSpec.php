<?php

namespace App\Services\Tala\Assessments;

/**
 * Turns the model's description of an assessment into something safe to store.
 *
 * This class exists because of one detail that is easy to get wrong and
 * impossible to notice afterwards.
 *
 * **The student submits a letter, not the choice text.** TakeAssessment.tsx
 * derives `A`, `B`, `C`… from the choice's index and submits that;
 * AssessmentScoringService::choiceMatches() then compares only the first
 * character of the stored key. So a `single_choice` answer key saved as
 * `"Melting"` is compared as `"M"` against the student's `"B"` and every
 * correct answer is marked wrong. The quiz looks perfect in the builder and
 * scores zero.
 *
 * So the model is asked for the answer the natural way — the text of the correct
 * choice — and this class converts it to the letter, which also means the answer
 * has to genuinely be one of the choices or validation fails. A model that
 * invents an option that is not on the list cannot produce a stored question.
 *
 * `multiple_choice` needs the same conversion for a different reason: its keys
 * are compared as whole uppercased strings against an array of submitted
 * letters.
 *
 * Nothing here writes to the database. It validates, normalises, and hands back
 * a payload plus a human-readable preview.
 */
class AssessmentSpec
{
    /** One turn's worth. Past this the model is generating, not helping. */
    public const MAX_QUESTIONS = 60;

    public const MAX_CHOICES = 8;

    /** `subject_ecr_items.score` is decimal(8,2). */
    private const MAX_TOTAL_POINTS = 999999.99;

    /** @var array<int, string> */
    private array $errors = [];

    /** @var array<int, array<string, mixed>> */
    private array $questions = [];

    /** @var array<int, array<string, mixed>> */
    private array $previewQuestions = [];

    private float $totalPoints = 0.0;

    /**
     * @param  array<string, mixed>  $input  Model-supplied and untrusted.
     */
    public function __construct(private readonly array $input) {}

    /**
     * @return array<int, string>
     */
    public function errors(): array
    {
        return $this->errors;
    }

    public function ok(): bool
    {
        return $this->errors === [];
    }

    /**
     * Validate and normalise the question list.
     *
     * Returns false as soon as the set is unusable. Every problem found is
     * reported, not just the first, because the model gets one tool result to
     * learn from and a list of all of them is one round trip instead of five.
     */
    public function parseQuestions(bool $required): bool
    {
        $raw = $this->input['questions'] ?? null;

        if ($raw === null || $raw === []) {
            if ($required) {
                $this->errors[] = 'questions is required and must contain at least one question.';
            }

            return ! $required;
        }

        if (! is_array($raw) || ! array_is_list($raw)) {
            $this->errors[] = 'questions must be a list.';

            return false;
        }

        if (count($raw) > self::MAX_QUESTIONS) {
            $this->errors[] = 'A single assessment may have at most '.self::MAX_QUESTIONS.' questions; '.count($raw).' were supplied.';

            return false;
        }

        foreach ($raw as $index => $question) {
            $this->parseQuestion($index + 1, $question);
        }

        if ($this->totalPoints > self::MAX_TOTAL_POINTS) {
            $this->errors[] = 'The total points across all questions is too large.';
        }

        return $this->ok();
    }

    /**
     * @param  mixed  $raw
     */
    private function parseQuestion(int $number, $raw): void
    {
        if (! is_array($raw)) {
            $this->errors[] = "Question {$number} is not an object.";

            return;
        }

        $type = is_string($raw['type'] ?? null) ? trim($raw['type']) : '';

        if (! AssessmentTypes::isQuestionType($type)) {
            $this->errors[] = "Question {$number} has an unsupported type "
                .($type === '' ? '(missing)' : "\"{$type}\"")
                .'. Use one of: '.implode(', ', AssessmentTypes::questionTypeKeys()).'.';

            return;
        }

        $prompt = is_string($raw['question'] ?? null) ? trim($raw['question']) : '';

        if ($prompt === '') {
            $this->errors[] = "Question {$number} has no question text.";

            return;
        }

        $points = $this->points($number, $raw['points'] ?? null);

        if ($points === null) {
            return;
        }

        $stored = [
            'type' => $type,
            'question' => $prompt,
            'points' => $points,
        ];

        $shown = [
            'number' => $number,
            'type' => $type,
            'question' => $prompt,
            'points' => $points,
        ];

        if (in_array($type, AssessmentTypes::CHOICE_TYPES, true)) {
            $choices = $this->choices($number, $raw['choices'] ?? null);

            if ($choices === null) {
                return;
            }

            $letters = $this->answerLetters($number, $type, $raw['answer'] ?? null, $choices);

            if ($letters === null) {
                return;
            }

            $stored['choices'] = $choices;
            // The letters, because that is what arrives from the student.
            $stored['answer'] = $type === 'multiple_choice' ? $letters : $letters[0];

            $shown['choices'] = $this->labelledChoices($choices);
            // The text, because that is what a teacher is checking.
            $shown['answer'] = implode(', ', array_map(
                fn (string $letter) => $letter.'. '.$choices[ord($letter) - 65],
                $letters
            ));
        } elseif ($type === 'true_false') {
            $answer = $this->trueFalse($number, $raw['answer'] ?? null);

            if ($answer === null) {
                return;
            }

            $stored['answer'] = $answer;
            $shown['answer'] = $answer;
        } elseif ($type === 'short_answer') {
            $answer = $this->shortAnswer($number, $raw['answer'] ?? null);

            if ($answer === null) {
                return;
            }

            $stored['answer'] = $answer;
            $shown['answer'] = str_replace('|', ' / ', $answer);
        } else {
            // Manual types carry no key; the teacher awards the points.
            $shown['answer'] = 'Marked by you';
        }

        $this->questions[] = $stored;
        $this->previewQuestions[] = $shown;
        $this->totalPoints += $points;
    }

    /**
     * @param  mixed  $raw
     */
    private function points(int $number, $raw): ?float
    {
        if ($raw === null || $raw === '') {
            return 1.0;
        }

        if (! is_numeric($raw)) {
            $this->errors[] = "Question {$number} has non-numeric points.";

            return null;
        }

        $points = round((float) $raw, 2);

        if ($points < 0) {
            $this->errors[] = "Question {$number} has negative points.";

            return null;
        }

        return $points;
    }

    /**
     * @param  mixed  $raw
     * @return array<int, string>|null
     */
    private function choices(int $number, $raw): ?array
    {
        if (! is_array($raw) || ! array_is_list($raw)) {
            $this->errors[] = "Question {$number} needs a `choices` list.";

            return null;
        }

        $choices = [];

        foreach ($raw as $choice) {
            if (is_int($choice) || is_float($choice)) {
                $choice = (string) $choice;
            }

            if (! is_string($choice)) {
                continue;
            }

            // A leading "A." from a model that formatted the list itself would
            // be rendered on top of the letter the student UI already draws.
            $choice = trim(preg_replace('/^\s*[A-Za-z][.)]\s+/', '', $choice) ?? $choice);

            if ($choice !== '') {
                $choices[] = $choice;
            }
        }

        if (count($choices) < 2) {
            $this->errors[] = "Question {$number} needs at least two choices.";

            return null;
        }

        if (count($choices) > self::MAX_CHOICES) {
            $this->errors[] = "Question {$number} has more than ".self::MAX_CHOICES.' choices.';

            return null;
        }

        if (count(array_unique(array_map('mb_strtolower', $choices))) !== count($choices)) {
            $this->errors[] = "Question {$number} has duplicate choices.";

            return null;
        }

        return $choices;
    }

    /**
     * Resolve the answer to choice letters.
     *
     * Accepts the choice text (what the model is asked for), or the letter, or
     * a 1-based position. All three collapse to a letter, and anything that does
     * not name an actual choice is an error rather than a guess — a wrong key is
     * invisible until a class has been marked.
     *
     * @param  mixed  $raw
     * @param  array<int, string>  $choices
     * @return array<int, string>|null
     */
    private function answerLetters(int $number, string $type, $raw, array $choices): ?array
    {
        $wanted = is_array($raw) ? $raw : [$raw];
        $wanted = array_values(array_filter($wanted, fn ($value) => $value !== null && $value !== ''));

        if ($wanted === []) {
            $this->errors[] = "Question {$number} has no answer. Give the text of the correct choice.";

            return null;
        }

        if ($type === 'single_choice' && count($wanted) > 1) {
            $this->errors[] = "Question {$number} is single_choice but has ".count($wanted)
                .' answers. Use multiple_choice, or give one answer.';

            return null;
        }

        $letters = [];

        foreach ($wanted as $value) {
            $index = $this->choiceIndex($value, $choices);

            if ($index === null) {
                $this->errors[] = "Question {$number}'s answer "
                    .json_encode($value, JSON_UNESCAPED_UNICODE)
                    .' is not one of its choices. The answer must be the exact text of a choice.';

                return null;
            }

            $letters[] = chr(65 + $index);
        }

        $letters = array_values(array_unique($letters));
        sort($letters);

        if ($type === 'multiple_choice' && count($letters) < 2) {
            $this->errors[] = "Question {$number} is multiple_choice but has only one correct answer. "
                .'Use single_choice instead.';

            return null;
        }

        if (count($letters) === count($choices)) {
            $this->errors[] = "Question {$number} marks every choice correct.";

            return null;
        }

        return $letters;
    }

    /**
     * @param  mixed  $value
     * @param  array<int, string>  $choices
     */
    private function choiceIndex($value, array $choices): ?int
    {
        if (is_int($value) || is_float($value)) {
            $value = (string) $value;
        }

        if (! is_string($value)) {
            return null;
        }

        $value = trim($value);

        foreach ($choices as $index => $choice) {
            if (mb_strtolower($choice) === mb_strtolower($value)) {
                return $index;
            }
        }

        // A bare letter, or "B." / "B)".
        if (preg_match('/^([A-Za-z])[.)]?$/', $value, $matches) === 1) {
            $index = ord(strtoupper($matches[1])) - 65;

            return $index >= 0 && $index < count($choices) ? $index : null;
        }

        // A 1-based position, but only when it is not itself a choice — a
        // numbers quiz whose options are "1", "2", "3" must match by text, and
        // it already did above.
        if (preg_match('/^\d+$/', $value) === 1) {
            $index = (int) $value - 1;

            return $index >= 0 && $index < count($choices) ? $index : null;
        }

        return null;
    }

    /**
     * @param  mixed  $raw
     */
    private function trueFalse(int $number, $raw): ?string
    {
        if (is_bool($raw)) {
            return $raw ? 'True' : 'False';
        }

        $value = is_string($raw) ? mb_strtolower(trim($raw)) : '';

        if (in_array($value, ['true', 't', 'yes'], true)) {
            return 'True';
        }

        if (in_array($value, ['false', 'f', 'no'], true)) {
            return 'False';
        }

        $this->errors[] = "Question {$number} is true_false and needs an answer of \"True\" or \"False\".";

        return null;
    }

    /**
     * @param  mixed  $raw
     */
    private function shortAnswer(int $number, $raw): ?string
    {
        $values = is_array($raw) ? $raw : [$raw];

        $values = array_values(array_filter(array_map(
            fn ($value) => is_string($value) || is_numeric($value) ? trim((string) $value) : null,
            $values
        ), fn (?string $value) => $value !== null && $value !== ''));

        if ($values === []) {
            $this->errors[] = "Question {$number} is short_answer and needs an answer. "
                .'Separate acceptable alternatives with "|", or use essay for writing you will mark yourself.';

            return null;
        }

        return implode('|', $values);
    }

    /**
     * @param  array<int, string>  $choices
     * @return array<int, string>
     */
    private function labelledChoices(array $choices): array
    {
        $labelled = [];

        foreach ($choices as $index => $choice) {
            $labelled[] = chr(65 + $index).'. '.$choice;
        }

        return $labelled;
    }

    /**
     * The question set in the shape SubjectEcrItemController accepts.
     *
     * @return array<int, array<string, mixed>>
     */
    public function questions(): array
    {
        return $this->questions;
    }

    /**
     * The question set as the teacher will read it on the approval card, with
     * answers rendered back to choice text.
     *
     * @return array<int, array<string, mixed>>
     */
    public function previewQuestions(): array
    {
        return $this->previewQuestions;
    }

    public function totalPoints(): float
    {
        return $this->totalPoints;
    }

    public function addError(string $error): void
    {
        $this->errors[] = $error;
    }
}
