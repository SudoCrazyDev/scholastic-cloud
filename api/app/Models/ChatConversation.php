<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A group chat mirroring one academic object.
 *
 * Never created by a user action — see App\Services\Chat\ChatMembershipSync,
 * which is the only thing that writes to this table.
 */
class ChatConversation extends Model
{
    use HasUuids;

    public const TYPE_ADVISORY = 'advisory';

    public const TYPE_SUBJECT = 'subject';

    public const SCOPE_CLASS_SECTION = 'class_section';

    public const SCOPE_SUBJECT = 'subject';

    protected $fillable = [
        'institution_id',
        'type',
        'scope_type',
        'scope_id',
        'academic_year',
        'title',
        'subtitle',
        'last_message_at',
        'locked_at',
        'roster_version',
        'roster_pushed_at',
    ];

    protected $casts = [
        'last_message_at' => 'datetime',
        'locked_at' => 'datetime',
        'roster_version' => 'integer',
        'roster_pushed_at' => 'datetime',
    ];

    public function institution(): BelongsTo
    {
        return $this->belongsTo(Institution::class);
    }

    public function participants(): HasMany
    {
        return $this->hasMany(ChatParticipant::class, 'conversation_id');
    }

    /** Participants who have not left the underlying section or subject. */
    public function activeParticipants(): HasMany
    {
        return $this->participants()->whereNull('removed_at');
    }

    public function messages(): HasMany
    {
        return $this->hasMany(ChatMessage::class, 'conversation_id');
    }

    public function locked(): bool
    {
        return $this->locked_at !== null;
    }
}
