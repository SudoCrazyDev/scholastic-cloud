<?php

namespace App\Http\Controllers;

use App\Auth\StudentPortalUser;
use App\Models\User;
use App\Models\Student;
use App\Models\StudentAuth;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Carbon\Carbon;
use Illuminate\Support\Facades\Log;

class AuthController extends Controller
{
    /**
     * Login: try User (staff) first, then StudentAuth (student) if email not found in users.
     */
    public function login(Request $request)
    {
        $request->validate([
            'email' => 'required|email',
            'password' => 'required|string',
        ]);

        $token = Str::random(60);
        $tokenExpiry = Carbon::now()->addHours(24)->toDateTimeString();

        // 1. Try User (staff/admin)
        $user = User::where('email', $request->email)->first();

        if ($user && Hash::check($request->password, $user->password)) {
            $user->update([
                'token' => $token,
                'token_expiry' => $tokenExpiry,
            ]);
            return response()->json([
                'token' => $token,
                'token_expiry' => $tokenExpiry,
            ]);
        }

        // 2. Try StudentAuth (student portal)
        $studentAuth = StudentAuth::with(['student.studentInstitutions.institution'])
            ->where('email', $request->email)->first();

        if ($studentAuth && Hash::check($request->password, $studentAuth->password)) {
            $student = $studentAuth->student;

            // Check student's institutions: must belong to at least one
            $student->loadMissing('studentInstitutions.institution');
            $institutions = $student->studentInstitutions->map(function ($si) {
                $inst = $si->institution;
                return [
                    'institution_id' => $si->institution_id,
                    'institution' => $inst ? [
                        'id' => $inst->id,
                        'name' => $inst->title ?? $inst->name ?? null,
                    ] : null,
                ];
            })->filter(fn ($i) => $i['institution'] !== null)->values()->all();

            if (empty($institutions)) {
                return response()->json([
                    'message' => 'Student is not assigned to any institution. Please contact your school.',
                ], 403);
            }

            $studentAuth->update([
                'token' => $token,
                'token_expiry' => $tokenExpiry,
            ]);

            // Return user with role student and institutions
            $userData = [
                'id' => $student->id,
                'first_name' => $student->first_name,
                'middle_name' => $student->middle_name,
                'last_name' => $student->last_name,
                'ext_name' => $student->ext_name,
                'email' => $studentAuth->email,
                'gender' => $student->gender,
                'birthdate' => $student->birthdate,
                'is_new' => $studentAuth->is_new,
                'is_active' => $student->is_active,
                'role' => [
                    'title' => 'Student',
                    'slug' => 'student',
                ],
                'user_institutions' => $institutions,
                'created_at' => $student->created_at,
                'updated_at' => $student->updated_at,
                'student_id' => $student->id,
            ];
            return response()->json([
                'token' => $token,
                'token_expiry' => $tokenExpiry,
                'user' => $userData,
            ]);
        }

        return response()->json([
            'message' => 'Invalid credentials'
        ], 401);
    }

    /**
     * Logout: clear token for User or StudentAuth
     */
    public function logout(Request $request)
    {
        $user = $request->user();

        if ($user instanceof StudentPortalUser) {
            $user->studentAuth->update([
                'token' => null,
                'token_expiry' => null,
            ]);
        } elseif ($user) {
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
     * Update password (User or StudentAuth)
     */
    public function updatePassword(Request $request)
    {
        $request->validate([
            'password' => 'required|string|min:8',
        ]);

        $user = $request->user();

        if (!$user) {
            return response()->json([
                'message' => 'User not found'
            ], 404);
        }

        if ($user instanceof StudentPortalUser) {
            $user->studentAuth->update([
                'password' => Hash::make($request->password),
                'is_new' => false,
            ]);
        } else {
            $user->update([
                'password' => Hash::make($request->password),
                'is_new' => false,
            ]);
        }

        return response()->json([
            'message' => 'Password updated successfully'
        ]);
    }

    /**
     * Get current user profile (staff User or student via StudentPortalUser)
     */
    public function profile(Request $request)
    {
        $user = $request->user();

        if (!$user) {
            return response()->json([
                'message' => 'User not found'
            ], 404);
        }

        // Student logged in via student_auth
        if ($user instanceof StudentPortalUser) {
            $student = $user->student;
            $auth = $user->studentAuth;
            $role = $user->getRole();
            $student->loadMissing('studentInstitutions.institution');
            $userInstitutions = $student->studentInstitutions->map(function ($si) {
                $inst = $si->institution;
                return [
                    'institution_id' => $si->institution_id,
                    'institution' => $inst ? [
                        'id' => $inst->id,
                        'name' => $inst->title ?? ($inst->name ?? null),
                    ] : null,
                ];
            })->filter(fn ($i) => $i['institution'] !== null)->values()->all();

            $data = [
                'id' => $student->id,
                'first_name' => $student->first_name,
                'middle_name' => $student->middle_name,
                'last_name' => $student->last_name,
                'ext_name' => $student->ext_name,
                'email' => $auth->email,
                'gender' => $student->gender,
                'birthdate' => $student->birthdate,
                'is_new' => $auth->is_new,
                'is_active' => $student->is_active,
                'role' => [
                    'title' => $role->title,
                    'slug' => $role->slug,
                ],
                'user_institutions' => $userInstitutions,
                'created_at' => $student->created_at,
                'updated_at' => $student->updated_at,
                'student_id' => $student->id,
            ];
            return response()->json(['data' => $data]);
        }

        // Staff User
        $user->load(['userInstitutions.role', 'userInstitutions.institution', 'directRole']);
        $role = $user->getRole();
        $student = Student::where('user_id', $user->id)->first();

        $data = [
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
            'role' => $role ? [
                'title' => $role->title,
                'slug' => $role->slug,
            ] : null,
            'user_institutions' => $user->userInstitutions->map(function ($userInstitution) {
                return [
                    'institution_id' => $userInstitution->institution_id,
                    'role_id' => $userInstitution->role_id,
                    'is_default' => $userInstitution->is_default,
                    'is_main' => $userInstitution->is_main,
                    'role' => $userInstitution->role ? [
                        'title' => $userInstitution->role->title,
                        'slug' => $userInstitution->role->slug,
                    ] : null,
                    'institution' => $userInstitution->institution ? [
                        'id' => $userInstitution->institution->id,
                        'name' => $userInstitution->institution->name,
                    ] : null,
                ];
            }),
            'created_at' => $user->created_at,
            'updated_at' => $user->updated_at,
        ];
        if ($student) {
            $data['student_id'] = $student->id;
        }
        return response()->json(['data' => $data]);
    }

    /**
     * Assume another user (super-administrator only).
     * Issues a token for the target user so the super-admin can act as that user.
     */
    public function assumeUser(Request $request)
    {
        $authenticatedUser = $request->user();
        if (!$authenticatedUser || $authenticatedUser instanceof StudentPortalUser) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }

        $role = $authenticatedUser->getRole();
        if (!$role || $role->slug !== 'super-administrator') {
            return response()->json([
                'message' => 'Only super-administrators can assume another user'
            ], 403);
        }

        $request->validate([
            'user_id' => 'required|uuid|exists:users,id',
        ]);

        $targetUser = User::find($request->user_id);
        if (!$targetUser) {
            return response()->json(['message' => 'User not found'], 404);
        }

        // Prevent assuming another super-administrator
        $targetRole = $targetUser->getRole();
        if ($targetRole && $targetRole->slug === 'super-administrator') {
            return response()->json([
                'message' => 'Cannot assume another super-administrator'
            ], 403);
        }

        $token = Str::random(60);
        $tokenExpiry = Carbon::now()->addHours(24)->toDateTimeString();
        $targetUser->update([
            'token' => $token,
            'token_expiry' => $tokenExpiry,
        ]);

        $targetUser->load(['userInstitutions.role', 'userInstitutions.institution', 'directRole']);
        $targetRole = $targetUser->getRole();
        $userData = [
            'id' => $targetUser->id,
            'first_name' => $targetUser->first_name,
            'middle_name' => $targetUser->middle_name,
            'last_name' => $targetUser->last_name,
            'ext_name' => $targetUser->ext_name,
            'email' => $targetUser->email,
            'gender' => $targetUser->gender,
            'birthdate' => $targetUser->birthdate,
            'is_new' => $targetUser->is_new,
            'is_active' => $targetUser->is_active,
            'role' => $targetRole ? [
                'title' => $targetRole->title,
                'slug' => $targetRole->slug,
            ] : null,
            'user_institutions' => $targetUser->userInstitutions->map(function ($userInstitution) {
                return [
                    'institution_id' => $userInstitution->institution_id,
                    'role_id' => $userInstitution->role_id,
                    'is_default' => $userInstitution->is_default,
                    'is_main' => $userInstitution->is_main,
                    'role' => $userInstitution->role ? [
                        'title' => $userInstitution->role->title,
                        'slug' => $userInstitution->role->slug,
                    ] : null,
                    'institution' => $userInstitution->institution ? [
                        'id' => $userInstitution->institution->id,
                        'name' => $userInstitution->institution->name,
                    ] : null,
                ];
            }),
            'created_at' => $targetUser->created_at,
            'updated_at' => $targetUser->updated_at,
        ];

        return response()->json([
            'token' => $token,
            'token_expiry' => $tokenExpiry,
            'user' => $userData,
        ]);
    }
} 