<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

class AiAssistantController extends Controller
{
    public function assist(Request $request)
    {
        $data = $request->validate([
            'prompt' => ['required', 'string', 'max:4000'],
            'tone' => ['nullable', 'string', 'max:40'],
            'context' => ['nullable', 'string', 'max:4000'],
        ]);

        $provider = (string) config('services.ai.provider', 'openai_compatible');
        $baseUrl = rtrim((string) config('services.ai.base_url', 'https://api.openai.com/v1'), '/');
        $apiKey = (string) config('services.ai.api_key', '');
        $model = (string) config('services.ai.model', 'gpt-4o-mini');

        if ($apiKey === '') {
            return response()->json([
                'message' => 'AI provider is not configured. Set AI_API_KEY (and optionally AI_BASE_URL / AI_MODEL).',
            ], 501);
        }

        $tone = isset($data['tone']) ? trim($data['tone']) : '';
        $context = isset($data['context']) ? trim($data['context']) : '';
        $prompt = trim($data['prompt']);

        $systemParts = [
            'You are an assistant for the ScholasticCloud platform.',
            'Be helpful, safe, and concise.',
            'If the user asks for sensitive data or credentials, refuse.',
        ];

        if ($tone !== '') {
            $systemParts[] = "Tone: {$tone}.";
        }

        if ($context !== '') {
            $systemParts[] = "Context:\n{$context}";
        }

        $system = implode("\n", $systemParts);

        $payload = [
            'model' => $model,
            'messages' => [
                ['role' => 'system', 'content' => $system],
                ['role' => 'user', 'content' => $prompt],
            ],
            'temperature' => 0.3,
        ];

        try {
            $response = Http::acceptJson()
                ->withToken($apiKey)
                ->timeout(30)
                ->post("{$baseUrl}/chat/completions", $payload);
        } catch (\Throwable $e) {
            return response()->json([
                'message' => 'AI request failed.',
                'error' => $e->getMessage(),
            ], 502);
        }

        if (!$response->successful()) {
            return response()->json([
                'message' => 'AI provider returned an error.',
                'status' => $response->status(),
                'error' => $response->json() ?? $response->body(),
            ], 502);
        }

        $text = (string) data_get($response->json(), 'choices.0.message.content', '');
        $text = trim($text);

        if ($text === '') {
            return response()->json([
                'message' => 'AI provider response was missing generated text.',
                'request_id' => Str::uuid()->toString(),
            ], 502);
        }

        return response()->json([
            'text' => $text,
            'provider' => $provider,
            'model' => $model,
        ]);
    }
}

