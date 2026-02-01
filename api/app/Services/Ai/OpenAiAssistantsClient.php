<?php

namespace App\Services\Ai;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * OpenAI Assistants API client: create thread, add message, run assistant, return response text.
 * Used for RAG when an Assistant has file_search and uploaded files (e.g. MATATAG curriculum).
 */
class OpenAiAssistantsClient
{
    private string $apiKey;

    private string $baseUrl;

    /** Header required by OpenAI for Assistants API access. */
    private const BETA_HEADER = 'OpenAI-Beta';

    private const BETA_VALUE = 'assistants=v2';

    public function __construct(string $apiKey, string $baseUrl)
    {
        $this->apiKey = $apiKey;
        $this->baseUrl = rtrim($baseUrl, '/');
    }

    private function http(): \Illuminate\Http\Client\PendingRequest
    {
        return Http::withToken($this->apiKey)
            ->withHeaders([self::BETA_HEADER => self::BETA_VALUE]);
    }

    /**
     * Run the assistant with one user message and return the assistant's reply text.
     *
     * @param string $assistantId Assistant ID (e.g. asst_xxx)
     * @param string $userMessage  User message content
     * @param int    $timeoutSeconds Max seconds to poll for run completion
     * @return string Assistant reply text, or empty string on failure
     */
    public function runAndGetResponse(string $assistantId, string $userMessage, int $timeoutSeconds = 120): string
    {
        $threadId = $this->createThread();
        if ($threadId === '') {
            Log::warning('OpenAI Assistants: createThread failed');
            return '';
        }

        if (!$this->addMessage($threadId, $userMessage)) {
            Log::warning('OpenAI Assistants: addMessage failed', ['thread_id' => $threadId]);
            return '';
        }

        $runId = $this->createRun($threadId, $assistantId);
        if ($runId === '') {
            Log::warning('OpenAI Assistants: createRun failed', ['thread_id' => $threadId]);
            return '';
        }

        $completed = $this->pollRunUntilComplete($threadId, $runId, $timeoutSeconds);
        if (!$completed) {
            Log::warning('OpenAI Assistants: run did not complete', ['thread_id' => $threadId, 'run_id' => $runId]);
            return '';
        }

        $text = $this->getLatestAssistantMessageText($threadId);
        if ($text === '') {
            Log::warning('OpenAI Assistants: no assistant message text', ['thread_id' => $threadId]);
        }
        return $text;
    }

    private function createThread(): string
    {
        $res = $this->http()
            ->timeout(30)
            ->post($this->baseUrl . '/threads', []);

        if (!$res->successful()) {
            Log::warning('OpenAI Assistants createThread failed', ['status' => $res->status(), 'body' => $res->body()]);
            return '';
        }

        $id = $res->json('id');
        return \is_string($id) ? $id : '';
    }

    private function addMessage(string $threadId, string $content): bool
    {
        $res = $this->http()
            ->timeout(30)
            ->post($this->baseUrl . '/threads/' . $threadId . '/messages', [
                'role' => 'user',
                'content' => $content,
            ]);

        if (!$res->successful()) {
            Log::warning('OpenAI Assistants addMessage failed', ['status' => $res->status(), 'body' => $res->body()]);
            return false;
        }

        return true;
    }

    private function createRun(string $threadId, string $assistantId): string
    {
        $res = $this->http()
            ->timeout(30)
            ->post($this->baseUrl . '/threads/' . $threadId . '/runs', [
                'assistant_id' => $assistantId,
            ]);

        if (!$res->successful()) {
            Log::warning('OpenAI Assistants createRun failed', ['status' => $res->status(), 'body' => $res->body()]);
            return '';
        }

        $id = $res->json('id');
        return \is_string($id) ? $id : '';
    }

    private function pollRunUntilComplete(string $threadId, string $runId, int $timeoutSeconds): bool
    {
        $deadline = time() + $timeoutSeconds;
        while (time() < $deadline) {
            $res = $this->http()
                ->timeout(15)
                ->get($this->baseUrl . '/threads/' . $threadId . '/runs/' . $runId);

            if (!$res->successful()) {
                Log::warning('OpenAI Assistants getRun failed', ['status' => $res->status()]);
                return false;
            }

            $status = $res->json('status');
            if ($status === 'completed') {
                return true;
            }
            if (\in_array($status, ['failed', 'cancelled', 'expired'], true)) {
                Log::warning('OpenAI Assistants run ended without completion', ['status' => $status]);
                return false;
            }

            sleep(1);
        }

        Log::warning('OpenAI Assistants run polling timed out');
        return false;
    }

    private function getLatestAssistantMessageText(string $threadId): string
    {
        $res = $this->http()
            ->timeout(15)
            ->get($this->baseUrl . '/threads/' . $threadId . '/messages', ['order' => 'desc', 'limit' => 20]);

        if (!$res->successful()) {
            Log::warning('OpenAI Assistants listMessages failed', ['status' => $res->status()]);
            return '';
        }

        $data = $res->json();
        $messages = $data['data'] ?? [];
        if (!\is_array($messages)) {
            return '';
        }

        foreach ($messages as $msg) {
            if (($msg['role'] ?? '') !== 'assistant') {
                continue;
            }
            $content = $msg['content'] ?? [];
            if (!\is_array($content)) {
                continue;
            }
            $parts = [];
            foreach ($content as $block) {
                if (($block['type'] ?? '') === 'text' && isset($block['text']['value'])) {
                    $parts[] = $block['text']['value'];
                }
            }
            if ($parts !== []) {
                return implode("\n", $parts);
            }
        }

        return '';
    }
}
