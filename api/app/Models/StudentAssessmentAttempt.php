<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

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
        'manual_scores',
        'graded_at',
        'graded_by',
    ];

    protected $casts = [
        'answers' => 'array',
        'manual_scores' => 'array',
        'started_at' => 'datetime',
        'submitted_at' => 'datetime',
        'graded_at' => 'datetime',
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

    /**
     * v2 normalized answers (one row per question). Empty for v1 attempts, which keep
     * their answers in the `answers` JSON column keyed by question index.
     */
    public function assessmentAnswers(): HasMany
    {
        return $this->hasMany(StudentAssessmentAnswer::class, 'attempt_id');
    }

    public function isSubmitted(): bool
    {
        return $this->submitted_at !== null;
    }
}
