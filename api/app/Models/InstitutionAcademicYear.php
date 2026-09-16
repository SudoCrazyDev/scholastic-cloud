<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

class InstitutionAcademicYear extends Model
{
    public $incrementing = false;
    protected $keyType = 'string';

    protected static function boot(): void
    {
        parent::boot();
        static::creating(function ($model) {
            if (empty($model->id)) {
                $model->id = (string) Str::uuid();
            }
        });
    }

    protected $fillable = [
        'institution_id',
        'year',
        'grading_period_type',
        'is_current',
    ];

    protected $casts = [
        'is_current' => 'boolean',
        'institution_id' => 'string',
    ];

    public function institution(): BelongsTo
    {
        return $this->belongsTo(Institution::class);
    }

    /**
     * Grade levels that do not follow this year's structure — Senior High
     * staying on four quarters through a three-term year, typically. Only
     * exceptions are stored; everything else follows `grading_period_type`.
     */
    public function gradeLevelGradingPeriods(): HasMany
    {
        return $this->hasMany(
            InstitutionGradeLevelGradingPeriod::class,
            'institution_academic_year_id'
        );
    }
}
