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
        $gradeLevel = $input['grade_level'] ?? null;

        $schema = [
            'topics' => [
                ['title' => 'string', 'description' => 'string?', 'quarter' => 'string'],
            ],
        ];

        $gradeLevelContext = $gradeLevel ? " for Grade {$gradeLevel}" : '';

        $prompt = <<<PROMPT
You are an education planning assistant specializing in the Philippine K-12 curriculum.
Generate {$count} lesson topics for Quarter {$quarter} for "{$subjectTitle}"{$gradeLevelContext}.

Context:
- Follow the Philippine Department of Education (DepEd) K-12 curriculum standards
- Topics should be age-appropriate and aligned with Philippine educational competencies
- Consider the local Philippine context and examples where relevant
- Ensure progression and scaffolding appropriate for the grade level

Return ONLY valid JSON (no markdown) matching this shape:
{$this->jsonExample($schema)}

Rules:
- "topics" must be an array of length {$count}
- Each topic.title must be concise (<= 255 chars)
- Each topic.description should provide context relevant to Philippine students
- quarter must be "{$quarter}" for every topic
- Topics should follow a logical sequence building from foundational to advanced concepts
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
        $gradeLevel = $input['grade_level'] ?? null;

        $schema = [
            'kind' => 'lesson',
            'week' => 'string?',
            'learning_objectives' => ['string', 'string', 'string'],
            'subject_matter' => [
                'topic' => 'string',
                'materials' => ['string', 'string'],
                'references' => ['string'],
            ],
            'procedure' => [
                'introduction' => [
                    'time_minutes' => 'number',
                    'activity_name' => 'string',
                    'steps' => ['string', 'string'],
                ],
                'presentation' => [
                    'time_minutes' => 'number',
                    'discussion_points' => ['string', 'string', 'string'],
                ],
                'guided_practice' => [
                    'time_minutes' => 'number',
                    'activity_name' => 'string',
                    'instructions' => ['string', 'string'],
                ],
                'independent_practice' => [
                    'time_minutes' => 'number',
                    'activity_name' => 'string',
                    'tasks' => ['string', 'string'],
                ],
                'generalization' => [
                    'time_minutes' => 'number',
                    'key_questions' => ['string', 'string'],
                ],
            ],
            'evaluation' => [
                'type' => 'string',
                'items' => [
                    ['question' => 'string', 'choices' => ['A. string', 'B. string'], 'answer' => 'string'],
                ],
            ],
            'assignment' => 'string',
        ];

        $gradeLevelContext = $gradeLevel ? "\n- Grade Level: {$gradeLevel}" : '';

        $prompt = <<<PROMPT
Create a DETAILED LESSON PLAN following the Philippine DepEd K-12 format for:
- Subject: "{$subjectTitle}"
- Quarter: {$quarter}
- Date: {$lessonDate}
- Topic: "{$topicTitle}"{$gradeLevelContext}

IMPORTANT: Follow the exact DepEd DLP (Detailed Lesson Plan) structure with these sections:

I. LEARNING OBJECTIVES
- Write 3-4 specific, measurable objectives using action verbs (define, describe, compute, illustrate, appreciate, etc.)
- Format: "At the end of the lesson, learners are expected to:"
- Consider cognitive, psychomotor, and affective domains

II. SUBJECT MATTER
- Clearly state the topic
- List concrete materials needed (books, manipulatives, ICT tools, etc.)
- Cite specific references (Learner's Module, page numbers, Curriculum Guide)

III. PROCEDURE (Total: 45-60 minutes)
A. Introduction (5-10 min) - Hook/Motivation
   - Activity name with clear steps
   - Include questions to activate prior knowledge
   - Connect to real-life scenarios relevant to Filipino students

B. Presentation/Discussion (15-20 min)
   - Present key concepts with numbered points
   - Use examples from Philippine context
   - Include formulas, definitions, or diagrams as needed

C. Guided Practice (15-20 min)
   - Group activity with clear instructions
   - Include collaboration and teacher guidance
   - May include a table or graphic organizer

D. Independent Practice (10-15 min)
   - Individual worksheet or problem-solving tasks
   - 3-5 application questions or exercises

E. Generalization (5 min)
   - 2-3 key reflection questions
   - Synthesis of main ideas

IV. EVALUATION
- Include 5 multiple-choice items OR short answer questions
- Test understanding of the lesson objectives
- Provide clear question format with choices (A, B, C, D) and correct answers

V. ASSIGNMENT
- Practical, home-based task that reinforces the lesson
- Should be doable without excessive resources

Context & Guidelines:
- Use Filipino context, examples, and culturally appropriate scenarios
- Align with DepEd K-12 competencies and standards
- Time allocations should fit a typical 45-60 minute class period
- Activities should be engaging, developmentally appropriate, and practical
- Include formative assessment throughout (not just at the end)

Return ONLY valid JSON (no markdown) matching this structure:
{$this->jsonExample($schema)}

Rules:
- All arrays must contain actual content (no empty arrays)
- Time allocations must be reasonable and sum to 45-60 minutes
- Evaluation items must include full questions, choices, and correct answers
- Use clear, professional language suitable for a DepEd lesson plan
PROMPT;

        $json = $this->callJson($prompt);
        $data = $this->safeJsonDecode($json);
        return is_array($data) ? $data : [];
    }

    public function generateAssessments(array $input): array
    {
        $subjectTitle = (string)($input['subject_title'] ?? 'the subject');
        $quarter = (string)($input['quarter'] ?? '1');
        $gradeLevel = $input['grade_level'] ?? null;
        $counts = $input['counts'] ?? [];
        $topics = $input['topics'] ?? [];

        $countsJson = json_encode($counts, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        $topicsJson = json_encode($topics, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

        $schema = [
            'items' => [
                [
                    'type' => 'string',
                    'title' => 'string',
                    'description' => 'string?',
                    'score' => 'number?',
                    'questions' => [
                        [
                            'question' => 'string',
                            'choices' => ['A. string', 'B. string', 'C. string', 'D. string'],
                            'answer' => 'string',
                        ],
                    ],
                ],
            ],
        ];

        $gradeLevelContext = $gradeLevel ? " for Grade {$gradeLevel}" : '';

        $prompt = <<<PROMPT
You are an education planning assistant specializing in the Philippine K-12 curriculum.
Generate assessment items for "{$subjectTitle}" Quarter {$quarter}{$gradeLevelContext}.

Context:
- Follow Philippine DepEd assessment standards and best practices
- Ensure assessments align with DepEd competencies
- Make assessments culturally appropriate for Filipino students
- Consider the cognitive level appropriate for the grade

Counts JSON:
{$countsJson}

Topics JSON (use these as coverage guidance):
{$topicsJson}

IMPORTANT: For QUIZZES and ACTIVITIES, you MUST include actual test questions with choices and answers.

Return ONLY valid JSON (no markdown) matching this shape:
{$this->jsonExample($schema)}

Rules:
- type must be one of: quiz, assignment, activity, project
- Produce exactly the requested count per type
- Keep titles <= 255 chars
- Descriptions should explain what students will do and what skills they'll demonstrate
- Distribute assessment items across the provided topics
- Suggest reasonable scores based on complexity (quizzes: 10-20, assignments: 20-40, activities: 10-30, projects: 40-100)

CRITICAL - Questions Array:
- For type="quiz": MUST include "questions" array with 5-10 multiple-choice items
- For type="activity": SHOULD include "questions" array with 3-5 items (if appropriate)
- For type="assignment" or "project": "questions" array is OPTIONAL (can be empty or omitted)
- Each question MUST have:
  - question: The actual question text (clear, grade-appropriate)
  - choices: Array of 4 choices formatted as "A. answer", "B. answer", "C. answer", "D. answer"
  - answer: The correct answer (e.g., "A", "B", "C", or "D")
- Questions should test understanding of the topic/lesson objectives
- Use Filipino context in questions (names, places, situations)
- Vary difficulty levels (remembering, understanding, applying)
- Ensure only ONE correct answer per question
- Make distractors (wrong choices) plausible but clearly incorrect

Example Quiz Item:
{
  "type": "quiz",
  "title": "Quiz 1: Basic Operations in Mathematics",
  "description": "A 10-item quiz covering addition, subtraction, multiplication, and division of whole numbers",
  "score": 10,
  "questions": [
    {
      "question": "What is the sum of 25 and 37?",
      "choices": ["A. 52", "B. 62", "C. 72", "D. 82"],
      "answer": "B"
    },
    {
      "question": "Maria bought 3 notebooks for ₱15 each. How much did she spend in total?",
      "choices": ["A. ₱30", "B. ₱35", "C. ₱45", "D. ₱50"],
      "answer": "C"
    }
  ]
}
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

