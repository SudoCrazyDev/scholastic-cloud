<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Carbon\Carbon;

class AuthController extends Controller
{
    /**
     * Login user and return token
     */
    public function login(Request $request)
    {
        $request->validate([
            'email' => 'required|email',
            'password' => 'required|string',
        ]);

        $user = User::where('email', $request->email)->first();

        if (!$user || !Hash::check($request->password, $user->password)) {
            return response()->json([
                'message' => 'Invalid credentials'
            ], 401);
        }

        // Generate token and set expiry to 24 hours
        $token = Str::random(60);
        $tokenExpiry = Carbon::now()->addHours(24)->toDateTimeString();

        // Update user with new token and expiry
        $user->update([
            'token' => $token,
            'token_expiry' => $tokenExpiry,
        ]);

        return response()->json([
            'token' => $token,
            'token_expiry' => $tokenExpiry,
        ]);
    }

    /**
     * Logout user by clearing token
     */
    public function logout(Request $request)
    {
        $user = $request->user();
        
        if ($user) {
            $user->update([
                'token' => null,
                'token_expiry' => null,
            ]);
        }

        return response()->json([
            'message' => 'Logged out successfully'
        ]);
    }

    /**
     * Get current user profile
     */
    public function profile(Request $request)
    {
        $user = $request->user();
        
        if (!$user) {
            return response()->json([
                'message' => 'User not found'
            ], 404);
        }

        return response()->json([
            'data' => [
                'id' => $user->id,
                'first_name' => $user->first_name,
                'middle_name' => $user->middle_name,
                'last_name' => $user->last_name,
                'ext_name' => $user->ext_name,
                'email' => $user->email,
                'gender' => $user->gender,
                'birthdate' => $user->birthdate,
                'is_new' => $user->is_new,
                'is_active' => $user->is_active,
                'role' => $user->role ? [
                    'title' => $user->role->title,
                    'slug' => $user->role->slug,
                ] : null,
                'created_at' => $user->created_at,
                'updated_at' => $user->updated_at,
            ]
        ]);
    }
} 