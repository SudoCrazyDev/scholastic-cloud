<?php

namespace App\Services\Ai;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class OpenAiProvider implements AiProvider
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

        $schema = [
            'topics' => [
                ['title' => 'string', 'description' => 'string?', 'quarter' => 'string'],
            ],
        ];

        $prompt = <<<PROMPT
You are an education planning assistant.
Generate {$count} lesson topics for Quarter {$quarter} for "{$subjectTitle}".

Return ONLY valid JSON (no markdown) matching this shape:
{$this->jsonExample($schema)}

Rules:
- "topics" must be an array of length {$count}
- Each topic.title must be concise (<= 255 chars)
- quarter must be "{$quarter}" for every topic
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

        $schema = [
            'kind' => 'lesson',
            'objectives' => ['string', 'string'],
            'materials' => ['string', 'string'],
            'procedure' => ['string', 'string', 'string'],
            'assessment' => ['exit_ticket' => 'string'],
            'homework' => 'string',
        ];

        $prompt = <<<PROMPT
Create a DAILY LESSON PLAN for:
- Subject: "{$subjectTitle}"
- Quarter: {$quarter}
- Date: {$lessonDate}
- Topic: "{$topicTitle}"

Return ONLY valid JSON (no markdown) matching this shape:
{$this->jsonExample($schema)}

Rules:
- objectives/materials/procedure must be arrays of strings
- Keep it practical for one class session
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

        $schema = [
            'items' => [
                ['type' => 'string', 'title' => 'string', 'description' => 'string?', 'score' => 'number?'],
            ],
        ];

        $prompt = <<<PROMPT
You are an education planning assistant.
Generate assessment items for "{$subjectTitle}" Quarter {$quarter}.

Counts JSON:
{$countsJson}

Topics JSON (use these as coverage guidance):
{$topicsJson}

Return ONLY valid JSON (no markdown) matching this shape:
{$this->jsonExample($schema)}

Rules:
- type must be one of: quiz, assignment, activity, project
- Produce exactly the requested count per type
- Keep titles <= 255 chars
PROMPT;

        $json = $this->callJson($prompt);
        $data = $this->safeJsonDecode($json);
        return is_array($data) ? $data : ['items' => []];
    }

    private function callJson(string $prompt): string
    {
        // Use Responses API for modern OpenAI models.
        $url = $this->baseUrl . '/responses';
        $res = Http::withToken($this->apiKey)
            ->timeout(60)
            ->post($url, [
                'model' => $this->model,
                'input' => [
                    [
                        'role' => 'user',
                        'content' => [
                            ['type' => 'input_text', 'text' => $prompt],
                        ],
                    ],
                ],
                // Encourage strict JSON output
                'text' => ['format' => ['type' => 'json_object']],
            ]);

        if (!$res->successful()) {
            Log::warning('OpenAI request failed', ['status' => $res->status(), 'body' => $res->body()]);
            return '{}';
        }

        $body = $res->json();
        // responses API: output_text is often found under output[0].content[0].text
        $text = $body['output'][0]['content'][0]['text'] ?? null;
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

    private function jsonExample(array $schema): string
    {
        return json_encode($schema, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    }
}

