<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TalaMessage extends Model
{
    use HasUuids;

    public const ROLE_USER = 'user';

    public const ROLE_ASSISTANT = 'assistant';

    /**
     * A record of a lookup Tala ran on the teacher's behalf — what was called,
     * with what arguments, and what came back in one line.
     *
     * Never replayed to the model (see TalaConversation::historyForModel): the
     * tool exchange only has to hold together within the turn that made it, and
     * re-sending stale results on every later turn would both cost tokens and
     * tempt the model to answer from them instead of looking again.
     */
    public const ROLE_TOOL = 'tool';

    protected $fillable = [
        'conversation_id',
        'institution_id',
        'user_id',
        'role',
        'content',
        'provider',
        'model',
        'credential_source',
        'tokens_in',
        'tokens_out',
        'stop_reason',
        'error_message',
    ];

    protected $casts = [
        'tokens_in' => 'integer',
        'tokens_out' => 'integer',
    ];

    public function conversation(): BelongsTo
    {
        return $this->belongsTo(TalaConversation::class, 'conversation_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function failed(): bool
    {
        return filled($this->error_message);
    }
}
