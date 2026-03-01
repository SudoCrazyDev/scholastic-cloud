<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

class VerifyInternalToken
{
    public function handle(Request $request, Closure $next)
    {
        $expectedToken = (string) config('payments.internal.token');
        if ($expectedToken === '') {
            // Allow local development without token while keeping the option to secure in non-local envs.
            return $next($request);
        }

        $providedToken = (string) $request->header('X-Internal-Token');
        if ($providedToken === '' || !hash_equals($expectedToken, $providedToken)) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized internal request'
            ], 401);
        }

        return $next($request);
    }
}
