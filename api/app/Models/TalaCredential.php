<?php

namespace App\Models;

use App\Support\TalaProviders;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * An API key Tala may talk to a provider with.
 *
 * A row with no `user_id` is the institution's key; one with a `user_id` is a
 * teacher's own. See CredentialResolver for which of the two a request uses.
 */
class TalaCredential extends Model
{
    use HasUuids;

    public const SOURCE_INSTITUTION = 'institution';

    public const SOURCE_USER = 'user';

    /** Stands in for a null `user_id` so the unique index actually bites. */
    public const INSTITUTION_OWNER_KEY = '__institution__';

    protected $fillable = [
        'institution_id',
        'user_id',
        'provider',
        'model',
        'api_key',
        'shared_with_staff',
        'monthly_message_limit',
        'is_active',
        'created_by',
    ];

    protected $casts = [
        // Laravel encrypts on write and decrypts on read, keyed on APP_KEY.
        // Rotating APP_KEY therefore orphans every stored key — the resolver
        // treats a key it cannot decrypt as absent rather than throwing, so a
        // rotation degrades to "re-enter your key" instead of a broken module.
        'api_key' => 'encrypted',
        'shared_with_staff' => 'boolean',
        'is_active' => 'boolean',
        'monthly_message_limit' => 'integer',
        'last_used_at' => 'datetime',
    ];

    /**
     * The key itself must never reach a response, and `owner_key` is plumbing.
     */
    protected $hidden = ['api_key', 'owner_key'];

    protected static function booted(): void
    {
        static::saving(function (self $credential) {
            $credential->owner_key = $credential->user_id ?? self::INSTITUTION_OWNER_KEY;

            // Derived here rather than at the call site so every path that
            // writes a key — controller, seeder, tinker — leaves the UI with
            // something to display.
            if ($credential->isDirty('api_key')) {
                $key = (string) $credential->api_key;
                $credential->key_last_four = $key === '' ? null : substr($key, -4);
            }
        });
    }

    public function institution(): BelongsTo
    {
        return $this->belongsTo(Institution::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function isInstitutionWide(): bool
    {
        return $this->user_id === null;
    }

    public function source(): string
    {
        return $this->isInstitutionWide() ? self::SOURCE_INSTITUTION : self::SOURCE_USER;
    }

    /**
     * Is this row in a state a request can actually use?
     *
     * An institution key that has been parked (`shared_with_staff` off) is
     * deliberately invisible to teachers without being deleted.
     */
    public function isUsable(): bool
    {
        if (! $this->is_active) {
            return false;
        }

        return $this->isInstitutionWide()
            ? $this->shared_with_staff
            : true;
    }

    /**
     * The model to send, falling back when a stored one has since left the
     * allowlist — a school that downgrades its plan should get the provider's
     * default, not a 404 from the provider.
     */
    public function resolvedModel(): string
    {
        return TalaProviders::resolveModel($this->provider, $this->model);
    }

    /**
     * What the UI is allowed to see.
     *
     * @return array<string, mixed>
     */
    public function toSummary(): array
    {
        return [
            'id' => $this->id,
            'source' => $this->source(),
            'provider' => $this->provider,
            'provider_label' => TalaProviders::label($this->provider),
            'model' => $this->resolvedModel(),
            'masked_key' => $this->key_last_four ? '••••••••'.$this->key_last_four : null,
            'shared_with_staff' => $this->isInstitutionWide() ? $this->shared_with_staff : null,
            'monthly_message_limit' => $this->isInstitutionWide() ? $this->monthly_message_limit : null,
            'is_active' => $this->is_active,
            'last_used_at' => $this->last_used_at,
            'updated_at' => $this->updated_at,
        ];
    }

    public function scopeForInstitution(Builder $query, string $institutionId): Builder
    {
        return $query->where('institution_id', $institutionId);
    }

    public function scopeInstitutionWide(Builder $query): Builder
    {
        return $query->whereNull('user_id');
    }

    public function scopeOwnedBy(Builder $query, string $userId): Builder
    {
        return $query->where('user_id', $userId);
    }
}
