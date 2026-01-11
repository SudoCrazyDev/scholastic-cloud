<?php

namespace App\Services\Ai;

interface AiProvider
{
    /**
     * Generate topic suggestions (no persistence).
     *
     * @return array{topics: array<int, array{title: string, description?: string, quarter: string}>}
     */
    public function generateTopics(array $input): array;

    /**
     * Generate a lesson plan content payload for a single date/topic.
     *
     * @return array Arbitrary JSON-serializable structure stored in lesson_plans.content
     */
    public function generateLessonPlanContent(array $input): array;

    /**
     * Generate assessment item payloads (no persistence).
     *
     * @return array{items: array<int, array{type: string, title: string, description?: string, score?: float|int}>}
     */
    public function generateAssessments(array $input): array;
}

