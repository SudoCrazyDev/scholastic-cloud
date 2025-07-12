<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Models\UserInstitution;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Validation\ValidationException;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\DB;

class UserController extends Controller
{
    /**
     * Display a listing of the resource with pagination and filtering.
     */
    public function index(Request $request): JsonResponse
    {
        $perPage = $request->get('per_page', 15);
        $search = $request->get('search', '');

        $query = User::with(['role', 'userInstitutions.institution', 'userInstitutions.role']);

        if ($search) {
            $query->where(function ($q) use ($search) {
                $q->where('first_name', 'like', "%{$search}%")
                  ->orWhere('middle_name', 'like', "%{$search}%")
                  ->orWhere('last_name', 'like', "%{$search}%");
            });
        }

        $users = $query->orderBy('created_at', 'desc')
                      ->paginate($perPage);

        return response()->json([
            'success' => true,
            'data' => $users->items(),
            'pagination' => [
                'current_page' => $users->currentPage(),
                'last_page' => $users->lastPage(),
                'per_page' => $users->perPage(),
                'total' => $users->total(),
                'from' => $users->firstItem(),
                'to' => $users->lastItem(),
            ]
        ]);
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request): JsonResponse
    {
        try {
            $validated = $request->validate([
                'first_name' => 'required|string|max:255',
                'middle_name' => 'nullable|string|max:255',
                'last_name' => 'nullable|string|max:255',
                'ext_name' => 'nullable|string|max:255',
                'gender' => 'nullable|string|in:male,female,other',
                'birthdate' => 'required|date',
                'email' => 'required|email|unique:users,email',
                'password' => 'required|string|min:8',
                'role_id' => 'required|exists:roles,id',
                'institution_ids' => 'required|array',
                'institution_ids.*' => 'required|string|exists:institutions,id',
            ]);

            DB::beginTransaction();

            // Create user
            $user = User::create([
                'first_name' => $validated['first_name'],
                'middle_name' => $validated['middle_name'],
                'last_name' => $validated['last_name'],
                'ext_name' => $validated['ext_name'],
                'gender' => $validated['gender'],
                'birthdate' => $validated['birthdate'],
                'email' => $validated['email'],
                'password' => Hash::make($validated['password']),
            ]);

            // Create user institution relationships
            foreach ($validated['institution_ids'] as $index => $institutionId) {
                UserInstitution::create([
                    'user_id' => $user->id,
                    'institution_id' => $institutionId,
                    'role_id' => $validated['role_id'],
                    'is_default' => $index === 0, // First institution is default
                    'is_main' => $index === 0, // First institution is main
                ]);
            }

            DB::commit();

            // Load relationships for response
            $user->load(['role', 'userInstitutions.institution', 'userInstitutions.role']);

            return response()->json([
                'success' => true,
                'message' => 'User created successfully',
                'data' => $user
            ], 201);
        } catch (ValidationException $e) {
            DB::rollBack();
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $e->errors()
            ], 422);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json([
                'success' => false,
                'message' => 'Failed to create user',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Display the specified resource.
     */
    public function show(string $id): JsonResponse
    {
        try {
            $user = User::with(['role', 'userInstitutions.institution', 'userInstitutions.role'])
                       ->findOrFail($id);
            
            return response()->json([
                'success' => true,
                'data' => $user
            ]);
        } catch (\Illuminate\Database\Eloquent\ModelNotFoundException $e) {
            return response()->json([
                'success' => false,
                'message' => 'User not found'
            ], 404);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to retrieve user',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, string $id): JsonResponse
    {
        try {
            $user = User::findOrFail($id);
            
            $validated = $request->validate([
                'first_name' => 'sometimes|required|string|max:255',
                'middle_name' => 'nullable|string|max:255',
                'last_name' => 'nullable|string|max:255',
                'ext_name' => 'nullable|string|max:255',
                'gender' => 'nullable|string|in:male,female,other',
                'birthdate' => 'sometimes|required|date',
                'email' => 'sometimes|required|email|unique:users,email,' . $id,
                'password' => 'nullable|string|min:8',
                'role_id' => 'sometimes|required|exists:roles,id',
            ]);

            DB::beginTransaction();

            // Update user (excluding role_id since it's managed through user_institutions)
            $updateData = array_filter($validated, function($key) {
                return $key !== 'password' && $key !== 'role_id';
            }, ARRAY_FILTER_USE_KEY);

            if (isset($validated['password'])) {
                $updateData['password'] = Hash::make($validated['password']);
            }

            $user->update($updateData);

            // Update role_id if provided
            if (isset($validated['role_id'])) {
                // Update the main user institution role
                $user->userInstitutions()->where('is_main', true)->update([
                    'role_id' => $validated['role_id']
                ]);
            }

            DB::commit();

            // Load relationships for response
            $user->load(['role', 'userInstitutions.institution', 'userInstitutions.role']);

            return response()->json([
                'success' => true,
                'message' => 'User updated successfully',
                'data' => $user->fresh()
            ]);
        } catch (\Illuminate\Database\Eloquent\ModelNotFoundException $e) {
            DB::rollBack();
            return response()->json([
                'success' => false,
                'message' => 'User not found'
            ], 404);
        } catch (ValidationException $e) {
            DB::rollBack();
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $e->errors()
            ], 422);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json([
                'success' => false,
                'message' => 'Failed to update user',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(string $id): JsonResponse
    {
        try {
            $user = User::findOrFail($id);
            
            DB::beginTransaction();
            
            // Delete user institutions first (due to foreign key constraints)
            $user->userInstitutions()->delete();
            
            // Delete the user
            $user->delete();
            
            DB::commit();

            return response()->json([
                'success' => true,
                'message' => 'User deleted successfully'
            ]);
        } catch (\Illuminate\Database\Eloquent\ModelNotFoundException $e) {
            DB::rollBack();
            return response()->json([
                'success' => false,
                'message' => 'User not found'
            ], 404);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json([
                'success' => false,
                'message' => 'Failed to delete user',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Get the current user's class sections.
     */
    public function getMyClassSections(Request $request): JsonResponse
    {
        try {
            $user = $request->user();
            $perPage = $request->get('per_page', 15);
            $search = $request->get('search', '');
            $institutionId = $request->get('institution_id');

            // Get user's institution IDs
            $userInstitutionIds = $user->userInstitutions()
                ->pluck('institution_id')
                ->toArray();

            if (empty($userInstitutionIds)) {
                return response()->json([
                    'success' => false,
                    'message' => 'User is not associated with any institutions'
                ], 403);
            }

            // Get user's role from default institution
            $defaultUserInstitution = $user->userInstitutions()
                ->where('is_default', true)
                ->with('role')
                ->first();

            if (!$defaultUserInstitution || !$defaultUserInstitution->role) {
                return response()->json([
                    'success' => false,
                    'message' => 'User role not found'
                ], 403);
            }

            $userRole = $defaultUserInstitution->role;
            $userRoleSlug = $userRole->slug;

            // Build query for class sections based on user role
            $query = \App\Models\ClassSection::with(['institution', 'adviser', 'students']);

            if ($userRoleSlug === 'subject-teacher') {
                // Subject teachers see only class sections where they are the adviser
                $query->where('adviser', $user->id);
            } else {
                // Principal and Institution Administrator see all class sections in their institutions
                $query->whereIn('institution_id', $userInstitutionIds);
            }

            // Filter by specific institution if provided
            if ($institutionId && in_array($institutionId, $userInstitutionIds)) {
                $query->where('institution_id', $institutionId);
            }

            // Search functionality
            if ($search) {
                $query->where(function ($q) use ($search) {
                    $q->where('title', 'like', "%{$search}%")
                      ->orWhere('grade_level', 'like', "%{$search}%")
                      ->orWhere('academic_year', 'like', "%{$search}%");
                });
            }

            $classSections = $query->orderBy('created_at', 'desc')
                                  ->paginate($perPage);

            return response()->json([
                'success' => true,
                'data' => $classSections->items(),
                'pagination' => [
                    'current_page' => $classSections->currentPage(),
                    'last_page' => $classSections->lastPage(),
                    'per_page' => $classSections->perPage(),
                    'total' => $classSections->total(),
                    'from' => $classSections->firstItem(),
                    'to' => $classSections->lastItem(),
                ]
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to retrieve class sections',
                'error' => $e->getMessage()
            ], 500);
        }
    }
} 