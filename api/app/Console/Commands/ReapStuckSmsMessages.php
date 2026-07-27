<?php

namespace App\Console\Commands;

use App\Services\SmsService;
use Illuminate\Console\Command;

/**
 * Fails outbound SMS a gateway claimed but never reported on.
 *
 * The same reap runs opportunistically on every outbox poll, so a live kiosk
 * self-heals without cron. This command covers the case nothing else can: the
 * gateway is offline or gone, and its claimed rows would otherwise sit in
 * `sending` on the Messages screen indefinitely.
 */
class ReapStuckSmsMessages extends Command
{
    protected $signature = 'sms:reap-stuck
                            {--minutes= : Age in minutes before a sending row is failed (default 10)}
                            {--institution= : Limit to one institution UUID}';

    protected $description = 'Mark stuck outbound SMS (claimed but never reported) as failed';

    public function handle(SmsService $sms): int
    {
        $minutes = $this->option('minutes') !== null
            ? (int) $this->option('minutes')
            : SmsService::STUCK_AFTER_MINUTES;

        if ($minutes < 1) {
            $this->error('--minutes must be at least 1.');

            return self::FAILURE;
        }

        $reaped = $sms->reapStuck($this->option('institution'), $minutes);

        $this->info($reaped === 0
            ? "No stuck messages older than {$minutes} minute(s)."
            : "Reaped {$reaped} stuck message(s) older than {$minutes} minute(s).");

        return self::SUCCESS;
    }
}
