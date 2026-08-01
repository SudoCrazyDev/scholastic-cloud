<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

class TalaConversation extends Model
{
    use HasUuids;

    protected $fillable = [
        'institution_id',
        'user_id',
        'title',
        'provider',
        'model',
        'last_message_at',
        'archived_at',
    ];

    protected $casts = [
        'last_message_at' => 'datetime',
        'archived_at' => 'datetime',
    ];

    public function institution(): BelongsTo
    {
        return $this->belongsTo(Institution::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * `created_at` is second-resolution, and a question and its answer are
     * routinely written inside the same second — so it cannot order a thread on
     * its own. HasUuids issues time-ordered ids, which breaks the tie for free
     * and in the right direction.
     */
    public function messages(): HasMany
    {
        return $this->hasMany(TalaMessage::class, 'conversation_id')
            ->orderBy('created_at')
            ->orderBy('id');
    }

    /**
     * The turns replayed to the model on the next request.
     *
     * Trimmed to the tail rather than summarised: a teaching chat rarely runs
     * long enough to need compaction, and the alternative — an extra model call
     * per request to summarise — spends the school's budget to save it.
     *
     * @return array<int, array{role: string, content: string}>
     */
    public function historyForModel(?int $limit = null): array
    {
        $limit ??= (int) config('tala.max_history_messages', 30);

        return $this->messages()
            // reorder() clears the ascending sort the relation carries. Without
            // it the two clauses stack as "asc, desc", the ascending one wins,
            // and the window takes the oldest turns instead of the newest.
            ->reorder()
            ->whereNull('error_message')
            ->whereIn('role', [TalaMessage::ROLE_USER, TalaMessage::ROLE_ASSISTANT])
            ->where('content', '!=', '')
            ->latest('created_at')
            ->orderByDesc('id')
            ->limit($limit)
            ->get()
            // Newest-first was only how the tail got selected; reversing puts
            // it back in the order the model has to read it in.
            ->reverse()
            ->values()
            ->map(fn (TalaMessage $message) => [
                'role' => $message->role,
                'content' => $message->content,
            ])
            ->all();
    }

    /**
     * Name an untitled thread from its opening message, the way every chat
     * client does — a teacher should not have to name a conversation before
     * they know what it turned into.
     */
    public function titleFrom(string $message): void
    {
        if (filled($this->title)) {
            return;
        }

        $title = trim(preg_replace('/\s+/u', ' ', $message) ?? '');

        $this->title = $title === ''
            ? 'New conversation'
            : Str::limit($title, 60);
    }

    public function scopeOwnedBy(Builder $query, string $userId): Builder
    {
        return $query->where('user_id', $userId);
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->whereNull('archived_at');
    }
}
