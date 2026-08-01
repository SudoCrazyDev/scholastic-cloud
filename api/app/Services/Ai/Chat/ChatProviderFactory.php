<?php

namespace App\Services\Ai\Chat;

use App\Support\TalaProviders;
use InvalidArgumentException;

/**
 * Builds the provider for one request.
 *
 * The difference from AiManager, which does the same job for the lesson
 * planner: that one reads its key out of the environment because there is one
 * key for the whole platform. Tala's key belongs to a tenant and is resolved
 * per request, so it is passed in rather than looked up here.
 */
class ChatProviderFactory
{
    public static function make(string $provider, string $apiKey, string $model): ChatProvider
    {
        $baseUrl = TalaProviders::baseUrl($provider);
        $maxTokens = (int) config('tala.max_tokens', 8000);
        $timeout = (int) config('tala.request_timeout', 180);

        return match ($provider) {
            'anthropic' => new AnthropicChatProvider(
                apiKey: $apiKey,
                model: $model,
                baseUrl: $baseUrl,
                maxTokens: $maxTokens,
                effort: (string) config('tala.effort', 'medium'),
                timeout: $timeout,
            ),

            'openai' => new OpenAiChatProvider(
                apiKey: $apiKey,
                model: $model,
                baseUrl: $baseUrl,
                maxTokens: $maxTokens,
                timeout: $timeout,
            ),

            // Unreachable through the API — credentials are validated against
            // the catalog on the way in — but a provider removed from
            // config/tala.php with rows still pointing at it would land here.
            default => throw new InvalidArgumentException("Tala has no provider named [{$provider}]."),
        };
    }
}
