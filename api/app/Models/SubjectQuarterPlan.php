<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SubjectQuarterPlan extends Model
{
    use HasUuids;

    protected $table = 'subject_quarter_plans';

    protected $fillable = [
        'subject_id',
        'quarter',
        'start_date',
        'exam_date',
        'meeting_days',
        'excluded_dates',
        'quizzes_count',
        'assignments_count',
        'activities_count',
        'projects_count',
        'created_by',
        'updated_by',
    ];

    protected $casts = [
        'start_date' => 'date:Y-m-d',
        'exam_date' => 'date:Y-m-d',
        'meeting_days' => 'array',
        'excluded_dates' => 'array',
        'quizzes_count' => 'integer',
        'assignments_count' => 'integer',
        'activities_count' => 'integer',
        'projects_count' => 'integer',
    ];

    public function subject(): BelongsTo
    {
        return $this->belongsTo(Subject::class);
    }

    public function lessonPlans(): HasMany
    {
        return $this->hasMany(LessonPlan::class, 'subject_quarter_plan_id');
    }
}

