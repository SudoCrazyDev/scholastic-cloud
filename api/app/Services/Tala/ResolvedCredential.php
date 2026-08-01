<?php

namespace App\Services\Tala;

use App\Models\TalaCredential;
use App\Services\Ai\Chat\ChatProvider;
use App\Services\Ai\Chat\ChatProviderFactory;

/**
 * The key a request will actually use, with the plaintext already decrypted
 * and the model already resolved.
 *
 * Kept separate from the Eloquent model so nothing downstream can accidentally
 * serialise a row holding a decrypted key into a response.
 */
class ResolvedCredential
{
    public function __construct(
        public readonly string $credentialId,
        public readonly string $source,
        public readonly string $provider,
        public readonly string $model,
        private readonly string $apiKey,
        public readonly ?int $monthlyMessageLimit,
    ) {}

    public static function fromModel(TalaCredential $credential, string $apiKey): self
    {
        return new self(
            credentialId: $credential->id,
            source: $credential->source(),
            provider: $credential->provider,
            model: $credential->resolvedModel(),
            apiKey: $apiKey,
            monthlyMessageLimit: $credential->isInstitutionWide()
                ? $credential->monthly_message_limit
                : null,
        );
    }

    public function isInstitutionWide(): bool
    {
        return $this->source === TalaCredential::SOURCE_INSTITUTION;
    }

    public function provider(): ChatProvider
    {
        return ChatProviderFactory::make($this->provider, $this->apiKey, $this->model);
    }
}
