<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * One published DepEd catalog for one grade level.
 *
 * A revision from DepEd is a NEW version row, never an edit of this one. See
 * docs/modules/MatatagKeyStage1/MATATAG.md, "Receiving a DepEd update".
 */
class MatatagCurriculumVersion extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'code',
        'title',
        'grade_level',
        'source',
        'published_on',
        'locked_at',
        'competency_count',
        'slot_count',
    ];

    protected $casts = [
        'published_on' => 'date',
        'locked_at' => 'datetime',
        'competency_count' => 'integer',
        'slot_count' => 'integer',
    ];

    public function learningAreas()
    {
        return $this->hasMany(MatatagLearningArea::class, 'curriculum_version_id')
            ->orderBy('sort_order');
    }

    public function sectionCurricula()
    {
        return $this->hasMany(MatatagSectionCurriculum::class, 'curriculum_version_id');
    }

    /**
     * Whether a descriptor has ever been recorded against this version.
     *
     * Once true the catalog is history: the loader refuses to rewrite it, so a
     * correction has to arrive as a new version rather than silently changing
     * what a teacher has already marked.
     */
    public function isLocked(): bool
    {
        return $this->locked_at !== null;
    }
}
