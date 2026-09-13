<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * A strand within a learning area. `term` is 0 when the domain spans the year
 * and 1-3 when it belongs to a single term.
 */
class MatatagDomain extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'learning_area_id',
        'term',
        'code',
        'title',
        'sort_order',
    ];

    protected $casts = [
        'term' => 'integer',
        'sort_order' => 'integer',
    ];

    public function learningArea()
    {
        return $this->belongsTo(MatatagLearningArea::class, 'learning_area_id');
    }

    public function competencies()
    {
        return $this->hasMany(MatatagCompetency::class, 'domain_id')
            ->orderBy('sort_order');
    }
}
