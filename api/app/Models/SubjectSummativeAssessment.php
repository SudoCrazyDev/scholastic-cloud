<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SubjectSummativeAssessment extends Model
{
    use HasUuids;

    protected $table = 'subject_summative_assessments';

    protected $fillable = [
        'subject_id',
        'summative_assessments',
        'academic_year',
    ];

    protected $casts = [
        'summative_assessments' => 'array',
    ];

    public function subject(): BelongsTo
    {
        return $this->belongsTo(Subject::class);
    }
} 