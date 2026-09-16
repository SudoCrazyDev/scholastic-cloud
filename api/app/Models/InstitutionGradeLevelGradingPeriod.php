<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One grade level's exception to its academic year's grading period structure.
 *
 * Rows exist only where a grade level differs from the year default — typically
 * Grades 11 and 12 staying on four quarters while the rest of a school moves to
 * three terms. Absence means "follow the year".
 *
 * @see \App\Support\GradingPeriods
 */
class InstitutionGradeLevelGradingPeriod extends Model
{
    use HasUuids;

    protected $fillable = [
        'institution_id',
        'institution_academic_year_id',
        'grade_level',
        'grading_period_type',
    ];

    public function institution(): BelongsTo
    {
        return $this->belongsTo(Institution::class);
    }

    public function academicYear(): BelongsTo
    {
        return $this->belongsTo(InstitutionAcademicYear::class, 'institution_academic_year_id');
    }
}
