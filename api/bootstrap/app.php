<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
        then: function () {
            // ZKTeco ADMS (iClock) routes — no /api/ prefix, no auth middleware
            \Illuminate\Support\Facades\Route::prefix('iclock')
                ->middleware([])
                ->group(base_path('routes/iclock.php'));
        },
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Applies the `api` limiter defined in AppServiceProvider. Without
        // this, no API route is rate limited at all.
        $middleware->throttleApi();

        $middleware->alias([
            // TESTING AID — honours `?as_of=YYYY-MM-DD` so a payment plan's schedule can be
            // read as it will stand in a later month. Attached per route rather than to the
            // api group, because it must run after authentication: moving the clock forward
            // before the token's expiry is checked makes a valid session look expired.
            // No-ops outside local/testing. Remove together with the middleware class and
            // its two uses in routes/api.php.
            'simulate.date'     => \App\Http\Middleware\SimulateRequestDate::class,
            'auth.token'        => \App\Http\Middleware\AuthenticateToken::class,
            'auth.bridge.token' => \App\Http\Middleware\AuthenticateBridgeToken::class,
            'auth.sms.token'    => \App\Http\Middleware\AuthenticateSmsToken::class,
            'auth.chat.worker'  => \App\Http\Middleware\AuthenticateChatWorker::class,
            'module'            => \App\Http\Middleware\EnsureModuleAccess::class,
            // What the school has, as opposed to what the person may reach.
            'feature'           => \App\Http\Middleware\EnsureFeatureEnabled::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        //
    })->create();
