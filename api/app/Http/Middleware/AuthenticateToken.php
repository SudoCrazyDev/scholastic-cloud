<?php

namespace App\Http\Middleware;

use App\Auth\StudentPortalUser;
use App\Models\User;
use App\Models\StudentAuth;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Carbon\Carbon;

class AuthenticateToken
{
    /**
     * Handle an incoming request.
     * Try User by token first, then StudentAuth (student portal login).
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

        // 1. Try User (staff/admin) by token
        $user = User::where('token', $token)->first();

        if ($user) {
            if ($user->token_expiry && Carbon::parse($user->token_expiry)->isPast()) {
                $user->update(['token' => null, 'token_expiry' => null]);
                return response()->json(['message' => 'Token has expired'], 401);
            }
            Auth::setUser($user);
            return $next($request);
        }

        // 2. Try StudentAuth (student portal) by token
        $studentAuth = StudentAuth::with('student')->where('token', $token)->first();

        if ($studentAuth) {
            if ($studentAuth->token_expiry && Carbon::parse($studentAuth->token_expiry)->isPast()) {
                $studentAuth->update(['token' => null, 'token_expiry' => null]);
                return response()->json(['message' => 'Token has expired'], 401);
            }
            $portalUser = new StudentPortalUser($studentAuth->student, $studentAuth);
            Auth::setUser($portalUser);
            return $next($request);
        }

        return response()->json([
            'message' => 'Invalid token'
        ], 401);
    }
} 