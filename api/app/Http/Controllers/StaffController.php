<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Models\UserInstitution;
use App\Models\Role;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Validation\ValidationException;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\DB;

class StaffController extends Controller
{
    /**
     * Display a listing of staff with pagination and filtering.
     * Only shows staff from the authenticated user's default institution
     * and excludes super administrators.
     */
    public function index(Request $request): JsonResponse
    {
        $perPage = $request->get('per_page', 15);
        $search = $request->get('search', '');
        $authenticatedUser = $request->user();

        // Get the authenticated user's default institution
        $defaultInstitution = $authenticatedUser->userInstitutions()
            ->where('is_default', true)
            ->with('institution')
            ->first();

        if (!$defaultInstitution) {
            return response()->json([
                'success' => false,
                'message' => 'No default institution found for authenticated user'
            ], 403);
        }

        // Get super administrator role ID
        $superAdminRole = Role::where('slug', 'super-administrator')->first();
        $superAdminRoleId = $superAdminRole ? $superAdminRole->id : null;

        // Build query to get staff from the same institution, excluding super administrators
        $query = User::whereHas('userInstitutions', function ($q) use ($defaultInstitution, $superAdminRoleId) {
            $q->where('institution_id', $defaultInstitution->institution_id);
            
            // Exclude super administrators
            if ($superAdminRoleId) {
                $q->where('role_id', '!=', $superAdminRoleId);
            }
        })->with(['role', 'userInstitutions.institution', 'userInstitutions.role']);

        // Apply search filter
        if ($search) {
            $query->where(function ($q) use ($search) {
                $q->where('first_name', 'like', "%{$search}%")
                  ->orWhere('middle_name', 'like', "%{$search}%")
                  ->orWhere('last_name', 'like', "%{$search}%")
                  ->orWhere('email', 'like', "%{$search}%");
            });
        }

        $staffs = $query->orderBy('created_at', 'desc')
                      ->paginate($perPage);

        return response()->json([
            'success' => true,
            'data' => $staffs->items(),
            'pagination' => [
                'current_page' => $staffs->currentPage(),
                'last_page' => $staffs->lastPage(),
                'per_page' => $staffs->perPage(),
                'total' => $staffs->total(),
                'from' => $staffs->firstItem(),
                'to' => $staffs->lastItem(),
            ]
        ]);
    }

    /**
     * Store a newly created staff member in storage.
     * Automatically assigns the authenticated user's default institution.
     */
    public function store(Request $request): JsonResponse
    {
        try {
            $authenticatedUser = $request->user();

            // Get the authenticated user's default institution
            $defaultInstitution = $authenticatedUser->userInstitutions()
                ->where('is_default', true)
                ->first();

            if (!$defaultInstitution) {
                return response()->json([
                    'success' => false,
                    'message' => 'No default institution found for authenticated user'
                ], 403);
            }

            // Get super administrator role ID to prevent creating super admins
            $superAdminRole = Role::where('slug', 'super-administrator')->first();
            $superAdminRoleId = $superAdminRole ? $superAdminRole->id : null;

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
            ]);

            // Prevent creating super administrators
            if ($superAdminRoleId && $validated['role_id'] == $superAdminRoleId) {
                return response()->json([
                    'success' => false,
                    'message' => 'Cannot create super administrator users'
                ], 403);
            }

            DB::beginTransaction();

            // Create staff member
            $staff = User::create([
                'first_name' => $validated['first_name'],
                'middle_name' => $validated['middle_name'],
                'last_name' => $validated['last_name'],
                'ext_name' => $validated['ext_name'],
                'gender' => $validated['gender'],
                'birthdate' => $validated['birthdate'],
                'email' => $validated['email'],
                'password' => Hash::make($validated['password']),
            ]);

            // Automatically assign the authenticated user's default institution
            UserInstitution::create([
                'user_id' => $staff->id,
                'institution_id' => $defaultInstitution->institution_id,
                'role_id' => $validated['role_id'],
                'is_default' => true,
                'is_main' => true,
            ]);

            DB::commit();

            // Load relationships for response
            $staff->load(['role', 'userInstitutions.institution', 'userInstitutions.role']);

            return response()->json([
                'success' => true,
                'message' => 'Staff member created successfully',
                'data' => $staff
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
                'message' => 'Failed to create staff member',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Display the specified staff member.
     * Only allows access to staff from the same institution.
     */
    public function show(string $id): JsonResponse
    {
        try {
            $authenticatedUser = request()->user();

            // Get the authenticated user's default institution
            $defaultInstitution = $authenticatedUser->userInstitutions()
                ->where('is_default', true)
                ->first();

            if (!$defaultInstitution) {
                return response()->json([
                    'success' => false,
                    'message' => 'No default institution found for authenticated user'
                ], 403);
            }

            // Get super administrator role ID
            $superAdminRole = Role::where('slug', 'super-administrator')->first();
            $superAdminRoleId = $superAdminRole ? $superAdminRole->id : null;

            // Find staff member from the same institution
            $staff = User::whereHas('userInstitutions', function ($q) use ($defaultInstitution, $superAdminRoleId) {
                $q->where('institution_id', $defaultInstitution->institution_id);
                
                // Exclude super administrators
                if ($superAdminRoleId) {
                    $q->where('role_id', '!=', $superAdminRoleId);
                }
            })->with(['role', 'userInstitutions.institution', 'userInstitutions.role'])
              ->find($id);

            if (!$staff) {
                return response()->json([
                    'success' => false,
                    'message' => 'Staff member not found'
                ], 404);
            }

            return response()->json([
                'success' => true,
                'data' => $staff
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to retrieve staff member',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Update the specified staff member.
     * Only allows updating staff from the same institution.
     */
    public function update(Request $request, string $id): JsonResponse
    {
        try {
            $authenticatedUser = $request->user();

            // Get the authenticated user's default institution
            $defaultInstitution = $authenticatedUser->userInstitutions()
                ->where('is_default', true)
                ->first();

            if (!$defaultInstitution) {
                return response()->json([
                    'success' => false,
                    'message' => 'No default institution found for authenticated user'
                ], 403);
            }

            // Get super administrator role ID
            $superAdminRole = Role::where('slug', 'super-administrator')->first();
            $superAdminRoleId = $superAdminRole ? $superAdminRole->id : null;

            // Find staff member from the same institution
            $staff = User::whereHas('userInstitutions', function ($q) use ($defaultInstitution, $superAdminRoleId) {
                $q->where('institution_id', $defaultInstitution->institution_id);
                
                // Exclude super administrators
                if ($superAdminRoleId) {
                    $q->where('role_id', '!=', $superAdminRoleId);
                }
            })->find($id);

            if (!$staff) {
                return response()->json([
                    'success' => false,
                    'message' => 'Staff member not found'
                ], 404);
            }

            $validated = $request->validate([
                'first_name' => 'sometimes|required|string|max:255',
                'middle_name' => 'nullable|string|max:255',
                'last_name' => 'sometimes|required|string|max:255',
                'ext_name' => 'nullable|string|max:255',
                'gender' => 'nullable|string|in:male,female,other',
                'birthdate' => 'sometimes|required|date',
                'email' => 'sometimes|required|email|unique:users,email,' . $id,
                'password' => 'nullable|string|min:8',
                'role_id' => 'sometimes|required|exists:roles,id',
            ]);

            // Prevent updating to super administrator role
            if (isset($validated['role_id']) && $superAdminRoleId && $validated['role_id'] == $superAdminRoleId) {
                return response()->json([
                    'success' => false,
                    'message' => 'Cannot assign super administrator role'
                ], 403);
            }

            DB::beginTransaction();

            // Update staff member
            $updateData = array_filter($validated, function ($value) {
                return $value !== null;
            });

            if (isset($updateData['password'])) {
                $updateData['password'] = Hash::make($updateData['password']);
            }

            $staff->update($updateData);

            // Update role if provided
            if (isset($validated['role_id'])) {
                $staff->userInstitutions()
                    ->where('institution_id', $defaultInstitution->institution_id)
                    ->update(['role_id' => $validated['role_id']]);
            }

            DB::commit();

            // Load relationships for response
            $staff->load(['role', 'userInstitutions.institution', 'userInstitutions.role']);

            return response()->json([
                'success' => true,
                'message' => 'Staff member updated successfully',
                'data' => $staff
            ]);
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
                'message' => 'Failed to update staff member',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Update the role of a staff member.
     */
    public function updateRole(Request $request, string $id): JsonResponse
    {
        try {
            $authenticatedUser = $request->user();

            // Get the authenticated user's default institution
            $defaultInstitution = $authenticatedUser->userInstitutions()
                ->where('is_default', true)
                ->first();

            if (!$defaultInstitution) {
                return response()->json([
                    'success' => false,
                    'message' => 'No default institution found for authenticated user'
                ], 403);
            }

            // Get super administrator role ID
            $superAdminRole = Role::where('slug', 'super-administrator')->first();
            $superAdminRoleId = $superAdminRole ? $superAdminRole->id : null;

            // Find staff member from the same institution
            $staff = User::whereHas('userInstitutions', function ($q) use ($defaultInstitution, $superAdminRoleId) {
                $q->where('institution_id', $defaultInstitution->institution_id);
                
                // Exclude super administrators
                if ($superAdminRoleId) {
                    $q->where('role_id', '!=', $superAdminRoleId);
                }
            })->find($id);

            if (!$staff) {
                return response()->json([
                    'success' => false,
                    'message' => 'Staff member not found'
                ], 404);
            }

            $validated = $request->validate([
                'role_id' => 'required|exists:roles,id',
            ]);

            // Prevent assigning super administrator role
            if ($superAdminRoleId && $validated['role_id'] == $superAdminRoleId) {
                return response()->json([
                    'success' => false,
                    'message' => 'Cannot assign super administrator role'
                ], 403);
            }

            // Update role
            $staff->userInstitutions()
                ->where('institution_id', $defaultInstitution->institution_id)
                ->update(['role_id' => $validated['role_id']]);

            // Load relationships for response
            $staff->load(['role', 'userInstitutions.institution', 'userInstitutions.role']);

            return response()->json([
                'success' => true,
                'message' => 'Staff role updated successfully',
                'data' => $staff
            ]);
        } catch (ValidationException $e) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $e->errors()
            ], 422);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to update staff role',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Remove the specified staff member.
     * Only allows deleting staff from the same institution.
     */
    public function destroy(string $id): JsonResponse
    {
        try {
            $authenticatedUser = request()->user();

            // Get the authenticated user's default institution
            $defaultInstitution = $authenticatedUser->userInstitutions()
                ->where('is_default', true)
                ->first();

            if (!$defaultInstitution) {
                return response()->json([
                    'success' => false,
                    'message' => 'No default institution found for authenticated user'
                ], 403);
            }

            // Get super administrator role ID
            $superAdminRole = Role::where('slug', 'super-administrator')->first();
            $superAdminRoleId = $superAdminRole ? $superAdminRole->id : null;

            // Find staff member from the same institution
            $staff = User::whereHas('userInstitutions', function ($q) use ($defaultInstitution, $superAdminRoleId) {
                $q->where('institution_id', $defaultInstitution->institution_id);
                
                // Exclude super administrators
                if ($superAdminRoleId) {
                    $q->where('role_id', '!=', $superAdminRoleId);
                }
            })->find($id);

            if (!$staff) {
                return response()->json([
                    'success' => false,
                    'message' => 'Staff member not found'
                ], 404);
            }

            // Prevent deleting self
            if ($staff->id === $authenticatedUser->id) {
                return response()->json([
                    'success' => false,
                    'message' => 'Cannot delete your own account'
                ], 403);
            }

            DB::beginTransaction();

            // Remove from institution
            $staff->userInstitutions()
                ->where('institution_id', $defaultInstitution->institution_id)
                ->delete();

            // If no more institutions, delete the user
            if ($staff->userInstitutions()->count() === 0) {
                $staff->delete();
            }

            DB::commit();

            return response()->json([
                'success' => true,
                'message' => 'Staff member removed successfully'
            ]);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json([
                'success' => false,
                'message' => 'Failed to remove staff member',
                'error' => $e->getMessage()
            ], 500);
        }
    }
} 