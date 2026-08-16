<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ChatParticipant extends Model
{
    use HasUuids;

    public const TYPE_USER = 'user';

    public const TYPE_STUDENT = 'student';

    public const ROLE_TEACHER = 'teacher';

    public const ROLE_STUDENT = 'student';

    protected $fillable = [
        'conversation_id',
        'participant_type',
        'participant_id',
        'role',
        'last_read_message_id',
        'last_read_at',
        'muted_at',
        'removed_at',
    ];

    protected $casts = [
        'last_read_at' => 'datetime',
        'muted_at' => 'datetime',
        'removed_at' => 'datetime',
    ];

    public function conversation(): BelongsTo
    {
        return $this->belongsTo(ChatConversation::class, 'conversation_id');
    }

    public function scopeForPerson(Builder $query, string $type, string $id): Builder
    {
        return $query->where('participant_type', $type)->where('participant_id', $id);
    }

    /**
     * Someone removed from the underlying section or subject keeps their history
     * but loses the composer.
     */
    public function canPost(): bool
    {
        return $this->removed_at === null;
    }
}
