<?php

namespace App\Services\Ai;

class MockAiProvider implements AiProvider
{
    public function generateTopics(array $input): array
    {
        $subjectTitle = $input['subject_title'] ?? 'the subject';
        $quarter = (string)($input['quarter'] ?? '1');
        $count = (int)($input['count'] ?? 10);
        $count = max(1, min(50, $count));

        $topics = [];
        for ($i = 1; $i <= $count; $i++) {
            $topics[] = [
                'title' => "Topic {$i}: {$subjectTitle}",
                'description' => "Quarter {$quarter} topic for {$subjectTitle}.",
                'quarter' => $quarter,
            ];
        }

        return ['topics' => $topics];
    }

    public function generateLessonPlanContent(array $input): array
    {
        $topicTitle = $input['topic_title'] ?? 'Topic';
        $lessonDate = $input['lesson_date'] ?? null;

        return [
            'kind' => 'lesson',
            'lesson_date' => $lessonDate,
            'objectives' => [
                "Understand key ideas from '{$topicTitle}'.",
                "Apply the lesson through guided practice.",
            ],
            'materials' => [
                "Learner's material / textbook",
                'Board/markers or slides',
            ],
            'procedure' => [
                'Review',
                'Motivation',
                'Discussion / demonstration',
                'Guided practice',
                'Independent practice',
                'Wrap-up',
            ],
            'assessment' => [
                'exit_ticket' => 'Short formative check (5 items).',
            ],
            'homework' => 'Practice exercises related to the topic.',
        ];
    }

    public function generateAssessments(array $input): array
    {
        $quarter = (string)($input['quarter'] ?? '1');
        $counts = $input['counts'] ?? [];
        $topics = $input['topics'] ?? [];

        $topicTitles = array_values(array_filter(array_map(fn ($t) => is_array($t) ? ($t['title'] ?? null) : null, $topics)));
        $topicCount = max(1, count($topicTitles));

        $items = [];
        $make = function (string $type, int $count, float $defaultScore) use (&$items, $quarter, $topicTitles, $topicCount) {
            for ($i = 1; $i <= $count; $i++) {
                $topicTitle = !empty($topicTitles) ? $topicTitles[($i - 1) % $topicCount] : null;
                $items[] = [
                    'type' => $type,
                    'title' => ucfirst($type) . " {$i}" . ($topicTitle ? ": {$topicTitle}" : ''),
                    'description' => "Quarter {$quarter} {$type}." . ($topicTitle ? " Focus: {$topicTitle}." : ''),
                    'score' => $defaultScore,
                ];
            }
        };

        $make('quiz', (int)($counts['quizzes'] ?? 0), 10);
        $make('assignment', (int)($counts['assignments'] ?? 0), 20);
        $make('activity', (int)($counts['activities'] ?? 0), 10);
        $make('project', (int)($counts['projects'] ?? 0), 50);

        return ['items' => $items];
    }
}

