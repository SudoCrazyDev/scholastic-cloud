<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * One learner's descriptor - A to E - against one slot.
 *
 * Nothing numeric is stored here and nothing is derived from these: no score,
 * no average, no transmutation, no general average. Clearing a mark deletes the
 * row, which is why there is no SoftDeletes - a trashed row would keep holding
 * the unique slot and silently block re-marking.
 */
class MatatagCompetencyRating extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'institution_id',
        'class_section_id',
        'student_id',
        'academic_year',
        'slot_id',
        'term',
        'learning_area_id',
        'curriculum_version_id',
        'descriptor',
        'marked_by',
        'marked_at',
    ];

    protected $casts = [
        'term' => 'integer',
        'marked_at' => 'datetime',
    ];

    public function institution()
    {
        return $this->belongsTo(Institution::class);
    }

    public function classSection()
    {
        return $this->belongsTo(ClassSection::class);
    }

    public function student()
    {
        return $this->belongsTo(Student::class);
    }

    public function slot()
    {
        return $this->belongsTo(MatatagCompetencySlot::class, 'slot_id');
    }

    public function curriculumVersion()
    {
        return $this->belongsTo(MatatagCurriculumVersion::class, 'curriculum_version_id');
    }

    public function markedBy()
    {
        return $this->belongsTo(User::class, 'marked_by');
    }
}
