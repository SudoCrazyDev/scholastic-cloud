<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

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
            'division' => 'nullable|string|max:255',
            'region' => 'nullable|string|max:255',
            'gov_id' => 'nullable|string|max:255',
            'logo' => 'nullable|string|max:500',
            'subscription_id' => 'nullable|uuid|exists:subscriptions,id',
        ];
    }
}
