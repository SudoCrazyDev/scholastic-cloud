<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * v2 normalized answer: one row per (attempt, question), keyed by stable question id.
 */
class StudentAssessmentAnswer extends Model
{
    use HasUuids;

    protected $fillable = [
        'attempt_id',
        'question_id',
        'response',
        'awarded',
        'is_correct',
        'graded_at',
        'graded_by',
    ];

    protected $casts = [
        'response' => 'array',
        'awarded' => 'decimal:2',
        'is_correct' => 'boolean',
        'graded_at' => 'datetime',
    ];

    public function attempt(): BelongsTo
    {
        return $this->belongsTo(StudentAssessmentAttempt::class, 'attempt_id');
    }

    public function question(): BelongsTo
    {
        return $this->belongsTo(AssessmentQuestion::class, 'question_id');
    }
}
