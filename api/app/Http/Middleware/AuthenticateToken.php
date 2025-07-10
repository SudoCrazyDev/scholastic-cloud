<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Carbon\Carbon;

class AuthenticateToken
{
    /**
     * Handle an incoming request.
     *
     * @param  \Illuminate\Http\Request  $request
     * @param  \Closure(\Illuminate\Http\Request): (\Illuminate\Http\Response|\Illuminate\Http\RedirectResponse)  $next
     * @return \Illuminate\Http\Response|\Illuminate\Http\RedirectResponse
     */
    public function handle(Request $request, Closure $next)
    {
        $token = $request->header('Authorization');

        if (!$token) {
            return response()->json([
                'message' => 'Authorization token required'
            ], 401);
        }

        // Remove 'Bearer ' prefix if present
        $token = str_replace('Bearer ', '', $token);

        // Find user by token
        $user = User::where('token', $token)->first();

        if (!$user) {
            return response()->json([
                'message' => 'Invalid token'
            ], 401);
        }

        // Check if token has expired
        if ($user->token_expiry && Carbon::parse($user->token_expiry)->isPast()) {
            // Clear expired token
            $user->update([
                'token' => null,
                'token_expiry' => null,
            ]);

            return response()->json([
                'message' => 'Token has expired'
            ], 401);
        }

        // Add user to request
        $request->merge(['user' => $user]);
        
        // Set user for Auth facade
        Auth::setUser($user);

        return $next($request);
    }
} 