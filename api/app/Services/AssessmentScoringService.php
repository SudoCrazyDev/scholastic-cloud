<?php

namespace App\Services;

/**
 * Shared scoring logic for student assessment attempts.
 *
 * Objective questions (true/false, choice, fill-in-the-blanks, and short answers
 * that carry an answer key) are auto-scored. Manually-graded questions
 * (essays, key-less short answers, image/video uploads) score 0 here and are
 * awarded points by a teacher through the grading flow.
 */
class AssessmentScoringService
{
    public const MANUAL_ONLY_TYPES = ['essay', 'image_upload', 'video_upload'];

    public function maxScore(array $questions): float
    {
        $sum = 0;
        foreach ($questions as $q) {
            $sum += (float) ($q['points'] ?? 1);
        }
        return $sum;
    }

    /**
     * Sum of points from auto-gradable (objective) questions the student got right.
     */
    public function objectiveScore(array $questions, array $answers): float
    {
        $score = 0;
        foreach ($questions as $i => $q) {
            $type = (string) ($q['type'] ?? 'single_choice');
            $points = (float) ($q['points'] ?? 1);
            $given = $answers[(string) $i] ?? $answers[$i] ?? null;
            if ($this->isQuestionCorrect($type, $q, $given)) {
                $score += $points;
            }
        }
        return $score;
    }

    /**
     * A question requires manual grading when it cannot be auto-checked:
     * essays and uploads always, short answers only when no answer key is set.
     */
    public function isManualQuestion(array $question): bool
    {
        $type = (string) ($question['type'] ?? 'single_choice');
        if (in_array($type, self::MANUAL_ONLY_TYPES, true)) {
            return true;
        }
        if ($type === 'short_answer') {
            $answer = $question['answer'] ?? '';
            $values = is_array($answer) ? $answer : explode('|', (string) $answer);
            $values = array_filter(
                array_map(fn ($v) => trim((string) $v), $values),
                static fn (string $v): bool => $v !== ''
            );
            return empty($values);
        }
        return false;
    }

    public function isQuestionCorrect(string $type, array $q, mixed $givenRaw): bool
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
            $correct = array_values(array_filter($correct, static fn (string $v): bool => $v !== ''));
            sort($correct);
            $given = is_array($givenRaw)
                ? array_map('trim', array_map('strtoupper', $givenRaw))
                : array_map('trim', array_map('strtoupper', explode(',', (string) $givenRaw)));
            $given = array_values(array_filter($given, static fn (string $v): bool => $v !== ''));
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
                $alternatives = array_filter(
                    array_map('trim', explode('|', (string) $correctVal)),
                    static fn (string $alt): bool => $alt !== ''
                );
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
        if ($type === 'short_answer') {
            $correctRaw = $q['answer'] ?? '';
            $correctValues = is_array($correctRaw)
                ? $correctRaw
                : explode('|', (string) $correctRaw);
            $correctValues = array_values(array_filter(
                array_map(fn ($v) => trim((string) $v), $correctValues),
                static fn (string $v): bool => $v !== ''
            ));
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
        if ($type === 'matching') {
            // Correct when every left prompt is paired with its correct right value.
            // Given is an array aligned to the pairs order: given[i] = the right value the student chose for left i.
            $pairs = $q['pairs'] ?? [];
            if (empty($pairs) || !is_array($givenRaw)) {
                return false;
            }
            foreach ($pairs as $idx => $pair) {
                $correct = trim((string) ($pair['right'] ?? ''));
                $given = trim((string) ($givenRaw[$idx] ?? $givenRaw[(string) $idx] ?? ''));
                if ($given === '' || strcasecmp($correct, $given) !== 0) {
                    return false;
                }
            }
            return true;
        }
        if ($type === 'drag_picture') {
            // Correct when every card is dropped on its assigned target.
            // Given is a map of cardId => targetId.
            $cards = $q['cards'] ?? [];
            if (empty($cards) || !is_array($givenRaw)) {
                return false;
            }
            foreach ($cards as $card) {
                $cardId = (string) ($card['id'] ?? '');
                $correctTarget = (string) ($card['targetId'] ?? '');
                $given = trim((string) ($givenRaw[$cardId] ?? ''));
                if ($given === '' || $given !== $correctTarget) {
                    return false;
                }
            }
            return true;
        }
        // essay, image_upload, video_upload: graded manually.
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
}
