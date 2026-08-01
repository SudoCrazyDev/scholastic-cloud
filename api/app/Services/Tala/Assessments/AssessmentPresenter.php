<?php

namespace App\Services\Tala\Assessments;

use App\Models\SubjectEcrItem;
use App\Services\Tala\SectionLabel;
use App\Services\Tala\Tools\LessonText;
use App\Support\GradingPeriods;

/**
 * Reading a stored assessment back out for the model or the approval card.
 *
 * Two conversions matter here, both inverses of what AssessmentSpec does on the
 * way in:
 *
 *   - Question prompts may contain editor HTML, including `<img>` tags whose
 *     `src` is a signed media link. The prompt is flattened to text and the
 *     images are reported as a count, so a private URL does not travel to a
 *     model provider.
 *   - Answer keys for choice questions are stored as letters. A letter alone
 *     tells a teacher nothing on a card and gives the model nothing to reason
 *     about, so it is rendered back against the choice list.
 */
class AssessmentPresenter
{
    private const MAX_PROMPT_CHARS = 600;

    /**
     * One line per assessment, for a list.
     *
     * @return array<string, mixed>
     */
    public static function summary(SubjectEcrItem $item, ?string $periodType = null, ?int $attempts = null): array
    {
        $subject = $item->subject;
        $questions = $item->resolvedQuestions();

        return array_filter([
            'title' => $item->title,
            'type' => $item->type,
            'status' => $item->status,
            'subject' => $subject?->title,
            'section' => SectionLabel::for($subject?->classSection),
            'grading_period' => $item->quarter
                ? GradingPeriods::noun($periodType).' '.$item->quarter
                : null,
            'academic_year' => $item->academic_year,
            'questions' => count($questions),
            'total_points' => $item->score !== null ? (float) $item->score : null,
            'component' => $item->subjectEcr?->title,
            'scheduled_date' => $item->scheduled_date?->format('Y-m-d'),
            'due_at' => $item->due_at?->format('Y-m-d H:i'),
            'student_attempts' => $attempts,
            'content_version' => (int) $item->content_version,
        ], fn ($value) => $value !== null && $value !== []);
    }

    /**
     * Every question, readable.
     *
     * @return array<int, array<string, mixed>>
     */
    public static function questions(SubjectEcrItem $item): array
    {
        $rendered = [];

        foreach ($item->resolvedQuestions() as $index => $question) {
            if (! is_array($question)) {
                continue;
            }

            $choices = self::choiceList($question);

            $rendered[] = array_filter([
                'number' => $index + 1,
                'type' => $question['type'] ?? null,
                'question' => LessonText::plain(
                    is_string($question['question'] ?? null) ? $question['question'] : null,
                    self::MAX_PROMPT_CHARS
                ),
                'images' => self::imageCount($question),
                'choices' => $choices === [] ? null : self::labelled($choices),
                'answer' => self::readableAnswer($question, $choices),
                'points' => isset($question['points']) ? (float) $question['points'] : null,
            ], fn ($value) => $value !== null && $value !== []);
        }

        return $rendered;
    }

    /**
     * The answer key as a teacher would read it.
     *
     * @param  array<string, mixed>  $question
     * @param  array<int, string>  $choices
     */
    public static function readableAnswer(array $question, array $choices): ?string
    {
        $type = $question['type'] ?? null;

        if (in_array($type, AssessmentTypes::MANUAL_TYPES, true)) {
            return 'Marked by the teacher';
        }

        $answer = $question['answer'] ?? null;

        if ($answer === null || $answer === '' || $answer === []) {
            // Short answers without a key are marked by hand by design; anything
            // else missing a key cannot be auto-scored and the teacher should
            // know that rather than see a blank.
            return $type === 'short_answer' ? 'Marked by the teacher (no key set)' : null;
        }

        if (in_array($type, AssessmentTypes::CHOICE_TYPES, true) && $choices !== []) {
            $values = is_array($answer) ? $answer : [$answer];
            $readable = [];

            foreach ($values as $value) {
                if (! is_string($value) && ! is_numeric($value)) {
                    continue;
                }

                $value = trim((string) $value);
                $index = preg_match('/^([A-Za-z])$/', $value) === 1
                    ? ord(strtoupper($value)) - 65
                    : null;

                $readable[] = $index !== null && isset($choices[$index])
                    ? $value.'. '.$choices[$index]
                    // A key stored as text rather than a letter. Kept visible
                    // rather than hidden — see AssessmentSpec for why such a key
                    // does not score the way its author expects.
                    : $value;
            }

            return $readable === [] ? null : implode(', ', $readable);
        }

        if (is_array($answer)) {
            $answer = implode(', ', array_map(fn ($value) => (string) $value, $answer));
        }

        return str_replace('|', ' / ', (string) $answer);
    }

    /**
     * @param  array<string, mixed>  $question
     * @return array<int, string>
     */
    public static function choiceList(array $question): array
    {
        $choices = $question['choices'] ?? null;

        if (! is_array($choices)) {
            return [];
        }

        return array_values(array_map(
            fn ($choice) => is_string($choice) ? $choice : (is_numeric($choice) ? (string) $choice : ''),
            $choices
        ));
    }

    /**
     * @param  array<int, string>  $choices
     * @return array<int, string>
     */
    public static function labelled(array $choices): array
    {
        $labelled = [];

        foreach ($choices as $index => $choice) {
            $labelled[] = chr(65 + $index).'. '.$choice;
        }

        return $labelled;
    }

    /**
     * Editor images in a prompt, reported as a count.
     *
     * Their `src` is a signed link to private media and does not leave the
     * server — but a question that leans on a diagram reads as nonsense without
     * one, so the model is told the picture exists.
     *
     * @param  array<string, mixed>  $question
     */
    private static function imageCount(array $question): ?int
    {
        $prompt = is_string($question['question'] ?? null) ? $question['question'] : '';
        $count = preg_match_all('/<img\b/i', $prompt);

        $choiceImages = $question['choiceImages'] ?? null;

        if (is_array($choiceImages)) {
            $count += count(array_filter($choiceImages, fn ($url) => is_string($url) && trim($url) !== ''));
        }

        return $count > 0 ? $count : null;
    }
}
