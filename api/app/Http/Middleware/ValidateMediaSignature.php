<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Routing\Exceptions\InvalidSignatureException;
use Illuminate\Support\Facades\URL;

/**
 * Signature check for the `media.show` route.
 *
 * Media links are permanent and are stored inside assessment and lesson
 * content, so both signature styles are in circulation and both have to keep
 * working:
 *
 *  - relative — what MediaUrl hands out now; the signature covers only the path
 *    and query, so the link survives a proxy that forwards plain HTTP and a
 *    move to a new domain;
 *  - absolute — everything minted before that change, still valid as long as
 *    the request arrives on the origin it was signed for.
 *
 * Accepting either is what lets the switch happen without a migration. The
 * relative check is tried first because it is the shape all new links take.
 */
class ValidateMediaSignature
{
    public function handle(Request $request, Closure $next)
    {
        if (URL::hasValidSignature($request, absolute: false)
            || URL::hasValidSignature($request, absolute: true)) {
            return $next($request);
        }

        throw new InvalidSignatureException;
    }
}
