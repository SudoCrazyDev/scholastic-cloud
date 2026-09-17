<?php

use App\Models\Institution;
use App\Services\Chat\ChatMembershipSync;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Log;

/**
 * Opens the group chats for sections and subjects that already existed.
 *
 * Chat membership is derived, and the derivation is driven by model observers:
 * a group opens when its section, subject or enrolment row is next written.
 * Nothing opens one for a record that was written before the feature shipped,
 * and a school year's sections and enrolment are written in June — months
 * before chat landed in August. So the advisory a teacher has had all year has
 * no group, while the subjects they were reassigned in October do.
 *
 * On the deployment this was written for, 20 of 27 advisories and 155 of 196
 * subjects were missing. The gap does not repair itself: `chat:sync` has to be
 * run by hand, and the only other caller of the reconcile is the chat service's
 * cron, which is a 404 on any school still serving chat from its own MySQL
 * (AuthenticateChatWorker closes the route when CHAT_WORKER_SECRET is unset).
 * Migrations are the one thing that does run on every host, so the repair rides
 * along with them.
 *
 * Safe to run against a school already using chat. The sync is idempotent and
 * deliberately touches neither read positions nor the lock — someone who left a
 * section and came back keeps their place rather than being handed every
 * message sent while they were gone.
 */
return new class extends Migration
{
    public function up(): void
    {
        $sync = app(ChatMembershipSync::class);

        foreach (Institution::pluck('id') as $institutionId) {
            try {
                $result = $sync->reconcileInstitution($institutionId);

                // The conversations this rebuilt are collected for the caller to
                // push onward to the chat service. There is nobody to push to
                // from inside a migration, and the service re-reads the roster
                // on its own cron anyway, so drop them.
                $sync->takeTouched();

                Log::info('Backfilled chat groups', ['institution' => $institutionId] + $result);
            } catch (\Throwable $e) {
                // One school's bad data must not abort the deploy for the rest.
                // A missing group is a nuisance; a migration that fails leaves
                // the whole release half-applied.
                Log::error('Chat group backfill failed', [
                    'institution' => $institutionId,
                    'exception' => $e,
                ]);
            }
        }
    }

    public function down(): void
    {
        // Nothing to undo. This opens groups that the school's own enrolment
        // says should exist, and deleting them would take their transcripts
        // with them.
    }
};
