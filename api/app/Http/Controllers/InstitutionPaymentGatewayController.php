<?php

namespace App\Http\Controllers;

use App\Models\Institution;
use App\Models\InstitutionPaymentGateway;
use App\Services\Payments\PaymentGatewayManager;
use App\Support\PaymentProviders;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Which merchant account each school takes online payments through.
 *
 * Platform administration, like the Feature Access screen and for the same
 * reason: the module gating it is `system_only`, so only a wildcard holder
 * reaches it and a school can never be granted it in its own role builder.
 *
 * That the school cannot set its own keys is a deliberate choice rather than an
 * accident of where the screen landed. Whoever onboards the merchant account
 * with the provider is the platform, a mistyped live secret key is an outage
 * during enrolment, and a school administrator has no way to tell a sandbox key
 * from a live one by looking at it.
 *
 * Keys are write-only through this controller. They go in encrypted and never
 * come back out — the screen shows the last four characters and nothing else.
 */
class InstitutionPaymentGatewayController extends Controller
{
    public function __construct(private PaymentGatewayManager $gateways) {}

    /**
     * The provider catalog, and every institution's gateways.
     *
     * One response rather than a call per school — same as Feature Access,
     * there are tens of institutions rather than thousands.
     */
    public function index(): JsonResponse
    {
        $institutions = Institution::query()
            ->orderBy('title')
            ->get(['id', 'title']);

        $rows = InstitutionPaymentGateway::all()->groupBy('institution_id');

        $data = $institutions->map(fn (Institution $institution) => [
            'id' => $institution->id,
            'title' => $institution->title,
            'gateways' => $rows->get($institution->id, collect())
                ->map(fn (InstitutionPaymentGateway $gateway) => $gateway->toSummary())
                ->values(),
        ]);

        return response()->json([
            'success' => true,
            'data' => [
                'providers' => PaymentProviders::forDisplay(),
                'institutions' => $data->values(),
            ],
        ]);
    }

    /**
     * Create or update one school's account with one provider.
     *
     * Keyed by institution and provider rather than by row id, so the screen
     * can save a provider it has never saved before without first asking for a
     * row to be created.
     */
    public function update(Request $request, string $institutionId, string $provider): JsonResponse
    {
        if (! PaymentProviders::exists($provider)) {
            return response()->json([
                'success' => false,
                'message' => 'Unknown payment provider.',
            ], 404);
        }

        $institution = Institution::find($institutionId);
        if (! $institution) {
            return response()->json([
                'success' => false,
                'message' => 'Institution not found.',
            ], 404);
        }

        $existing = InstitutionPaymentGateway::query()
            ->forInstitution($institution->id)
            ->where('provider', $provider)
            ->first();

        $rules = [
            'mode' => ['required', Rule::in(PaymentProviders::modes($provider))],
            'currency' => ['nullable', Rule::in(PaymentProviders::currencies($provider))],
            'is_active' => ['required', 'boolean'],
            'credentials' => ['array'],
        ];

        if (PaymentProviders::products($provider) !== []) {
            $rules['product'] = ['required', Rule::in(PaymentProviders::products($provider))];
        }

        foreach (PaymentProviders::credentialFields($provider) as $key => $field) {
            // Never `required`, even for a required field: a row that already
            // holds the key is edited without re-typing it, and the check that
            // every required key is actually present happens below against the
            // merged bag rather than against this request.
            $rules['credentials.'.$key] = ['nullable', 'string', 'max:500'];
        }

        $validated = $request->validate($rules);

        /*
         * Blank means "leave what is stored", not "clear it". The screen sends
         * empty inputs for keys already on file — it has never been given
         * their values and cannot echo them back.
         */
        $credentials = $existing?->decryptedCredentials() ?? [];
        foreach ($validated['credentials'] ?? [] as $key => $value) {
            $value = trim((string) $value);
            if ($value !== '') {
                $credentials[$key] = $value;
            }
        }

        // Keys belonging to no field in the catalog are dropped rather than
        // stored, so a renamed field does not leave a stale secret at rest.
        $credentials = array_intersect_key(
            $credentials,
            PaymentProviders::credentialFields($provider),
        );

        $missing = [];
        foreach (PaymentProviders::requiredCredentialKeys($provider) as $key) {
            if (trim((string) ($credentials[$key] ?? '')) === '') {
                $missing[$key] = [
                    (PaymentProviders::credentialFields($provider)[$key]['label'] ?? $key).' is required.',
                ];
            }
        }

        /*
         * An incomplete row may be saved, but not switched on. Onboarding a
         * merchant account happens across more than one sitting — the webhook
         * key in particular is generated in the provider's dashboard against
         * the URL this screen shows, which cannot be known until the row
         * exists — so a half-filled row has to be storable.
         */
        if ($missing !== [] && $validated['is_active']) {
            return response()->json([
                'success' => false,
                'message' => 'Every key must be in place before this account can be switched on.',
                'errors' => $missing,
            ], 422);
        }

        $gateway = DB::transaction(function () use ($existing, $institution, $provider, $validated, $credentials, $request) {
            $attributes = [
                'mode' => $validated['mode'],
                'product' => $validated['product'] ?? PaymentProviders::defaultProduct($provider),
                'currency' => $validated['currency'] ?? PaymentProviders::currencies($provider)[0] ?? 'PHP',
                'credentials' => $credentials,
                'is_active' => (bool) $validated['is_active'],
                'updated_by' => $request->user()?->id,
            ];

            if ($existing) {
                $existing->update($attributes);
                $gateway = $existing;
            } else {
                $gateway = InstitutionPaymentGateway::create($attributes + [
                    'institution_id' => $institution->id,
                    'provider' => $provider,
                    'created_by' => $request->user()?->id,
                ]);
            }

            /*
             * One live merchant account per school. Switching one on stands the
             * others down rather than refusing — a school moving from one
             * provider to the next should be one action, not two, and the
             * in-between state where both are on is the one state that must
             * never exist.
             */
            if ($gateway->is_active) {
                InstitutionPaymentGateway::query()
                    ->forInstitution($institution->id)
                    ->where('id', '!=', $gateway->id)
                    ->update(['is_active' => false]);
            }

            return $gateway;
        });

        $this->gateways->flush($institution->id);

        return response()->json([
            'success' => true,
            'message' => 'Payment gateway saved.',
            'data' => $gateway->fresh()->toSummary(),
            // Surfaced rather than fatal: the row saved, and the screen shows
            // what is still outstanding before it can be switched on.
            'outstanding' => $missing,
        ]);
    }

    /**
     * Forget a school's account with a provider.
     *
     * The transactions it collected keep their own record — the foreign key
     * nulls rather than cascades — so this removes the keys, not the history.
     */
    public function destroy(string $institutionId, string $provider): JsonResponse
    {
        $gateway = InstitutionPaymentGateway::query()
            ->forInstitution($institutionId)
            ->where('provider', $provider)
            ->first();

        if (! $gateway) {
            return response()->json([
                'success' => false,
                'message' => 'This institution has no account with that provider.',
            ], 404);
        }

        $gateway->delete();
        $this->gateways->flush($institutionId);

        return response()->json([
            'success' => true,
            'message' => 'Payment gateway removed.',
        ]);
    }
}
