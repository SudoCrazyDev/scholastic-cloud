<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class SubjectEcrItem extends Model
{
    use HasUuids;
    
    /**
     * The attributes that are mass assignable.
     *
     * @var array<int, string>
     *
     * Note: 'type' is nullable in the database.
     */
    protected $fillable = [
        'subject_ecr_id',
        'type',
        'status',
        'title',
        'description',
        'content',
        'content_version',
        'settings',
        'quarter',
        'academic_year',
        'scheduled_date',
        'open_at',
        'close_at',
        'due_at',
        'allow_late_submission',
        'score',
    ];

    protected $casts = [
        'content' => 'array',
        'content_version' => 'integer',
        'settings' => 'array',
        'score' => 'decimal:2',
        'scheduled_date' => 'date:Y-m-d',
        'open_at' => 'datetime',
        'close_at' => 'datetime',
        'due_at' => 'datetime',
        'allow_late_submission' => 'boolean',
    ];

    /**
     * Get the student scores for this ECR item.
     */
    public function studentScores()
    {
        return $this->hasMany(StudentEcrItemScore::class);
    }

    /**
     * Get assessment attempts (for interactive quiz/assignment/exam).
     */
    public function assessmentAttempts()
    {
        return $this->hasMany(StudentAssessmentAttempt::class, 'subject_ecr_item_id');
    }

    /**
     * v2 question rows, ordered. Soft-deleted questions are excluded automatically.
     */
    public function questions()
    {
        return $this->hasMany(AssessmentQuestion::class, 'subject_ecr_item_id')->orderBy('position');
    }

    public function isV2(): bool
    {
        return (int) $this->content_version === 2;
    }

    /**
     * The single seam every read path uses to get questions. Returns the ordered question
     * array in the legacy shape (each entry carries a stable `id` in v2). v1 reads the JSON;
     * v2 hydrates from active question rows.
     */
    public function resolvedQuestions(): array
    {
        if ($this->isV2()) {
            return $this->questions->map->toResolvedArray()->all();
        }

        return is_array($this->content['questions'] ?? null) ? $this->content['questions'] : [];
    }

    /**
     * Get the subject ECR that owns this item.
     */
    public function subjectEcr()
    {
        return $this->belongsTo(SubjectEcr::class, 'subject_ecr_id');
    }

    /**
     * Get the subject through the subject ECR.
     */
    public function subject()
    {
        return $this->hasOneThrough(
            Subject::class,
            SubjectEcr::class,
            'id', // Foreign key on SubjectEcr table...
            'id', // Foreign key on Subject table...
            'subject_ecr_id', // Local key on this model...
            'subject_id' // Local key on SubjectEcr table...
        );
    }
}