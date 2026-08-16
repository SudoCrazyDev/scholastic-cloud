<?php

namespace App\Services\Chat;

use App\Models\ChatConversation;
use App\Models\ChatParticipant;
use App\Support\Features;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Sends group membership to the chat service.
 *
 * This is the only thing that crosses between the two systems on the write
 * side. Laravel stays the authority on who belongs where — it is the only place
 * that can compute it, since the answer comes from enrolment — and the service
 * holds a copy so it can authorize a message without asking.
 *
 * Membership changes a handful of times a day. Messages arrive constantly. That
 * asymmetry is the reason the split works: the rare thing crosses the boundary
 * and the frequent thing never does.
 */
class ChatRosterPublisher
{
    private const BREAKER_KEY = 'chat:roster:breaker';

    private const FAILURE_KEY = 'chat:roster:failures';

    private const FAILURE_THRESHOLD = 3;

    private const BREAKER_SECONDS = 60;

    public function enabled(): bool
    {
        return filled(config('chat.worker.url'))
            && filled(config('chat.worker.secret'))
            && filled(config('chat.tenant'));
    }

    /**
     * Whether this institution's membership may leave the building at all.
     *
     * A school without the chat feature has no groups to serve, and its roster
     * is a list of which minors sit in which class — so it does not get copied
     * to a third party on the off-chance the feature is switched on later. The
     * snapshot pass repairs whatever is missing on the day it is.
     *
     * Checked here rather than at each call site so no future caller can miss
     * it: this class is the only thing that sends membership anywhere.
     */
    private function permitted(?string $institutionId): bool
    {
        return $institutionId !== null && Features::enabled($institutionId, 'chat');
    }

    /**
     * Push one group's membership.
     *
     * Called after the roster has been re-derived, so what goes out is always
     * the whole current list rather than a diff — a diff would need the service
     * and Laravel to agree on a starting point, and recovering when they did not
     * is exactly the failure this design avoids.
     */
    public function push(ChatConversation $conversation): bool
    {
        if (! $this->permitted($conversation->institution_id)) {
            return false;
        }

        return $this->send([$this->payloadFor($conversation)], [$conversation->id]);
    }

    /**
     * Push every group in an institution.
     *
     * The repair pass. Runs on the service's cron trigger because no
     * ScholasticCloud deployment runs a scheduler of its own.
     *
     * @return array{sent:int,skipped:int}
     */
    public function pushInstitution(string $institutionId, int $chunkSize = 50): array
    {
        if (! $this->enabled() || ! $this->permitted($institutionId)) {
            return ['sent' => 0, 'skipped' => 0];
        }

        $sent = 0;
        $skipped = 0;

        ChatConversation::where('institution_id', $institutionId)
            ->orderBy('id')
            ->chunkById($chunkSize, function ($conversations) use (&$sent, &$skipped) {
                $payloads = [];
                $ids = [];

                foreach ($conversations as $conversation) {
                    $payloads[] = $this->payloadFor($conversation);
                    $ids[] = $conversation->id;
                }

                if ($this->send($payloads, $ids)) {
                    $sent += count($payloads);
                } else {
                    $skipped += count($payloads);
                }
            });

        return ['sent' => $sent, 'skipped' => $skipped];
    }

    /**
     * Build the wire form of one group, bumping its generation counter.
     *
     * The bump happens here rather than at the call site so that every payload
     * that leaves is guaranteed to carry a version higher than the last one for
     * that group — including the repair snapshot, which must be able to win
     * against whatever the service currently holds.
     */
    private function payloadFor(ChatConversation $conversation): array
    {
        $conversation->increment('roster_version');

        $participants = ChatParticipant::where('conversation_id', $conversation->id)
            ->get()
            ->map(fn (ChatParticipant $p) => [
                'type' => $p->participant_type,
                'id' => $p->participant_id,
                'role' => $p->role,
                'removed_at' => $p->removed_at?->toJSON(),
            ])
            ->values()
            ->all();

        return [
            'conversation' => [
                'id' => $conversation->id,
                'institution_id' => $conversation->institution_id,
                'type' => $conversation->type,
                'title' => $conversation->title,
                'subtitle' => $conversation->subtitle,
                'academic_year' => (string) $conversation->academic_year,
                // Deliberately no locked_at. A roster says who is enrolled,
                // which is Laravel's to know; whether the teacher has closed the
                // group is decided in the app and held by whichever backend is
                // serving it. Sending it here would let a roster push arriving a
                // second after a teacher closed a group quietly reopen it.
                'version' => (int) $conversation->roster_version,
            ],
            'participants' => $participants,
        ];
    }

    /**
     * @param  array<int,array<string,mixed>>  $rosters
     * @param  array<int,string>  $conversationIds
     */
    private function send(array $rosters, array $conversationIds): bool
    {
        if (! $this->enabled() || $rosters === []) {
            return false;
        }

        // An unreachable service would otherwise cost every enrolment save the
        // full timeout. After a few failures in a row, stop trying for a minute
        // and let the half-hourly snapshot carry the repair.
        if (Cache::get(self::BREAKER_KEY)) {
            return false;
        }

        try {
            $response = Http::timeout((float) config('chat.worker.timeout'))
                ->withHeaders([
                    'Authorization' => 'Bearer '.config('chat.worker.secret'),
                    'X-Chat-Tenant' => config('chat.tenant'),
                ])
                ->post(rtrim(config('chat.worker.url'), '/').'/internal/rosters', [
                    'rosters' => $rosters,
                ]);

            if ($response->failed()) {
                $this->recordFailure('HTTP '.$response->status());

                return false;
            }

            Cache::forget(self::FAILURE_KEY);

            ChatConversation::whereIn('id', $conversationIds)->update(['roster_pushed_at' => now()]);

            return true;
        } catch (\Throwable $e) {
            $this->recordFailure($e->getMessage());

            return false;
        }
    }

    /**
     * A failed push is never an error the person saving an enrolment sees.
     * Membership drifting for one reconcile interval is a nuisance; a chat bug
     * refusing to let a school transfer a student is not acceptable, and this
     * code runs on the transfer path.
     */
    private function recordFailure(string $reason): void
    {
        $failures = (int) Cache::get(self::FAILURE_KEY, 0) + 1;

        Log::warning('Chat roster push failed', [
            'consecutive_failures' => $failures,
            'reason' => $reason,
        ]);

        if ($failures >= self::FAILURE_THRESHOLD) {
            Cache::put(self::BREAKER_KEY, true, now()->addSeconds(self::BREAKER_SECONDS));
            Cache::forget(self::FAILURE_KEY);

            return;
        }

        Cache::put(self::FAILURE_KEY, $failures, now()->addMinutes(5));
    }
}
