<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * One learning competency, or one lettered child of one.
 *
 * The tree is exactly two levels deep: a numbered competency may have lettered
 * children, and those children have none. A parent whose children hold the
 * marks is `is_rateable = false` and owns no slots.
 *
 * `path` ("T1.9.a") is the stable natural key. Quote it when DepEd revises
 * wording: ids differ between catalog versions, the path does not.
 */
class MatatagCompetency extends Model
{
    use HasFactory, HasUuids;

    protected $table = 'matatag_competencies';

    protected $fillable = [
        'learning_area_id',
        'domain_id',
        'parent_id',
        'term',
        'path',
        'number',
        'letter',
        'label',
        'text',
        'performance_standard',
        'extra',
        'is_rateable',
        'sort_order',
    ];

    protected $casts = [
        'term' => 'integer',
        'is_rateable' => 'boolean',
        'sort_order' => 'integer',
        'extra' => 'array',
    ];

    public function learningArea()
    {
        return $this->belongsTo(MatatagLearningArea::class, 'learning_area_id');
    }

    public function domain()
    {
        return $this->belongsTo(MatatagDomain::class, 'domain_id');
    }

    public function parent()
    {
        return $this->belongsTo(self::class, 'parent_id');
    }

    public function children()
    {
        return $this->hasMany(self::class, 'parent_id')->orderBy('sort_order');
    }

    public function slots()
    {
        return $this->hasMany(MatatagCompetencySlot::class, 'competency_id')
            ->orderBy('term')->orderBy('sort_order');
    }
}
