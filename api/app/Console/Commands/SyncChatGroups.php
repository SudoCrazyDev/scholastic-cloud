<?php

namespace App\Console\Commands;

use App\Models\Institution;
use App\Services\Chat\ChatMembershipSync;
use Illuminate\Console\Command;

/**
 * Re-derives every group chat from the sections and subjects it mirrors.
 *
 * Two jobs. The first is the backfill: model observers open a group when a
 * section or subject is written, so a school that has not touched either since
 * chat shipped would have none. Running this once turns the feature on for
 * records that already exist.
 *
 * The second is repair. The observers cover every write path there is today,
 * but a roster that silently drifts is the failure mode this feature cannot
 * afford — a student left out of their class group has no way to tell that they
 * are missing one. Re-running is free and idempotent, so it can be scheduled
 * once anything on a deployment runs a scheduler (nothing does today; see
 * routes/console.php).
 */
class SyncChatGroups extends Command
{
    protected $signature = 'chat:sync
                            {--institution= : Limit to one institution UUID}';

    protected $description = 'Re-derive group chat membership from sections, subjects and enrolment';

    public function handle(ChatMembershipSync $sync): int
    {
        $institutions = $this->option('institution')
            ? Institution::where('id', $this->option('institution'))->get()
            : Institution::all();

        if ($institutions->isEmpty()) {
            $this->error('No matching institution.');

            return self::FAILURE;
        }

        foreach ($institutions as $institution) {
            $result = $sync->reconcileInstitution($institution->id);

            $this->line(sprintf(
                '%s — %d section(s), %d subject(s), %d closed',
                $institution->title,
                $result['sections'],
                $result['subjects'],
                $result['closed'],
            ));
        }

        $this->info('Chat groups are in step with enrolment.');

        return self::SUCCESS;
    }
}
