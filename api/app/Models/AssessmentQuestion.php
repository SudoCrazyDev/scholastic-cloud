<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * v2 question row. Type-specific data lives in `config`; `toResolvedArray()` flattens a row
 * into the same shape the legacy content->questions array uses (plus a stable `id`), so the
 * scoring/grading logic is shared across v1 and v2.
 */
class AssessmentQuestion extends Model
{
    use HasUuids;
    use SoftDeletes;

    protected $fillable = [
        'subject_ecr_item_id',
        'position',
        'type',
        'question',
        'points',
        'config',
    ];

    protected $casts = [
        'config' => 'array',
        'points' => 'decimal:2',
        'position' => 'integer',
    ];

    public function subjectEcrItem(): BelongsTo
    {
        return $this->belongsTo(SubjectEcrItem::class, 'subject_ecr_item_id');
    }

    /**
     * Flatten to the legacy question shape used by AssessmentScoringService and the take/grade
     * views: ['id', 'type', 'question', 'points', ...type-specific config keys].
     */
    public function toResolvedArray(): array
    {
        return array_merge(
            is_array($this->config) ? $this->config : [],
            [
                'id' => $this->id,
                'type' => $this->type,
                'question' => $this->question ?? '',
                'points' => (float) $this->points,
            ]
        );
    }
}
