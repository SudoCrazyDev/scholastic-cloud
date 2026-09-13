<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * A section's opt-in, and the catalog version its descriptors are pinned to for
 * the academic year.
 *
 * Resolve the catalog from HERE, never from a grade-level string - DepEd's own
 * workbook offers Grades 1 to 3 in its header while carrying only Grade 1's
 * competencies.
 */
class MatatagSectionCurriculum extends Model
{
    use HasFactory, HasUuids;

    protected $table = 'matatag_section_curricula';

    protected $fillable = [
        'institution_id',
        'class_section_id',
        'academic_year',
        'curriculum_version_id',
        'grade_level',
        'enabled',
        'enabled_by',
        'enabled_at',
    ];

    protected $casts = [
        'enabled' => 'boolean',
        'enabled_at' => 'datetime',
    ];

    public function institution()
    {
        return $this->belongsTo(Institution::class);
    }

    public function classSection()
    {
        return $this->belongsTo(ClassSection::class);
    }

    public function curriculumVersion()
    {
        return $this->belongsTo(MatatagCurriculumVersion::class, 'curriculum_version_id');
    }

    public function enabledBy()
    {
        return $this->belongsTo(User::class, 'enabled_by');
    }

    public function scopeEnabled($query)
    {
        return $query->where('enabled', true);
    }
}
