<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * The adviser's two paragraphs for one learner in one term.
 *
 * This is the body of the printed report card. Everything else on the card is
 * derived, and the competency grid prints on the attached PACE forms instead.
 */
class MatatagTermNarrative extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'institution_id',
        'class_section_id',
        'student_id',
        'academic_year',
        'term',
        'can_do',
        'to_improve',
        'written_by',
    ];

    protected $casts = [
        'term' => 'integer',
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

    public function writtenBy()
    {
        return $this->belongsTo(User::class, 'written_by');
    }
}
