<?php

namespace App\Models;

use App\Support\PaymentProviders;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;
use Throwable;

/**
 * The merchant account one school takes online payments through.
 *
 * Set by a platform administrator, never by the school — see the migration for
 * why. The keys are encrypted at rest and never leave the server; the screen
 * works off `credential_hints`.
 */
class InstitutionPaymentGateway extends Model
{
    use HasUuids;

    protected $fillable = [
        'institution_id',
        'provider',
        'mode',
        'product',
        'currency',
        'credentials',
        'is_active',
        'created_by',
        'updated_by',
    ];

    protected $casts = [
        /*
         * Laravel encrypts on write and decrypts on read, keyed on APP_KEY.
         * Rotating APP_KEY therefore orphans every stored key — the same
         * hazard TalaCredential carries, handled the same way: decryptedCredentials()
         * below treats a bag it cannot decrypt as absent rather than throwing,
         * so a rotation degrades to "re-enter the keys" and a broken checkout
         * says so, instead of 500-ing in front of a parent trying to pay.
         */
        'credentials' => 'encrypted:array',
        'credential_hints' => 'array',
        'is_active' => 'boolean',
        'last_used_at' => 'datetime',
    ];

    /** Neither of these may ever reach a response. */
    protected $hidden = ['credentials', 'webhook_slug'];

    protected static function booted(): void
    {
        static::creating(function (self $gateway) {
            if (! $gateway->webhook_slug) {
                $gateway->webhook_slug = static::generateWebhookSlug();
            }
        });

        static::saving(function (self $gateway) {
            // Derived here rather than at the call site so every path that
            // writes keys — controller, seeder, tinker — leaves the screen
            // with something to display.
            if ($gateway->isDirty('credentials')) {
                $gateway->credential_hints = static::hintsFor($gateway->credentials ?? []);
            }
        });
    }

    /**
     * Opaque, and long enough that guessing one is not a way to find a
     * school's webhook endpoint.
     */
    public static function generateWebhookSlug(): string
    {
        do {
            $slug = Str::lower(Str::random(40));
        } while (static::where('webhook_slug', $slug)->exists());

        return $slug;
    }

    /**
     * Last four characters of each key, for display. Short values are shown as
     * present but not partially revealed — a four-character secret would
     * otherwise be printed in full.
     *
     * @param  array<string, mixed>  $credentials
     * @return array<string, string|null>
     */
    protected static function hintsFor(array $credentials): array
    {
        $hints = [];

        foreach ($credentials as $key => $value) {
            $value = (string) $value;
            $hints[$key] = $value === ''
                ? null
                : (strlen($value) > 8 ? substr($value, -4) : null);
        }

        return $hints;
    }

    /**
     * The stored keys, or an empty bag when they cannot be read back.
     *
     * @return array<string, string>
     */
    public function decryptedCredentials(): array
    {
        try {
            $credentials = $this->credentials;
        } catch (Throwable) {
            // Ciphertext written under a different APP_KEY.
            return [];
        }

        return is_array($credentials) ? $credentials : [];
    }

    public function credential(string $key): ?string
    {
        $value = $this->decryptedCredentials()[$key] ?? null;
        $value = is_string($value) ? trim($value) : '';

        return $value === '' ? null : $value;
    }

    public function institution(): BelongsTo
    {
        return $this->belongsTo(Institution::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function updater(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    public function resolvedProduct(): ?string
    {
        return PaymentProviders::resolveProduct($this->provider, $this->product);
    }

    public function baseUrl(): string
    {
        return PaymentProviders::baseUrl($this->provider, (string) $this->mode);
    }

    /**
     * Is this row in a state a payment can actually be taken through?
     *
     * Every required key present, a driver written for the provider, and a
     * reachable host. A row failing this is not silently skipped — the
     * checkout endpoint says which of these is missing, because the answer is
     * always something a platform administrator has to go and fix.
     *
     * @return array<string> the reasons it is not usable; empty means it is
     */
    public function readinessProblems(): array
    {
        $problems = [];

        if (! PaymentProviders::exists($this->provider)) {
            return ['This gateway names a provider the platform no longer supports.'];
        }

        if (PaymentProviders::driver($this->provider) === null) {
            $problems[] = 'The platform cannot talk to '.PaymentProviders::label($this->provider).' yet.';
        }

        if ($this->baseUrl() === '') {
            $problems[] = 'No endpoint is configured for the '.$this->mode.' mode.';
        }

        $credentials = $this->decryptedCredentials();
        if ($credentials === []) {
            $problems[] = 'The stored keys could not be read. They were encrypted with a different application key and must be entered again.';

            return $problems;
        }

        foreach (PaymentProviders::requiredCredentialKeys($this->provider) as $key) {
            if ($this->credential($key) === null) {
                $label = PaymentProviders::credentialFields($this->provider)[$key]['label'] ?? $key;
                $problems[] = 'The '.$label.' is missing.';
            }
        }

        return $problems;
    }

    public function isUsable(): bool
    {
        return $this->is_active && $this->readinessProblems() === [];
    }

    /**
     * What the admin screen is allowed to see.
     *
     * @return array<string, mixed>
     */
    public function toSummary(): array
    {
        $hints = is_array($this->credential_hints) ? $this->credential_hints : [];

        $keys = [];
        foreach (PaymentProviders::credentialFields($this->provider) as $key => $field) {
            $hint = $hints[$key] ?? null;
            $keys[$key] = [
                'set' => $this->credential($key) !== null,
                'masked' => $hint ? '••••'.$hint : null,
            ];
        }

        $problems = $this->readinessProblems();

        return [
            'id' => $this->id,
            'institution_id' => $this->institution_id,
            'provider' => $this->provider,
            'provider_label' => PaymentProviders::label($this->provider),
            'mode' => $this->mode,
            'product' => $this->resolvedProduct(),
            'currency' => $this->currency,
            'is_active' => $this->is_active,
            'ready' => $problems === [],
            'problems' => $problems,
            'keys' => $keys,
            'webhook_url' => $this->webhookUrl(),
            'last_used_at' => $this->last_used_at?->toJSON(),
            'updated_at' => $this->updated_at?->toJSON(),
        ];
    }

    /**
     * The URL to paste into the provider's dashboard. Shown only on the
     * platform screen, which is also the only place the slug appears.
     */
    public function webhookUrl(): string
    {
        return rtrim((string) config('app.url'), '/')
            .'/api/payments/webhooks/'.$this->provider.'/'.$this->webhook_slug;
    }

    public function scopeForInstitution(Builder $query, string $institutionId): Builder
    {
        return $query->where('institution_id', $institutionId);
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }
}
