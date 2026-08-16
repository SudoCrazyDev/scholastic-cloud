<?php

namespace App\Http\Controllers;

use App\Models\ChatConversation;
use App\Models\ChatMessage;
use App\Models\ChatParticipant;
use App\Models\Institution;
use App\Services\Chat\ChatMembershipSync;
use App\Services\Chat\ChatPrincipal;
use App\Services\Chat\ChatRealtimePublisher;
use App\Services\Chat\ChatRosterPublisher;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * Group chat for teachers and students.
 *
 * Every endpoint here is scoped by chat_participants and nothing else. There is
 * no permission gate: a teacher talking to their own advisory is their own data,
 * the same reasoning that leaves "My Assigned Subjects" ungated. Membership *is*
 * the authorization, and membership is derived from enrolment by
 * ChatMembershipSync — so nobody can be in a room they do not belong to unless
 * the academic records already say they do.
 */
class ChatController extends Controller
{
    /** Messages a single sync poll will carry before telling the client to refetch. */
    private const SYNC_LIMIT = 200;

    /** Transcript page size. */
    private const PAGE_SIZE = 50;

    /**
     * The poll cursor is a timestamp, and two messages committing at once can
     * land either side of it — the later-committed row can carry the earlier
     * created_at and be missed. Re-reading a couple of seconds of overlap on
     * every poll closes that window; the client already dedupes by id.
     */
    private const SYNC_OVERLAP_SECONDS = 2;

    public function __construct(private readonly ChatRealtimePublisher $realtime) {}

    /** The signed-in person's groups, most recently active first. */
    public function conversations(Request $request): JsonResponse
    {
        $principal = ChatPrincipal::resolve($request->user());
        if (! $principal) {
            return $this->noPrincipal();
        }

        $participants = $this->participantsFor($principal);
        if ($participants->isEmpty()) {
            return response()->json(['success' => true, 'data' => []]);
        }

        $conversations = ChatConversation::whereIn('id', $participants->keys())
            ->orderByDesc('last_message_at')
            ->orderBy('title')
            ->get();

        $unread = $this->unreadCounts($principal, $participants);
        $latest = $this->latestMessages($participants->keys()->all());

        return response()->json([
            'success' => true,
            'data' => $conversations->map(fn (ChatConversation $c) => $this->serializeConversation(
                $c,
                $participants->get($c->id),
                (int) ($unread[$c->id] ?? 0),
                $latest->get($c->id),
            ))->values(),
        ]);
    }

    /** One transcript, newest page first. `before` pages backwards through history. */
    public function messages(Request $request, string $conversationId): JsonResponse
    {
        $principal = ChatPrincipal::resolve($request->user());
        if (! $principal) {
            return $this->noPrincipal();
        }

        $participant = $this->participantFor($principal, $conversationId);
        if (! $participant) {
            return $this->notAMember();
        }

        $query = ChatMessage::where('conversation_id', $conversationId);

        if ($before = $request->query('before')) {
            $query->where('created_at', '<', Carbon::parse($before));
        }

        // Read newest-first so the limit takes the recent end, then hand the
        // page back in reading order.
        $messages = $query->orderByDesc('created_at')
            ->orderByDesc('id')
            ->limit(self::PAGE_SIZE)
            ->get()
            ->reverse()
            ->values();

        return response()->json([
            'success' => true,
            'data' => [
                'messages' => $messages->map(fn ($m) => $this->serializeMessage($m))->values(),
                'has_more' => $messages->count() === self::PAGE_SIZE,
            ],
        ]);
    }

    public function send(Request $request, string $conversationId): JsonResponse
    {
        $principal = ChatPrincipal::resolve($request->user());
        if (! $principal) {
            return $this->noPrincipal();
        }

        $participant = $this->participantFor($principal, $conversationId);
        if (! $participant) {
            return $this->notAMember();
        }

        $conversation = ChatConversation::find($conversationId);
        if (! $conversation) {
            return $this->notAMember();
        }

        // Removed from the section or subject: the history stays readable, the
        // composer does not.
        if (! $participant->canPost()) {
            return response()->json([
                'success' => false,
                'message' => 'You are no longer a member of this group',
            ], 403);
        }

        if ($conversation->locked()) {
            return response()->json([
                'success' => false,
                'message' => 'This group is closed to new messages',
            ], 403);
        }

        $validated = $request->validate([
            'body' => 'required|string|max:4000',
        ]);

        $body = trim($validated['body']);
        if ($body === '') {
            return response()->json([
                'success' => false,
                'message' => 'Message cannot be empty',
            ], 422);
        }

        $message = ChatMessage::create([
            'conversation_id' => $conversation->id,
            'institution_id' => $conversation->institution_id,
            'sender_type' => $principal->type,
            'sender_id' => $principal->id,
            'sender_name' => $principal->name,
            'body' => $body,
        ]);

        $conversation->update(['last_message_at' => $message->created_at]);

        // Sending is reading. Without this the sender's own message would sit in
        // their unread badge until they happened to scroll.
        $participant->update([
            'last_read_message_id' => $message->id,
            'last_read_at' => $message->created_at,
        ]);

        // Best-effort push to whoever is connected. Everyone else — and anyone
        // whose socket dropped — picks it up from sync().
        $this->realtime->publish(
            $conversation,
            $this->serializeMessage($message),
            $this->recipientsExcept($conversation, $principal),
        );

        return response()->json([
            'success' => true,
            'data' => $this->serializeMessage($message),
        ], 201);
    }

    /**
     * Remove a message, leaving the tombstone.
     *
     * A teacher may remove anything in a group they still belong to; anyone may
     * remove their own. One rule rather than two endpoints, because it is the
     * same act with the same consequence — the text is gone from every screen
     * and the row stays where it was.
     *
     * Never a hard delete: schools are asked for these transcripts, including
     * for the messages that had to be taken down.
     */
    public function deleteMessage(Request $request, string $conversationId, string $messageId): JsonResponse
    {
        $principal = ChatPrincipal::resolve($request->user());
        if (! $principal) {
            return $this->noPrincipal();
        }

        $participant = $this->participantFor($principal, $conversationId);
        if (! $participant) {
            return $this->notAMember();
        }

        // Someone who has left the section is not a moderator of it any more.
        if ($participant->removed_at !== null) {
            return response()->json([
                'success' => false,
                'message' => 'You are no longer a member of this group',
            ], 403);
        }

        $message = ChatMessage::where('conversation_id', $conversationId)
            ->where('id', $messageId)
            ->first();

        if (! $message) {
            return response()->json(['success' => false, 'message' => 'Message not found'], 404);
        }

        $isOwn = $message->sender_type === $principal->type
            && $message->sender_id === $principal->id;

        if ($participant->role !== 'teacher' && ! $isOwn) {
            return response()->json([
                'success' => false,
                'message' => 'Only a teacher can remove someone else’s message',
            ], 403);
        }

        // Already a tombstone. Two teachers reaching for the same message should
        // both see it gone rather than one of them see an error.
        if ($message->deleted_at === null) {
            $message->update([
                'deleted_at' => now(),
                'deleted_by_type' => $principal->type,
                'deleted_by_id' => $principal->id,
            ]);

            $conversation = ChatConversation::find($conversationId);

            // Straight to every open screen. Without this the text stays visible
            // until each client next polls, which is the one thing removal is for.
            if ($conversation) {
                $this->realtime->publish(
                    $conversation,
                    $this->serializeMessage($message),
                    $this->recipientsExcept($conversation, $principal),
                );
            }
        }

        return response()->json([
            'success' => true,
            'data' => $this->serializeMessage($message->fresh()),
        ]);
    }

    /**
     * Close a group to new messages, or reopen it.
     *
     * The teacher's blunt instrument, and blunt is the point: it is reversible
     * and costs nobody their history. The transcript stays readable to everyone;
     * only the composer closes.
     */
    public function setLocked(Request $request, string $conversationId): JsonResponse
    {
        $principal = ChatPrincipal::resolve($request->user());
        if (! $principal) {
            return $this->noPrincipal();
        }

        $participant = $this->participantFor($principal, $conversationId);
        if (! $participant) {
            return $this->notAMember();
        }

        if ($participant->role !== 'teacher' || $participant->removed_at !== null) {
            return response()->json([
                'success' => false,
                'message' => 'Only a teacher of this group can close it',
            ], 403);
        }

        $conversation = ChatConversation::find($conversationId);
        if (! $conversation) {
            return $this->notAMember();
        }

        $locked = $request->boolean('locked');
        $conversation->update(['locked_at' => $locked ? now() : null]);

        return response()->json(['success' => true, 'data' => ['locked' => $locked]]);
    }

    /**
     * A ticket for opening the realtime socket.
     *
     * Answers with `enabled: false` rather than an error when no Worker is
     * configured — that is the ordinary state of a deployment that has not been
     * given one, and the client simply keeps polling.
     */
    public function socketToken(Request $request): JsonResponse
    {
        $principal = ChatPrincipal::resolve($request->user());
        if (! $principal) {
            return $this->noPrincipal();
        }

        $ticket = $this->realtime->socketTicket($principal);

        return response()->json([
            'success' => true,
            'data' => $ticket
                ? ['enabled' => true] + $ticket
                : ['enabled' => false],
        ]);
    }

    /**
     * A token for talking to the chat service directly.
     *
     * The one chat endpoint that survives the move. Longer-lived than the socket
     * ticket because the client uses it for every request, and safe to be so:
     * the token proves identity and nothing more. What this person may read or
     * post is decided by the roster on the service side, on every request — so a
     * student removed from a section loses access at once, not when this
     * expires.
     *
     * Answers with `service: null` where no chat service is configured, which is
     * the ordinary state of a deployment still serving chat from Laravel.
     */
    public function accessToken(Request $request): JsonResponse
    {
        $principal = ChatPrincipal::resolve($request->user());
        if (! $principal) {
            return $this->noPrincipal();
        }

        $ticket = $this->realtime->accessTicket($principal);

        return response()->json([
            'success' => true,
            'data' => $ticket ?? ['service' => null],
        ]);
    }

    /**
     * Hand the chat service a full copy of every roster in this deployment.
     *
     * Called by the service's cron trigger. Membership is pushed as it changes
     * and those pushes cover every write path there is; this exists because the
     * failure mode of a lost push is silent — a student left out of their class
     * group has no way to tell that they are missing one.
     *
     * The reconcile runs first so that what gets sent is freshly derived rather
     * than merely what was stored.
     */
    public function rosterSnapshot(ChatMembershipSync $sync, ChatRosterPublisher $rosters): JsonResponse
    {
        $totals = ['sections' => 0, 'subjects' => 0, 'closed' => 0, 'sent' => 0, 'skipped' => 0];

        foreach (Institution::pluck('id') as $institutionId) {
            $result = $sync->reconcileInstitution($institutionId);
            $sync->takeTouched();

            $pushed = $rosters->pushInstitution($institutionId);

            $totals['sections'] += $result['sections'];
            $totals['subjects'] += $result['subjects'];
            $totals['closed'] += $result['closed'];
            $totals['sent'] += $pushed['sent'];
            $totals['skipped'] += $pushed['skipped'];
        }

        return response()->json(['success' => true, 'data' => $totals]);
    }

    /**
     * Re-derive every group in this deployment from enrolment.
     *
     * Called by the Worker's cron trigger, which is the only scheduler the
     * platform has. Idempotent, so a run that finds nothing wrong costs a few
     * queries and changes nothing.
     */
    public function reconcile(ChatMembershipSync $sync): JsonResponse
    {
        $totals = ['sections' => 0, 'subjects' => 0, 'closed' => 0];

        foreach (Institution::pluck('id') as $institutionId) {
            $result = $sync->reconcileInstitution($institutionId);

            foreach ($totals as $key => $value) {
                $totals[$key] = $value + $result[$key];
            }
        }

        return response()->json(['success' => true, 'data' => $totals]);
    }

    /**
     * Everyone still in the group but the sender.
     *
     * @return array<int,array{type:string,id:string}>
     */
    private function recipientsExcept(ChatConversation $conversation, ChatPrincipal $principal): array
    {
        return ChatParticipant::where('conversation_id', $conversation->id)
            ->whereNull('removed_at')
            ->get()
            ->reject(fn (ChatParticipant $p) => $p->participant_type === $principal->type
                && $p->participant_id === $principal->id)
            ->map(fn (ChatParticipant $p) => [
                'type' => $p->participant_type,
                'id' => $p->participant_id,
            ])
            ->values()
            ->all();
    }

    /** Move this person's read pointer to the newest message they have seen. */
    public function markRead(Request $request, string $conversationId): JsonResponse
    {
        $principal = ChatPrincipal::resolve($request->user());
        if (! $principal) {
            return $this->noPrincipal();
        }

        $participant = $this->participantFor($principal, $conversationId);
        if (! $participant) {
            return $this->notAMember();
        }

        $message = ChatMessage::where('conversation_id', $conversationId)
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->first();

        $participant->update([
            'last_read_message_id' => $message?->id,
            'last_read_at' => $message?->created_at ?? now(),
        ]);

        return response()->json(['success' => true]);
    }

    /**
     * Everything new across all of this person's groups since a cursor.
     *
     * One indexed query feeds every open thread and every unread badge, which is
     * what lets the client poll on a single timer instead of one per group. It
     * is also the reconciliation path once the realtime transport lands: a
     * socket delivers fast, this endpoint is what makes delivery correct after a
     * reconnect.
     */
    public function sync(Request $request): JsonResponse
    {
        $principal = ChatPrincipal::resolve($request->user());
        if (! $principal) {
            return $this->noPrincipal();
        }

        $now = now();
        $participants = $this->participantsFor($principal);

        if ($participants->isEmpty()) {
            return response()->json([
                'success' => true,
                'data' => [
                    'messages' => [],
                    'conversations' => [],
                    'cursor' => $now->toJSON(),
                    'truncated' => false,
                ],
            ]);
        }

        $conversationIds = $participants->keys()->all();
        $messages = collect();
        $truncated = false;

        if ($since = $request->query('since')) {
            $from = Carbon::parse($since)->subSeconds(self::SYNC_OVERLAP_SECONDS);

            // Changed, not posted. A message a teacher removes an hour after it
            // was sent has to reach the people still looking at it, and a poll
            // keyed on created_at would never mention that row again.
            $messages = ChatMessage::whereIn('conversation_id', $conversationIds)
                ->where('updated_at', '>', $from)
                ->orderBy('updated_at')
                ->orderBy('id')
                ->limit(self::SYNC_LIMIT + 1)
                ->get();

            // More waiting than one poll should carry — hand back a page and let
            // the client reload the threads it has open rather than growing this
            // response without a bound.
            if ($messages->count() > self::SYNC_LIMIT) {
                $truncated = true;
                $messages = $messages->take(self::SYNC_LIMIT);
            }
        }

        $unread = $this->unreadCounts($principal, $participants);

        $summaries = ChatConversation::whereIn('id', $conversationIds)
            ->get()
            ->map(fn (ChatConversation $c) => [
                'id' => $c->id,
                'last_message_at' => $c->last_message_at?->toJSON(),
                'unread_count' => (int) ($unread[$c->id] ?? 0),
                'locked' => $c->locked(),
                // The lock has to be part of this, not just of the conversation
                // list: the client folds every sync response over its cached
                // state, so a `can_post` computed from membership alone reopens
                // the composer within one poll of a teacher closing the group.
                'can_post' => (bool) $participants->get($c->id)?->canPost() && ! $c->locked(),
            ]);

        return response()->json([
            'success' => true,
            'data' => [
                'messages' => $messages->map(fn ($m) => $this->serializeMessage($m))->values(),
                'conversations' => $summaries->values(),
                // On a truncated page, resume from the last message actually
                // handed over — not from `now`, which would skip the remainder.
                'cursor' => $truncated
                    ? $messages->last()->updated_at->toJSON()
                    : $now->toJSON(),
                'truncated' => $truncated,
            ],
        ]);
    }

    /** Unread badge total across every group, for the sidebar. */
    public function unreadCount(Request $request): JsonResponse
    {
        $principal = ChatPrincipal::resolve($request->user());
        if (! $principal) {
            return response()->json(['success' => true, 'data' => ['count' => 0]]);
        }

        $participants = $this->participantsFor($principal);
        $counts = $this->unreadCounts($principal, $participants);

        return response()->json([
            'success' => true,
            'data' => ['count' => array_sum($counts)],
        ]);
    }

    /* ===================== internals ===================== */

    /** @return Collection<string,ChatParticipant> keyed by conversation id */
    private function participantsFor(ChatPrincipal $principal): Collection
    {
        return ChatParticipant::query()
            ->forPerson($principal->type, $principal->id)
            ->get()
            ->keyBy('conversation_id');
    }

    private function participantFor(ChatPrincipal $principal, string $conversationId): ?ChatParticipant
    {
        return ChatParticipant::query()
            ->forPerson($principal->type, $principal->id)
            ->where('conversation_id', $conversationId)
            ->first();
    }

    /**
     * Unread totals for every group in one query.
     *
     * Each participant has their own cutoff, so this is an OR of
     * (conversation, since) pairs rather than a single range — with the ten or
     * so groups one person is in, that stays well inside the composite index.
     *
     * @param  Collection<string,ChatParticipant>  $participants
     * @return array<string,int>
     */
    private function unreadCounts(ChatPrincipal $principal, Collection $participants): array
    {
        if ($participants->isEmpty()) {
            return [];
        }

        return ChatMessage::query()
            ->selectRaw('conversation_id, count(*) as total')
            ->whereNull('deleted_at')
            // Your own messages are never unread to you.
            ->whereNot(fn ($q) => $q->where('sender_type', $principal->type)
                ->where('sender_id', $principal->id))
            ->where(function ($q) use ($participants) {
                foreach ($participants as $participant) {
                    $q->orWhere(function ($inner) use ($participant) {
                        $inner->where('conversation_id', $participant->conversation_id);
                        if ($participant->last_read_at) {
                            $inner->where('created_at', '>', $participant->last_read_at);
                        }
                    });
                }
            })
            ->groupBy('conversation_id')
            ->pluck('total', 'conversation_id')
            ->all();
    }

    /**
     * The newest message in each group, for the list preview.
     *
     * max(id) is the newest because message ids are ULIDs — they sort by the
     * time they were minted. With a random UUID this would need a window
     * function or a join per conversation.
     *
     * @param  array<int,string>  $conversationIds
     * @return Collection<string,ChatMessage>
     */
    private function latestMessages(array $conversationIds): Collection
    {
        if ($conversationIds === []) {
            return collect();
        }

        $ids = ChatMessage::selectRaw('max(id) as id')
            ->whereIn('conversation_id', $conversationIds)
            ->groupBy('conversation_id')
            ->pluck('id');

        return ChatMessage::whereIn('id', $ids)->get()->keyBy('conversation_id');
    }

    private function serializeConversation(
        ChatConversation $conversation,
        ?ChatParticipant $participant,
        int $unreadCount,
        ?ChatMessage $latest,
    ): array {
        return [
            'id' => $conversation->id,
            'type' => $conversation->type,
            'title' => $conversation->title,
            'subtitle' => $conversation->subtitle,
            'academic_year' => $conversation->academic_year,
            'last_message_at' => $conversation->last_message_at?->toJSON(),
            'locked' => $conversation->locked(),
            'unread_count' => $unreadCount,
            'role' => $participant?->role,
            'can_post' => (bool) $participant?->canPost() && ! $conversation->locked(),
            // A group someone was removed from is shown, but filed away.
            'archived' => $participant?->removed_at !== null,
            'last_message' => $latest ? [
                'sender_name' => $latest->sender_name,
                'preview' => $latest->isDeleted() ? 'Message removed' : mb_strimwidth($latest->body, 0, 80, '…'),
                'created_at' => $latest->created_at->toJSON(),
            ] : null,
        ];
    }

    private function serializeMessage(ChatMessage $message): array
    {
        $deleted = $message->isDeleted();

        return [
            'id' => $message->id,
            'conversation_id' => $message->conversation_id,
            'sender_type' => $message->sender_type,
            'sender_id' => $message->sender_id,
            'sender_name' => $message->sender_name,
            // A removed message keeps its place in the transcript but never its
            // text — not even to the people who already saw it.
            'body' => $deleted ? null : $message->body,
            'is_deleted' => $deleted,
            'reply_to_id' => $message->reply_to_id,
            'edited_at' => $message->edited_at?->toJSON(),
            'created_at' => $message->created_at->toJSON(),
        ];
    }

    private function noPrincipal(): JsonResponse
    {
        return response()->json([
            'success' => false,
            'message' => 'Chat is not available for this account',
        ], 403);
    }

    private function notAMember(): JsonResponse
    {
        // Deliberately the same answer whether the group is missing or simply
        // not theirs — otherwise this endpoint reports which conversation ids
        // exist to anyone willing to iterate.
        return response()->json([
            'success' => false,
            'message' => 'Conversation not found',
        ], 404);
    }
}
