<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One adviser's comment about one learner for one term.
 *
 * This is what DepEd's Annex G prints in TEACHER'S COMMENTS/REMARKS. It is
 * prose written to a parent, not a mark: nothing computes from it, nothing
 * aggregates it, and it never reaches a grade.
 *
 * See the table migration for why it is keyed on the learner and the year
 * rather than on a grade row or a section.
 */
class StudentAdviserComment extends Model
{
    use HasUuids;

    protected $table = 'student_adviser_comments';

    protected $fillable = [
        'student_id',
        'class_section_id',
        'academic_year',
        'quarter',
        'comment',
        'recorded_by',
    ];

    public function student(): BelongsTo
    {
        return $this->belongsTo(Student::class);
    }

    public function classSection(): BelongsTo
    {
        return $this->belongsTo(ClassSection::class);
    }

    /** The staff member who last wrote it — null once they have left the school. */
    public function recordedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'recorded_by');
    }
}
