<?php

namespace App\Services\Tala;

use App\Models\TalaCredential;
use App\Models\User;
use App\Support\TalaProviders;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Decides which key answers a teacher's message.
 *
 * There is one: the school's. An administrator supplies it, chooses the model
 * the staff talk to, and carries the bill — and a teacher opens Tala and types,
 * with no setup step of their own.
 *
 * Teachers could once add a personal key, used when the school had not supplied
 * one. That fallback is gone, and its absence is worth stating plainly: when the
 * school's key is missing or parked, Tala does not answer. It does not quietly
 * find another way to bill someone.
 */
class CredentialResolver
{
    /**
     * The credential a request should use, or null when the school has supplied
     * nothing usable.
     *
     * $user is still taken, and still unused, because every caller has one and
     * the day this grows a per-teacher model preference it will need it.
     */
    public function resolve(User $user, string $institutionId, ?string $preferredProvider = null): ?ResolvedCredential
    {
        return $this->pick(
            TalaCredential::query()
                ->forInstitution($institutionId)
                ->institutionWide()
                ->get(),
            $preferredProvider,
        );
    }

    /**
     * What the chat screen should know before a teacher types: whether Tala is
     * usable at all, and on which model.
     *
     * @return array<string, mixed>
     */
    public function describe(User $user, string $institutionId): array
    {
        $active = $this->resolve($user, $institutionId);

        $institutionKeys = TalaCredential::query()
            ->forInstitution($institutionId)
            ->institutionWide()
            ->get();

        return [
            'ready' => $active !== null,
            'active_source' => $active?->source,
            'active_provider' => $active?->provider,
            'active_model' => $active?->model,
            'institution_configured' => $institutionKeys->isNotEmpty(),
            'institution_shared' => $institutionKeys->contains(fn (TalaCredential $c) => $c->isUsable()),
        ];
    }

    /**
     * Choose from a set of rows belonging to one owner.
     *
     * @param  \Illuminate\Support\Collection<int, TalaCredential>  $credentials
     */
    private function pick($credentials, ?string $preferredProvider): ?ResolvedCredential
    {
        $usable = $credentials->filter(fn (TalaCredential $c) => $c->isUsable());

        if ($usable->isEmpty()) {
            return null;
        }

        $chosen = null;

        if ($preferredProvider !== null) {
            $chosen = $usable->firstWhere('provider', $preferredProvider);
        }

        // No preference, or the preferred provider has no key here: fall to the
        // configured default provider, then to whatever this owner has.
        $chosen ??= $usable->firstWhere('provider', TalaProviders::defaultProvider())
            ?? $usable->first();

        return $this->decrypt($chosen);
    }

    /**
     * Rotating APP_KEY leaves every stored key undecryptable. Treating that as
     * "no credential" turns a platform-wide outage into a per-user prompt to
     * re-enter the key, which is the only recovery there is.
     */
    private function decrypt(TalaCredential $credential): ?ResolvedCredential
    {
        try {
            $apiKey = (string) $credential->api_key;
        } catch (Throwable $e) {
            Log::error('Tala: stored API key could not be decrypted', [
                'credential_id' => $credential->id,
                'error' => $e->getMessage(),
            ]);

            return null;
        }

        if ($apiKey === '') {
            return null;
        }

        return ResolvedCredential::fromModel($credential, $apiKey);
    }
}
