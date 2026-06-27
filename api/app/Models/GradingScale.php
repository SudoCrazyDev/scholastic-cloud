<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class GradingScale extends Model
{
    use HasUuids;

    protected $fillable = [
        'institution_id',
        'name',
        'description',
    ];

    public function institution(): BelongsTo
    {
        return $this->belongsTo(Institution::class);
    }

    public function bands(): HasMany
    {
        return $this->hasMany(GradingScaleBand::class)->orderBy('sort_order');
    }

    public function subjects(): HasMany
    {
        return $this->hasMany(Subject::class);
    }

    /**
     * Map a numeric score to the label of the band whose range contains it.
     * Returns null when no band matches.
     */
    public function labelForScore(float $score): ?string
    {
        foreach ($this->bands as $band) {
            if ($score >= (float) $band->min_score && $score <= (float) $band->max_score) {
                return $band->label;
            }
        }

        return null;
    }
}
