<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One posted message.
 *
 * Note the absence of the SoftDeletes trait despite the deleted_at column: a
 * removed message stays in the transcript as a tombstone, and the trait would
 * filter it out of every query instead. See the migration.
 */
class ChatMessage extends Model
{
    use HasUlids;

    public const SENDER_USER = 'user';

    public const SENDER_STUDENT = 'student';

    public const SENDER_SYSTEM = 'system';

    protected $fillable = [
        'conversation_id',
        'institution_id',
        'sender_type',
        'sender_id',
        'sender_name',
        'body',
        'reply_to_id',
        'edited_at',
        'deleted_at',
        'deleted_by_type',
        'deleted_by_id',
    ];

    protected $casts = [
        'edited_at' => 'datetime',
        'deleted_at' => 'datetime',
    ];

    public function conversation(): BelongsTo
    {
        return $this->belongsTo(ChatConversation::class, 'conversation_id');
    }

    public function isDeleted(): bool
    {
        return $this->deleted_at !== null;
    }
}
