<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/**
 * The section's own subject that stands for one MATATAG learning area, for one
 * academic year. Whoever teaches that subject may mark that area.
 */
class MatatagSubjectLearningArea extends Model
{
    use HasUuids;

    protected $table = 'matatag_subject_learning_areas';

    protected $fillable = [
        'institution_id',
        'class_section_id',
        'academic_year',
        'learning_area_id',
        'subject_id',
        'linked_by',
    ];

    public function classSection()
    {
        return $this->belongsTo(ClassSection::class);
    }

    public function learningArea()
    {
        return $this->belongsTo(MatatagLearningArea::class, 'learning_area_id');
    }

    public function subject()
    {
        return $this->belongsTo(Subject::class);
    }
}
