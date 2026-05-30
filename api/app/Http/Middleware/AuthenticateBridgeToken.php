<?php

namespace App\Http\Middleware;

use App\Models\BiometricDevice;
use Closure;
use Illuminate\Http\Request;

class AuthenticateBridgeToken
{
    public function handle(Request $request, Closure $next)
    {
        $token = $request->header('Authorization');

        if (!$token) {
            return response()->json(['message' => 'Authorization token required'], 401);
        }

        $token = str_replace('Bearer ', '', $token);

        $hash = hash('sha256', $token);
        $device = BiometricDevice::where('bridge_token_hash', $hash)->first();

        if (!$device) {
            return response()->json(['message' => 'Invalid bridge token'], 401);
        }

        $request->attributes->set('bridge_device', $device);

        return $next($request);
    }
}
