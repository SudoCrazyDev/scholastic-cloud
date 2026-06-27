<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class GradingScaleBand extends Model
{
    use HasUuids;

    protected $fillable = [
        'grading_scale_id',
        'label',
        'min_score',
        'max_score',
        'sort_order',
    ];

    protected $casts = [
        'min_score' => 'decimal:2',
        'max_score' => 'decimal:2',
        'sort_order' => 'integer',
    ];

    public function gradingScale(): BelongsTo
    {
        return $this->belongsTo(GradingScale::class);
    }
}
