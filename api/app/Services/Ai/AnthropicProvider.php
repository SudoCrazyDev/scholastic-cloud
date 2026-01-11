<?php

namespace App\Services\Ai;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class AnthropicProvider implements AiProvider
{
    private string $apiKey;
    private string $model;
    private string $baseUrl;

    public function __construct(string $apiKey, string $model, string $baseUrl)
    {
        $this->apiKey = $apiKey;
        $this->model = $model;
        $this->baseUrl = rtrim($baseUrl, '/');
    }

    public function generateTopics(array $input): array
    {
        $subjectTitle = (string)($input['subject_title'] ?? 'the subject');
        $quarter = (string)($input['quarter'] ?? '1');
        $count = (int)($input['count'] ?? 10);
        $count = max(1, min(50, $count));

        $prompt = <<<PROMPT
Generate {$count} lesson topics for Quarter {$quarter} for "{$subjectTitle}".

Return ONLY valid JSON (no markdown) with:
{"topics":[{"title":"...","description":"...","quarter":"{$quarter}"}]}

Rules:
- topics array length must be {$count}
- title <= 255 chars
PROMPT;

        $json = $this->callJson($prompt);
        $data = $this->safeJsonDecode($json);
        return is_array($data) ? $data : ['topics' => []];
    }

    public function generateLessonPlanContent(array $input): array
    {
        $subjectTitle = (string)($input['subject_title'] ?? 'the subject');
        $quarter = (string)($input['quarter'] ?? '1');
        $lessonDate = (string)($input['lesson_date'] ?? '');
        $topicTitle = (string)($input['topic_title'] ?? 'Topic');

        $prompt = <<<PROMPT
Create a DAILY LESSON PLAN for:
- Subject: "{$subjectTitle}"
- Quarter: {$quarter}
- Date: {$lessonDate}
- Topic: "{$topicTitle}"

Return ONLY valid JSON (no markdown) with keys:
kind (must be "lesson"), objectives (array of strings), materials (array of strings), procedure (array of strings), assessment (object), homework (string)
PROMPT;

        $json = $this->callJson($prompt);
        $data = $this->safeJsonDecode($json);
        return is_array($data) ? $data : [];
    }

    public function generateAssessments(array $input): array
    {
        $subjectTitle = (string)($input['subject_title'] ?? 'the subject');
        $quarter = (string)($input['quarter'] ?? '1');
        $counts = $input['counts'] ?? [];
        $topics = $input['topics'] ?? [];

        $countsJson = json_encode($counts, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        $topicsJson = json_encode($topics, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

        $prompt = <<<PROMPT
Generate assessment items for "{$subjectTitle}" Quarter {$quarter}.

Counts JSON:
{$countsJson}

Topics JSON:
{$topicsJson}

Return ONLY valid JSON (no markdown) with:
{"items":[{"type":"quiz|assignment|activity|project","title":"...","description":"...","score":10}]}

Rules:
- Produce exactly the requested count per type
- title <= 255 chars
PROMPT;

        $json = $this->callJson($prompt);
        $data = $this->safeJsonDecode($json);
        return is_array($data) ? $data : ['items' => []];
    }

    private function callJson(string $prompt): string
    {
        // Anthropic Messages API
        $url = $this->baseUrl . '/v1/messages';
        $res = Http::withHeaders([
                'x-api-key' => $this->apiKey,
                'anthropic-version' => '2023-06-01',
                'content-type' => 'application/json',
            ])
            ->timeout(60)
            ->post($url, [
                'model' => $this->model,
                'max_tokens' => 2048,
                'messages' => [
                    ['role' => 'user', 'content' => $prompt],
                ],
            ]);

        if (!$res->successful()) {
            Log::warning('Anthropic request failed', ['status' => $res->status(), 'body' => $res->body()]);
            return '{}';
        }

        $body = $res->json();
        $text = $body['content'][0]['text'] ?? null;
        return is_string($text) ? $text : '{}';
    }

    private function safeJsonDecode(string $json): mixed
    {
        try {
            $decoded = json_decode($json, true, 512, JSON_THROW_ON_ERROR);
            return $decoded;
        } catch (\Throwable) {
            return null;
        }
    }
}

