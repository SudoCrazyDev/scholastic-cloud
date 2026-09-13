<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * A learning area within one catalog version - Reading & Literacy, Language,
 * Mathematics, GMRC and Makabansa for Grade 1.
 *
 * Which areas exist, and how each is shaped, is DATA. Grade 2 and Grade 3 may
 * have different ones. Branch on the flags below, never on `key` and never on
 * the grade level.
 */
class MatatagLearningArea extends Model
{
    use HasFactory, HasUuids;

    /** One competency list for the whole year, rated in some subset of terms. */
    public const SHAPE_YEAR_LIST = 'year_list';

    /** A separate list per term, numbering restarting each time. */
    public const SHAPE_PER_TERM_LIST = 'per_term_list';

    protected $fillable = [
        'curriculum_version_id',
        'key',
        'title',
        'shape',
        'uses_macro_skills',
        'has_domains',
        'carries_values',
        'sort_order',
    ];

    protected $casts = [
        'uses_macro_skills' => 'boolean',
        'has_domains' => 'boolean',
        'carries_values' => 'boolean',
        'sort_order' => 'integer',
    ];

    public function curriculumVersion()
    {
        return $this->belongsTo(MatatagCurriculumVersion::class, 'curriculum_version_id');
    }

    public function domains()
    {
        return $this->hasMany(MatatagDomain::class, 'learning_area_id')
            ->orderBy('term')->orderBy('sort_order');
    }

    /** Top-level competencies only; lettered children hang off each one. */
    public function competencies()
    {
        return $this->hasMany(MatatagCompetency::class, 'learning_area_id')
            ->whereNull('parent_id')
            ->orderBy('term')->orderBy('sort_order');
    }

    public function slots()
    {
        return $this->hasMany(MatatagCompetencySlot::class, 'learning_area_id')
            ->orderBy('term')->orderBy('sort_order');
    }

    public function scopeOrdered($query)
    {
        return $query->orderBy('sort_order');
    }
}
