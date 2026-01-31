<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Log;

class Institution extends Model
{
    use HasFactory, HasUuids;

    /**
     * The attributes that are mass assignable.
     *
     * @var array<string>
     */
    protected $fillable = [
        'title',
        'abbr',
        'address',
        'division',
        'region',
        'gov_id',
        'logo',
        'subscription_id',
    ];

    /**
     * The attributes that should be cast.
     *
     * @var array<string, string>
     */
    protected $casts = [
        'subscription_id' => 'string',
    ];

    /**
     * Get the logo URL. When logo is stored as an R2 key (institutions/...),
     * returns a temporary signed URL or the public R2 URL when R2_URL is set.
     */
    public function getLogoAttribute($value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }
        // R2 key stored in DB
        if (str_starts_with($value, 'institutions/')) {
            try {
                $url = config('filesystems.disks.r2.url');
                if ($url) {
                    return rtrim($url, '/') . '/' . ltrim($value, '/');
                }
                return Storage::disk('r2')->temporaryUrl($value, now()->addHours(24));
            } catch (\Throwable $e) {
                Log::warning('Institution logo URL failed for ' . $this->id . ': ' . $e->getMessage());
                return null;
            }
        }
        // Legacy: full URL (e.g. /storage/...) or existing public URL
        return $value;
    }

    /**
     * Get the subscription that owns the institution.
     */
    public function subscription(): BelongsTo
    {
        return $this->belongsTo(Subscription::class);
    }

    /**
     * Get the certificates for the institution.
     */
    public function certificates(): HasMany
    {
        return $this->hasMany(Certificate::class);
    }

    /**
     * Get validation rules for the model.
     */
    public static function getValidationRules(): array
    {
        return [
            'title' => 'required|string|max:255',
            'abbr' => 'required|string|max:50',
            'address' => 'nullable|string|max:500',
            'division' => 'nullable|string|max:255',
            'region' => 'nullable|string|max:255',
            'gov_id' => 'nullable|string|max:255',
            'logo' => 'nullable|file|image|mimes:jpeg,png,jpg,gif,webp|max:2048',
            'subscription_id' => 'nullable|uuid|exists:subscriptions,id',
        ];
    }
}
