<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Topic extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'subject_id',
        'quarter',
        'title',
        'description',
        'content',
        'learning_objectives',
        'estimated_minutes',
        'order',
        'is_completed',
        'is_published',
    ];

    protected $casts = [
        'content' => 'array',
        'learning_objectives' => 'array',
        'estimated_minutes' => 'integer',
        'is_completed' => 'boolean',
        'is_published' => 'boolean',
        'order' => 'integer',
    ];

    /**
     * Get the subject that owns the topic.
     */
    public function subject(): BelongsTo
    {
        return $this->belongsTo(Subject::class);
    }

    /**
     * Per-student progress through this lesson.
     */
    public function progress(): HasMany
    {
        return $this->hasMany(StudentLessonProgress::class);
    }
}
