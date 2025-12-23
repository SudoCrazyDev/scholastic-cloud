<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class DesktopController extends Controller
{
    /**
     * Get current user's default institution for desktop app
     * Returns full institution data needed for offline use
     */
    public function getInstitution(Request $request): JsonResponse
    {
        try {
            $user = $request->user();
            
            if (!$user) {
                return response()->json([
                    'success' => false,
                    'message' => 'User not found'
                ], 404);
            }

            // Get the default user institution
            $defaultUserInstitution = $user->userInstitutions()
                ->where('is_default', true)
                ->with('institution.subscription')
                ->first();

            if (!$defaultUserInstitution || !$defaultUserInstitution->institution) {
                return response()->json([
                    'success' => false,
                    'message' => 'No default institution found for this user'
                ], 404);
            }

            return response()->json([
                'success' => true,
                'data' => $defaultUserInstitution->institution
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to retrieve institution',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Sync all necessary data for desktop app offline use
     * This endpoint can be expanded to return multiple data types
     * 
     * @return JsonResponse
     */
    public function sync(Request $request): JsonResponse
    {
        try {
            $user = $request->user();
            
            if (!$user) {
                return response()->json([
                    'success' => false,
                    'message' => 'User not found'
                ], 404);
            }

            // Load user with relationships
            $user->load(['userInstitutions.role', 'userInstitutions.institution.subscription', 'directRole']);

            // Get default institution
            $defaultUserInstitution = $user->userInstitutions()
                ->where('is_default', true)
                ->with('institution.subscription')
                ->first();

            $institution = $defaultUserInstitution?->institution;

            // Build response with all necessary data
            $data = [
                'user' => [
                    'id' => $user->id,
                    'first_name' => $user->first_name,
                    'middle_name' => $user->middle_name,
                    'last_name' => $user->last_name,
                    'ext_name' => $user->ext_name,
                    'email' => $user->email,
                    'gender' => $user->gender,
                    'birthdate' => $user->birthdate,
                    'is_new' => $user->is_new,
                    'created_at' => $user->created_at,
                    'updated_at' => $user->updated_at,
                ],
                'institution' => $institution ? [
                    'id' => $institution->id,
                    'title' => $institution->title,
                    'abbr' => $institution->abbr,
                    'division' => $institution->division,
                    'region' => $institution->region,
                    'gov_id' => $institution->gov_id,
                    'logo' => $institution->logo,
                    'subscription_id' => $institution->subscription_id,
                    'created_at' => $institution->created_at,
                    'updated_at' => $institution->updated_at,
                ] : null,
            ];

            return response()->json([
                'success' => true,
                'data' => $data
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to sync data',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Get current user's class sections (where adviser matches user id)
     * Returns class sections for desktop app offline use
     */
    public function getClassSections(Request $request): JsonResponse
    {
        try {
            $user = $request->user();

            if (!$user) {
                return response()->json([
                    'success' => false,
                    'message' => 'User not found'
                ], 404);
            }

            // Get class sections where adviser matches the user id
            $classSections = \App\Models\ClassSection::where('adviser', $user->id)
                ->whereNull('deleted_at')
                ->with(['institution'])
                ->get();

            return response()->json([
                'success' => true,
                'data' => $classSections
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to retrieve class sections',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Get current user's assigned loads (subjects where adviser matches user id)
     * Returns subjects with classSection and classSection.adviser relationships loaded
     * for cascading save to SQLite
     */
    public function getAssignedLoads(Request $request): JsonResponse
    {
        try {
            $user = $request->user();

            if (!$user) {
                return response()->json([
                    'success' => false,
                    'message' => 'User not found'
                ], 404);
            }

            // Get subjects where adviser matches the user id
            // Load classSection and classSection.adviser relationships
            $subjects = \App\Models\Subject::where('adviser', $user->id)
                ->with([
                    'classSection' => function ($query) {
                        $query->whereNull('deleted_at');
                    },
                    'classSection.adviser' => function ($query) {
                        // Load the adviser user data
                    },
                    'institution'
                ])
                ->get();

            return response()->json([
                'success' => true,
                'data' => $subjects
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to retrieve assigned loads',
                'error' => $e->getMessage()
            ], 500);
        }
    }
}

