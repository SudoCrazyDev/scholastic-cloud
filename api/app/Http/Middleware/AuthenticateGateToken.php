<?php

namespace App\Http\Middleware;

use App\Models\GateDevice;
use Closure;
use Illuminate\Http\Request;

/**
 * Authenticates a paired gate kiosk by its long-lived device token.
 *
 * Same shape as AuthenticateSmsToken: the plaintext token lives on the device,
 * only its sha256 is stored, and a revoked device (hash nulled in the portal)
 * fails here on its next call. The kiosk treats that 401 as "purge the local
 * roster and photos" — so this middleware is the revocation mechanism.
 */
class AuthenticateGateToken
{
    public function handle(Request $request, Closure $next)
    {
        $token = $request->header('Authorization');

        if (! $token) {
            return response()->json(['message' => 'Authorization token required'], 401);
        }

        $token = str_replace('Bearer ', '', $token);

        $device = GateDevice::where('device_token_hash', hash('sha256', $token))->first();

        if (! $device) {
            return response()->json(['message' => 'Invalid device token'], 401);
        }

        $request->attributes->set('gate_device', $device);

        return $next($request);
    }
}
