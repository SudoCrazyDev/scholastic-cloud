<?php

namespace App\Services\Ai;

class AiManager
{
    public static function make(): AiProvider
    {
        $provider = (string)config('ai.provider', 'openai');

        if ($provider === 'openai') {
            $key = (string)config('ai.openai.api_key');
            if (!empty($key)) {
                return new OpenAiProvider(
                    $key,
                    (string)config('ai.openai.model', 'gpt-4.1-mini'),
                    (string)config('ai.openai.base_url', 'https://api.openai.com/v1')
                );
            }
        }

        if ($provider === 'anthropic') {
            $key = (string)config('ai.anthropic.api_key');
            if (!empty($key)) {
                return new AnthropicProvider(
                    $key,
                    (string)config('ai.anthropic.model', 'claude-3-5-sonnet-latest'),
                    (string)config('ai.anthropic.base_url', 'https://api.anthropic.com')
                );
            }
        }

        // Fallback
        return new MockAiProvider();
    }
}

