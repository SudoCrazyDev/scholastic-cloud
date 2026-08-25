<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Symfony\Component\HttpFoundation\Response;

/**
 * TESTING AID — lets a request pretend it is being made on another date.
 *
 * A reamortizing payment plan prices each period from the balance on the day that period
 * opened, so seeing what November bills means being in November. Rather than wait, pass
 * `?as_of=2026-11-15` and the whole request — schedule, notice of account, everything that
 * reads the clock — runs as though that were today.
 *
 * Refuses to do anything outside a local/testing environment, so it cannot be used against
 * real school data even if the parameter is left in a URL somewhere.
 *
 * Two things to know while using it:
 *  - It moves the clock for the entire request, `now()` included. On a plan that DOES charge
 *    surcharges, loading a ledger at a simulated future date will book real late-fee rows
 *    dated then, because that is what a ledger load does. Reamortizing plans assess nothing,
 *    so they are safe to browse freely.
 *  - It changes only what is read, never what has been recorded. To pretend a payment was
 *    made in August, set the payment date on the cashiering form — that is a real field.
 *
 * Delete this file, its alias in bootstrap/app.php, and the `as_of` pass-through in
 * app/src/services/studentFinanceService.ts to remove the feature.
 */
class SimulateRequestDate
{
    public function handle(Request $request, Closure $next): Response
    {
        $asOf = $request->query('as_of');

        if (! $asOf || ! app()->environment(['local', 'testing'])) {
            return $next($request);
        }

        try {
            // Midday, so a timezone shift either way cannot land the simulated clock on a
            // different calendar day than the one that was asked for.
            $simulated = Carbon::parse($asOf)->setTime(12, 0);
        } catch (\Throwable) {
            return $next($request);
        }

        Carbon::setTestNow($simulated);

        try {
            $response = $next($request);
        } finally {
            // Always handed back, so a queued job or a later request in the same process
            // never inherits the simulated clock.
            Carbon::setTestNow();
        }

        $response->headers->set('X-Simulated-Date', $simulated->toDateString());

        return $response;
    }
}
