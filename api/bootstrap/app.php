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
            'auth.token'        => \App\Http\Middleware\AuthenticateToken::class,
            'auth.bridge.token' => \App\Http\Middleware\AuthenticateBridgeToken::class,
            'auth.sms.token'    => \App\Http\Middleware\AuthenticateSmsToken::class,
            'module'            => \App\Http\Middleware\EnsureModuleAccess::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        //
    })->create();
