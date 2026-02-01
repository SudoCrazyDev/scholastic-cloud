<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StudentAssessmentAttempt extends Model
{
    use HasUuids;

    protected $table = 'student_assessment_attempts';

    protected $fillable = [
        'student_id',
        'subject_ecr_item_id',
        'started_at',
        'submitted_at',
        'score',
        'max_score',
        'answers',
    ];

    protected $casts = [
        'answers' => 'array',
        'started_at' => 'datetime',
        'submitted_at' => 'datetime',
        'score' => 'decimal:2',
        'max_score' => 'decimal:2',
    ];

    public function student(): BelongsTo
    {
        return $this->belongsTo(Student::class);
    }

    public function subjectEcrItem(): BelongsTo
    {
        return $this->belongsTo(SubjectEcrItem::class);
    }

    public function isSubmitted(): bool
    {
        return $this->submitted_at !== null;
    }
}
