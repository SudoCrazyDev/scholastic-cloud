<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

/**
 * Guards the endpoint the Cloudflare Worker's cron trigger calls.
 *
 * Machine-to-machine, so it carries the tenant secret rather than a user token.
 * When realtime is not configured the route is closed outright — an unset
 * secret must never become an open door.
 */
class AuthenticateChatWorker
{
    public function handle(Request $request, Closure $next)
    {
        $expected = (string) config('chat.worker.secret');

        if ($expected === '') {
            return response()->json(['message' => 'Chat worker is not configured'], 404);
        }

        $provided = str_replace('Bearer ', '', (string) $request->header('Authorization'));

        if (! hash_equals($expected, $provided)) {
            return response()->json(['message' => 'Invalid worker token'], 401);
        }

        return $next($request);
    }
}
