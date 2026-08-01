<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\AuthorizesModuleAccess;
use App\Models\TalaCredential;
use App\Services\Tala\CredentialResolver;
use App\Services\Tala\UsageGuard;
use App\Support\TalaProviders;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * The keys Tala runs on: the institution's, and a teacher's own.
 *
 * No endpoint here ever returns a stored key. Responses carry the provider, the
 * model and the last four characters — enough for a teacher to recognise which
 * key is in place, and nothing an attacker with a stolen session could use.
 */
class TalaCredentialController extends Controller
{
    use AuthorizesModuleAccess;

    public function __construct(
        private readonly CredentialResolver $resolver,
        private readonly UsageGuard $usage,
    ) {}

    /**
     * Everything the chat and settings screens need before a teacher types:
     * which providers exist, whose key is answering, and how much of the
     * school's allowance they have left.
     */
    public function config(Request $request): JsonResponse
    {
        if ($response = $this->resolveRequestedInstitution($request, $institutionId)) {
            return $response;
        }

        if ($response = $this->resolveStaff($request, $user)) {
            return $response;
        }
        $state = $this->resolver->describe($user, $institutionId);
        $active = $this->resolver->resolve($user, $institutionId);

        return response()->json([
            'success' => true,
            'data' => array_merge($state, [
                'providers' => TalaProviders::catalog(),
                'can_configure_institution' => $user->hasModuleAccess('tala', 'configure', $institutionId),
                'usage' => $this->usage->status(
                    $institutionId,
                    $user->id,
                    $active?->isInstitutionWide() ? $active->monthlyMessageLimit : null,
                ),
            ]),
        ]);
    }

    /**
     * Save the signed-in teacher's own key.
     *
     * Accepted even when the school has a key in place — it simply sits unused
     * until the school's key is removed or unshared. Refusing to store it would
     * mean a teacher has to come back and re-enter it at exactly the moment the
     * school's key stops working.
     */
    public function storeOwn(Request $request): JsonResponse
    {
        if ($response = $this->resolveRequestedInstitution($request, $institutionId)) {
            return $response;
        }

        if ($response = $this->resolveStaff($request, $user)) {
            return $response;
        }
        $validated = $this->validateCredential($request);

        $credential = $this->upsert($institutionId, $user->id, $validated, $user->id);

        return response()->json([
            'success' => true,
            'message' => 'Your API key has been saved.',
            'data' => $credential->toSummary(),
            'meta' => [
                // Say so plainly rather than let them wonder why their model
                // choice is being ignored.
                'overridden_by_institution' => $this->resolver->describe($user, $institutionId)['own_key_overridden'],
            ],
        ]);
    }

    public function destroyOwn(Request $request, string $provider): JsonResponse
    {
        if ($response = $this->resolveRequestedInstitution($request, $institutionId)) {
            return $response;
        }

        if ($response = $this->resolveStaff($request, $user)) {
            return $response;
        }

        TalaCredential::query()
            ->forInstitution($institutionId)
            ->ownedBy($user->id)
            ->where('provider', $provider)
            ->delete();

        return response()->json([
            'success' => true,
            'message' => 'Your API key has been removed.',
        ]);
    }

    /**
     * The school's keys. Gated on `tala.configure`.
     */
    public function indexInstitution(Request $request): JsonResponse
    {
        if ($response = $this->resolveRequestedInstitution($request, $institutionId)) {
            return $response;
        }

        $credentials = TalaCredential::query()
            ->forInstitution($institutionId)
            ->institutionWide()
            ->get();

        return response()->json([
            'success' => true,
            'data' => $credentials->map->toSummary()->values(),
            'meta' => [
                'providers' => TalaProviders::catalog(),
                'default_monthly_message_limit' => (int) config('tala.default_monthly_message_limit'),
            ],
        ]);
    }

    public function storeInstitution(Request $request): JsonResponse
    {
        if ($response = $this->resolveRequestedInstitution($request, $institutionId)) {
            return $response;
        }

        if ($response = $this->resolveStaff($request, $user)) {
            return $response;
        }

        $validated = $this->validateCredential($request, $request->validate([
            'shared_with_staff' => ['sometimes', 'boolean'],
            'monthly_message_limit' => ['sometimes', 'nullable', 'integer', 'min:1', 'max:100000'],
        ]));

        $credential = $this->upsert($institutionId, null, $validated, $user->id);

        return response()->json([
            'success' => true,
            'message' => 'The institution API key has been saved.',
            'data' => $credential->toSummary(),
        ]);
    }

    public function destroyInstitution(Request $request, string $provider): JsonResponse
    {
        if ($response = $this->resolveRequestedInstitution($request, $institutionId)) {
            return $response;
        }

        TalaCredential::query()
            ->forInstitution($institutionId)
            ->institutionWide()
            ->where('provider', $provider)
            ->delete();

        return response()->json([
            'success' => true,
            'message' => 'The institution API key has been removed. Teachers with their own key will fall back to it.',
        ]);
    }

    /**
     * @param  array<string, mixed>  $extra
     * @return array<string, mixed>
     */
    private function validateCredential(Request $request, array $extra = []): array
    {
        $validated = $request->validate([
            'provider' => ['required', 'string', Rule::in(TalaProviders::keys())],
            // Length bounds only. Whether the key actually works is the
            // provider's call, and it is answered the first time a teacher
            // sends a message — the error surfaces in the chat, which is where
            // they are looking.
            'api_key' => ['required', 'string', 'min:16', 'max:400'],
            'model' => ['sometimes', 'nullable', 'string'],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        if (filled($validated['model'] ?? null)
            && ! TalaProviders::supportsModel($validated['provider'], $validated['model'])) {
            abort(422, 'That model is not available for the selected provider.');
        }

        return array_merge($validated, $extra);
    }

    /**
     * One row per owner per provider — re-saving replaces the key rather than
     * stacking up rows the resolver would then have to choose between.
     *
     * @param  array<string, mixed>  $validated
     */
    private function upsert(string $institutionId, ?string $userId, array $validated, string $actorId): TalaCredential
    {
        $credential = TalaCredential::query()
            ->forInstitution($institutionId)
            ->where('owner_key', $userId ?? TalaCredential::INSTITUTION_OWNER_KEY)
            ->where('provider', $validated['provider'])
            ->first()
            ?? new TalaCredential([
                'institution_id' => $institutionId,
                'user_id' => $userId,
                'provider' => $validated['provider'],
                'created_by' => $actorId,
            ]);

        $apiKey = trim((string) $validated['api_key']);

        $credential->fill([
            'institution_id' => $institutionId,
            'user_id' => $userId,
            'provider' => $validated['provider'],
            'model' => $validated['model'] ?? null,
            'api_key' => $apiKey,
            'is_active' => $validated['is_active'] ?? true,
        ]);

        if ($userId === null) {
            $credential->shared_with_staff = $validated['shared_with_staff'] ?? true;
            $credential->monthly_message_limit = array_key_exists('monthly_message_limit', $validated)
                ? $validated['monthly_message_limit']
                : (int) config('tala.default_monthly_message_limit');
        }

        $credential->save();

        return $credential;
    }
}
