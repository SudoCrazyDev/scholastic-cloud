<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class StudentEcrItemScore extends Model
{
    use HasUuids;
    
    protected $fillable = [
        'student_id',
        'subject_ecr_item_id',
        'score',
    ];

    protected $casts = [
        'score' => 'decimal:2',
    ];

    /**
     * Get the student that owns the score.
     */
    public function student()
    {
        return $this->belongsTo(Student::class);
    }

    /**
     * Get the subject ECR item that owns the score.
     */
    public function subjectEcrItem()
    {
        return $this->belongsTo(SubjectEcrItem::class);
    }
}
