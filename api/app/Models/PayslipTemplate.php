<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PayslipTemplate extends Model
{
    use HasUuids;

    protected $fillable = [
        'institution_id',
        'name',
        'is_default',
        'paper_size',
        'layout',
        'created_by',
    ];

    protected $casts = [
        'is_default' => 'boolean',
        'layout' => 'array',
    ];

    public function institution(): BelongsTo
    {
        return $this->belongsTo(Institution::class);
    }
}
