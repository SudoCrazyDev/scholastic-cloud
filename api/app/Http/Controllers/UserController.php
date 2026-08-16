<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\AuthorizesModuleAccess;
use App\Models\User;
use App\Models\UserInstitution;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Validation\ValidationException;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\DB;

class UserController extends Controller
{
    use AuthorizesModuleAccess;

    /**
     * Seeing every subject in the institution rather than only the ones you
     * advise is a permission, not a job title.
     *
     * This used to be a list of slug spellings. Maranatha's Department Head
     * carried the slug `department-head-1` — generateSlug()'s collision suffix,
     * written by a role-builder save that never changed the name — and five
     * department heads silently got a subject teacher's view of 208 subjects
     * instead of the whole school's. The same shape had already cost their
     * administrators the Receipt Approvals queue.
     */
    private const SUBJECT_OVERVIEW_PERMISSION = 'subjects.view-all';

    /**
     * Display a listing of the resource with pagination and filtering.
     *
     * This is the staff directory several modules read to populate people
     * pickers (disbursements, timetable, schedules), so it stays available to
     * any staff account rather than requiring the `users` module. What it must
     * not do is reach past the caller's own institutions — super-administrators
     * excepted, since they operate across tenants.
     */
    public function index(Request $request): JsonResponse
    {
        if ($deny = $this->denyUnlessStaff($request)) {
            return $deny;
        }

        $perPage = $request->get('per_page', 15);
        $search = $request->get('search', '');
        $roleId = $request->get('role_id');

        $query = User::with(['role', 'userInstitutions.institution', 'userInstitutions.role']);

        if (! $request->user()->hasFullAccess()) {
            $institutionIds = $this->callerInstitutionIds($request);

            if ($institutionIds === []) {
                return response()->json([
                    'success' => false,
                    'message' => 'User is not associated with any institutions',
                ], 403);
            }

            $query->whereHas(
                'userInstitutions',
                fn ($q) => $q->whereIn('institution_id', $institutionIds)
            );
        }

        if ($search) {
            $query->where(function ($q) use ($search) {
                $q->where('first_name', 'like', "%{$search}%")
                  ->orWhere('middle_name', 'like', "%{$search}%")
                  ->orWhere('last_name', 'like', "%{$search}%");
            });
        }

        if ($roleId) {
            // Filter by effective role: user has this role on default institution, main institution, or direct role_id
            $query->where(function ($q) use ($roleId) {
                // Has default user_institution with this role
                $q->whereHas('userInstitutions', function ($sub) use ($roleId) {
                    $sub->where('is_default', true)->where('role_id', $roleId);
                })
                // Or has main user_institution with this role (and no default with a different role)
                ->orWhereHas('userInstitutions', function ($sub) use ($roleId) {
                    $sub->where('is_main', true)->where('role_id', $roleId);
                })
                // Or has direct role_id (and no default/main assignment with this role)
                ->orWhere('role_id', $roleId);
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
        if ($deny = $this->denyUnlessModule($request, 'users', 'manage')) {
            return $deny;
        }

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
    public function show(Request $request, string $id): JsonResponse
    {
        if ($deny = $this->denyUnlessStaff($request)) {
            return $deny;
        }

        try {
            $query = User::with(['role', 'userInstitutions.institution', 'userInstitutions.role']);

            if (! $request->user()->hasFullAccess()) {
                $institutionIds = $this->callerInstitutionIds($request);

                $query->whereHas(
                    'userInstitutions',
                    fn ($q) => $q->whereIn('institution_id', $institutionIds)
                );
            }

            $user = $query->findOrFail($id);

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
        if ($deny = $this->denyUnlessModule($request, 'users', 'manage')) {
            return $deny;
        }

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
    public function destroy(Request $request, string $id): JsonResponse
    {
        if ($deny = $this->denyUnlessModule($request, 'users', 'manage')) {
            return $deny;
        }

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
            $query = \App\Models\ClassSection::with(['institution', 'adviserUser', 'students']);

            if ($userRoleSlug === 'subject-teacher' || $userRoleSlug === 'finance') {
                // Subject teachers (and the finance role) see only class sections
                // assigned to them. When include_taught is set, also include sections
                // where they teach a subject (used by the announcement section picker,
                // which may target either).
                if ($request->boolean('include_taught')) {
                    $query->where(function ($q) use ($user) {
                        $q->where('adviser', $user->id)
                          ->orWhereHas('subjects', function ($sq) use ($user) {
                              $sq->where('adviser', $user->id);
                          });
                    });
                } else {
                    $query->where('adviser', $user->id);
                }
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

    /**
     * The subjects behind "My Assigned Subjects".
     *
     * Normally the ones the caller advises. A caller holding
     * `subjects.view-all` gets every subject in the institutions they belong to
     * instead — see SUBJECT_OVERVIEW_PERMISSION.
     *
     * Optional query: academic_year — filter by class section's academic year.
     */
    public function getMySubjects(Request $request): \Illuminate\Http\JsonResponse
    {
        try {
            $user = $request->user();

            $hasInstitutionOverview = method_exists($user, 'hasPermissionTo')
                && $user->hasPermissionTo(self::SUBJECT_OVERVIEW_PERMISSION);

            if ($hasInstitutionOverview) {
                $institutionIds = $user->userInstitutions()->pluck('institution_id');
                $query = \App\Models\Subject::query()->whereIn('institution_id', $institutionIds);
            } else {
                $query = $user->advisedSubjects();
            }

            $query->with(['classSection', 'adviserUser', 'parentSubject', 'institution']);

            $academicYear = $request->query('academic_year');
            if ($academicYear !== null && $academicYear !== '') {
                $query->whereHas('classSection', function ($q) use ($academicYear) {
                    $q->where('academic_year', $academicYear);
                });
            }

            $subjects = $query->orderBy('order', 'asc')->orderBy('created_at', 'desc')->get();

            return response()->json([
                'success' => true,
                'data' => $subjects
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to retrieve subjects',
                'error' => $e->getMessage()
            ], 500);
        }
    }
} 