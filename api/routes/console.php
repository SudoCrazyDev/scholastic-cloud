<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Resolve outbound SMS a kiosk claimed but never reported on. This entry only fires
// where `php artisan schedule:run` is on cron — no deployment currently runs one, so
// treat it as a backstop; the outbox poll reaps the same rows on its own.
Schedule::command('sms:reap-stuck')->everyFiveMinutes()->withoutOverlapping();
