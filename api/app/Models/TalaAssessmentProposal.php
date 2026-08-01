<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A pending change to an assessment, drafted by Tala and not yet approved.
 *
 * See the migration for why this exists. The short version: the model has no
 * write path into the gradebook, so it describes the change here and a teacher
 * applies it by clicking.
 */
class TalaAssessmentProposal extends Model
{
    use HasUuids;

    public const ACTION_CREATE = 'create';

    public const ACTION_UPDATE = 'update';

    public const ACTION_DELETE = 'delete';

    public const ACTION_PUBLISH = 'publish';

    public const ACTION_UNPUBLISH = 'unpublish';

    public const ACTIONS = [
        self::ACTION_CREATE,
        self::ACTION_UPDATE,
        self::ACTION_DELETE,
        self::ACTION_PUBLISH,
        self::ACTION_UNPUBLISH,
    ];

    public const STATUS_PENDING = 'pending';

    public const STATUS_APPLIED = 'applied';

    public const STATUS_DISCARDED = 'discarded';

    public const STATUS_FAILED = 'failed';

    protected $fillable = [
        'institution_id',
        'user_id',
        'conversation_id',
        'message_id',
        'action',
        'subject_id',
        'subject_ecr_id',
        'subject_ecr_item_id',
        'title',
        'assessment_type',
        'quarter',
        'payload',
        'preview',
        'warnings',
        'summary',
        'status',
    ];

    protected $casts = [
        'payload' => 'array',
        'preview' => 'array',
        'warnings' => 'array',
        'applied_at' => 'datetime',
        'discarded_at' => 'datetime',
    ];

    /**
     * The payload is the applier's input and has no business being serialised
     * into a chat response — the card renders `preview` instead, which is the
     * same content shaped for a human.
     */
    protected $hidden = ['payload'];

    public function conversation(): BelongsTo
    {
        return $this->belongsTo(TalaConversation::class, 'conversation_id');
    }

    public function isPending(): bool
    {
        return $this->status === self::STATUS_PENDING;
    }

    /**
     * What the client needs to render the card.
     *
     * @return array<string, mixed>
     */
    public function toCard(): array
    {
        return [
            'id' => $this->id,
            'message_id' => $this->message_id,
            'action' => $this->action,
            'status' => $this->status,
            'title' => $this->title,
            'assessment_type' => $this->assessment_type,
            'quarter' => $this->quarter,
            'summary' => $this->summary,
            'preview' => $this->preview ?? [],
            'warnings' => $this->warnings ?? [],
            'applied_item_id' => $this->applied_item_id,
            'failure_reason' => $this->failure_reason,
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
