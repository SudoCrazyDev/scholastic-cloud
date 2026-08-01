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
 * The institution's key wins. A school that has set one up is paying the bill
 * and choosing the model its staff talk to; a teacher's own key is the fallback
 * for schools that have not set one up, or that have switched sharing off.
 *
 * Resolution looks only at what exists and is enabled — it never fails over to
 * a personal key because the school's key errored at runtime. A teacher whose
 * school key has expired should see "the school's key was rejected", not a
 * silent switch onto their own credit card.
 */
class CredentialResolver
{
    /**
     * The credential a request should use, or null when the school and the
     * teacher have both supplied nothing usable.
     */
    public function resolve(User $user, string $institutionId, ?string $preferredProvider = null): ?ResolvedCredential
    {
        $institution = $this->pick(
            TalaCredential::query()
                ->forInstitution($institutionId)
                ->institutionWide()
                ->get(),
            $preferredProvider,
        );

        if ($institution !== null) {
            return $institution;
        }

        return $this->pick(
            TalaCredential::query()
                ->forInstitution($institutionId)
                ->ownedBy($user->id)
                ->get(),
            $preferredProvider,
        );
    }

    /**
     * What the chat screen should tell the teacher before they type anything:
     * whether Tala is usable at all, on whose key, and whether their own key
     * is currently doing anything.
     *
     * @return array<string, mixed>
     */
    public function describe(User $user, string $institutionId): array
    {
        $active = $this->resolve($user, $institutionId);

        $ownKeys = TalaCredential::query()
            ->forInstitution($institutionId)
            ->ownedBy($user->id)
            ->get();

        $institutionKeys = TalaCredential::query()
            ->forInstitution($institutionId)
            ->institutionWide()
            ->get();

        $institutionUsable = $institutionKeys->contains(fn (TalaCredential $c) => $c->isUsable());

        return [
            'ready' => $active !== null,
            'active_source' => $active?->source,
            'active_provider' => $active?->provider,
            'active_model' => $active?->model,

            // Set when a teacher has a key that the school's key is currently
            // overriding, so the settings screen can say so rather than leave
            // them wondering why their model choice is being ignored.
            'own_key_overridden' => $institutionUsable && $ownKeys->contains(fn (TalaCredential $c) => $c->isUsable()),

            'own_keys' => $ownKeys->map->toSummary()->values()->all(),
            'institution_configured' => $institutionKeys->isNotEmpty(),
            'institution_shared' => $institutionUsable,
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
