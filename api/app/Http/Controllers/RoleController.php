<?php

namespace App\Http\Controllers;

use App\Auth\StudentPortalUser;
use App\Models\Role;
use App\Support\Modules;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\In;
use Illuminate\Validation\ValidationException;

class RoleController extends Controller
{
    /**
     * Roles visible to the caller: the platform's built-in roles plus the ones
     * their own institution has created. A super-administrator sees every
     * institution's roles.
     */
    public function index(Request $request): JsonResponse
    {
        $perPage = $request->get('per_page', 15);
        $search = $request->get('search', '');

        $query = Role::query()->with('permissions');

        if (! $this->isPlatformAdmin($request)) {
            $query->availableTo($this->institutionId($request));
        }

        if ($search) {
            $query->where(function ($q) use ($search) {
                $q->where('title', 'like', "%{$search}%")
                    ->orWhere('slug', 'like', "%{$search}%");
            });
        }

        // Built-in roles first, then the institution's own, newest last —
        // matching how the list reads in the role builder.
        $roles = $query->orderByDesc('is_system')
            ->orderBy('title')
            ->paginate($perPage);

        return response()->json([
            'success' => true,
            'data' => collect($roles->items())->map(fn ($role) => $this->present($role))->all(),
            'pagination' => [
                'current_page' => $roles->currentPage(),
                'last_page' => $roles->lastPage(),
                'per_page' => $roles->perPage(),
                'total' => $roles->total(),
                'from' => $roles->firstItem(),
                'to' => $roles->lastItem(),
            ],
        ]);
    }

    /**
     * Create a role for the caller's institution, with the modules it may
     * reach. A super-administrator creating a role without an institution
     * context makes a platform-wide one.
     */
    public function store(Request $request): JsonResponse
    {
        try {
            $institutionId = $this->isPlatformAdmin($request)
                ? $request->input('institution_id')
                : $this->institutionId($request);

            $validated = $request->validate([
                'title' => [
                    'required',
                    'string',
                    'max:255',
                    // Unique within the institution, not across the platform —
                    // two schools may each want a "Cashier".
                    Rule::unique('roles', 'title')->where(
                        fn ($q) => $institutionId === null
                            ? $q->whereNull('institution_id')
                            : $q->where('institution_id', $institutionId)
                    ),
                ],
                'permissions' => 'sometimes|array',
                'permissions.*' => ['string', $this->permissionRule($request)],
            ]);

            $role = DB::transaction(function () use ($validated, $institutionId, $request) {
                $role = Role::create([
                    'institution_id' => $institutionId,
                    'title' => $validated['title'],
                    'slug' => Role::generateSlug($validated['title'], $institutionId),
                    'is_system' => false,
                ]);

                $role->syncPermissions($this->requestedPermissions($request, $validated));

                return $role;
            });

            return response()->json([
                'success' => true,
                'message' => 'Role created successfully',
                'data' => $this->present($role->fresh('permissions')),
            ], 201);
        } catch (ValidationException $e) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $e->errors(),
            ], 422);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to create role',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Display the specified resource.
     */
    public function show(Request $request, string $id): JsonResponse
    {
        try {
            $role = Role::with('permissions')->findOrFail($id);

            if (! $this->canSee($request, $role)) {
                return response()->json([
                    'success' => false,
                    'message' => 'Role not found',
                ], 404);
            }

            return response()->json([
                'success' => true,
                'data' => $this->present($role),
            ]);
        } catch (\Illuminate\Database\Eloquent\ModelNotFoundException $e) {
            return response()->json([
                'success' => false,
                'message' => 'Role not found',
            ], 404);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to retrieve role',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Rename a role and/or change what it can reach.
     */
    public function update(Request $request, string $id): JsonResponse
    {
        try {
            $role = Role::with('permissions')->findOrFail($id);

            if (! $this->canSee($request, $role)) {
                return response()->json([
                    'success' => false,
                    'message' => 'Role not found',
                ], 404);
            }

            // Built-in roles are shared by every institution on the platform;
            // letting one school retitle "Principal" or strip its access would
            // change it for all of them.
            if ($role->is_system && ! $this->isPlatformAdmin($request)) {
                return response()->json([
                    'success' => false,
                    'message' => 'Built-in roles cannot be edited. Create a role of your own to customise access.',
                ], 403);
            }

            $validated = $request->validate([
                'title' => [
                    'sometimes',
                    'required',
                    'string',
                    'max:255',
                    Rule::unique('roles', 'title')
                        ->ignore($role->id)
                        ->where(
                            fn ($q) => $role->institution_id === null
                                ? $q->whereNull('institution_id')
                                : $q->where('institution_id', $role->institution_id)
                        ),
                ],
                'permissions' => 'sometimes|array',
                'permissions.*' => ['string', $this->permissionRule($request)],
            ]);

            DB::transaction(function () use ($role, $validated, $request) {
                if (array_key_exists('title', $validated)) {
                    $role->update([
                        'title' => $validated['title'],
                        // The slug is what older code still keys off, so it
                        // follows the title rather than being frozen. Passing
                        // the role's own id keeps it from colliding with itself
                        // and picking up a `-1` on a save that never changed the
                        // name — see Role::generateSlug().
                        'slug' => Role::generateSlug($validated['title'], $role->institution_id, $role->id),
                    ]);
                }

                if ($request->has('permissions')) {
                    $role->syncPermissions($this->requestedPermissions($request, $validated));
                }
            });

            return response()->json([
                'success' => true,
                'message' => 'Role updated successfully',
                'data' => $this->present($role->fresh('permissions')),
            ]);
        } catch (\Illuminate\Database\Eloquent\ModelNotFoundException $e) {
            return response()->json([
                'success' => false,
                'message' => 'Role not found',
            ], 404);
        } catch (ValidationException $e) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $e->errors(),
            ], 422);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to update role',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(Request $request, string $id): JsonResponse
    {
        try {
            $role = Role::findOrFail($id);

            if (! $this->canSee($request, $role)) {
                return response()->json([
                    'success' => false,
                    'message' => 'Role not found',
                ], 404);
            }

            if ($role->is_system) {
                return response()->json([
                    'success' => false,
                    'message' => 'Built-in roles cannot be deleted.',
                ], 403);
            }

            // Deleting a role in use would cascade user_institutions.role_id to
            // null and silently strip those people of all access.
            $assigned = $role->userInstitutions()->count();

            if ($assigned > 0) {
                return response()->json([
                    'success' => false,
                    'message' => "This role is assigned to {$assigned} ".($assigned === 1 ? 'person' : 'people')
                        .'. Move them to another role before deleting it.',
                ], 409);
            }

            $role->delete();

            return response()->json([
                'success' => true,
                'message' => 'Role deleted successfully',
            ]);
        } catch (\Illuminate\Database\Eloquent\ModelNotFoundException $e) {
            return response()->json([
                'success' => false,
                'message' => 'Role not found',
            ], 404);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to delete role',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Shape a role for the client, permissions included.
     */
    protected function present(Role $role): array
    {
        return [
            'id' => $role->id,
            'institution_id' => $role->institution_id,
            'title' => $role->title,
            'slug' => $role->slug,
            'is_system' => (bool) $role->is_system,
            'permissions' => $role->permissions->pluck('permission')->values()->all(),
            'assigned_users_count' => $role->userInstitutions()->count(),
            'created_at' => $role->created_at,
            'updated_at' => $role->updated_at,
        ];
    }

    /**
     * Which permission strings this caller may hand out.
     *
     * An institution admin is held to the assignable catalog, so they cannot
     * mint a role holding platform-administration permissions — or the
     * wildcard — by posting a crafted payload.
     */
    protected function permissionRule(Request $request): In
    {
        return Rule::in(
            $this->isPlatformAdmin($request)
                ? array_merge(Modules::permissions(), [Modules::WILDCARD])
                : Modules::assignablePermissions()
        );
    }

    /**
     * @return array<string>
     */
    protected function requestedPermissions(Request $request, array $validated): array
    {
        $permissions = $validated['permissions'] ?? [];

        if ($this->isPlatformAdmin($request)) {
            return $permissions;
        }

        return array_values(array_intersect($permissions, Modules::assignablePermissions()));
    }

    protected function canSee(Request $request, Role $role): bool
    {
        if ($this->isPlatformAdmin($request)) {
            return true;
        }

        return $role->institution_id === null
            || $role->institution_id === $this->institutionId($request);
    }

    protected function isPlatformAdmin(Request $request): bool
    {
        $user = $request->user();

        return $user && ! ($user instanceof StudentPortalUser) && $user->hasFullAccess();
    }

    protected function institutionId(Request $request): ?string
    {
        $user = $request->user();

        return $user ? $user->getDefaultInstitutionId() : null;
    }
}
