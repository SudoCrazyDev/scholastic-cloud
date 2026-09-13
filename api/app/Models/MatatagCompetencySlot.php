<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * One rateable cell: this competency, this macro skill, this term.
 *
 * A slot exists only for a term the competency is actually taught in, so the
 * set of slots IS the curriculum's pacing - there is no "not applicable" flag
 * to check anywhere. 606 rows for Grade 1.
 */
class MatatagCompetencySlot extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'competency_id',
        'learning_area_id',
        'term',
        'macro_skill',
        'sort_order',
    ];

    protected $casts = [
        'term' => 'integer',
        'sort_order' => 'integer',
    ];

    public function competency()
    {
        return $this->belongsTo(MatatagCompetency::class, 'competency_id');
    }

    public function learningArea()
    {
        return $this->belongsTo(MatatagLearningArea::class, 'learning_area_id');
    }

    public function ratings()
    {
        return $this->hasMany(MatatagCompetencyRating::class, 'slot_id');
    }
}
