<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LessonPlan extends Model
{
    use HasUuids;

    protected $table = 'lesson_plans';

    protected $fillable = [
        'subject_id',
        'subject_quarter_plan_id',
        'topic_id',
        'quarter',
        'lesson_date',
        'title',
        'content',
        'generated_by',
        'generated_by_user_id',
    ];

    protected $casts = [
        'lesson_date' => 'date:Y-m-d',
        'content' => 'array',
    ];

    public function subject(): BelongsTo
    {
        return $this->belongsTo(Subject::class);
    }

    public function subjectQuarterPlan(): BelongsTo
    {
        return $this->belongsTo(SubjectQuarterPlan::class, 'subject_quarter_plan_id');
    }

    public function topic(): BelongsTo
    {
        return $this->belongsTo(Topic::class);
    }
}

