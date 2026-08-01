<?php

namespace App\Models\Concerns;

use App\Support\Modules;

/**
 * Resolves what a staff user is allowed to reach, from the role attached to
 * their active institution.
 *
 * Which institution counts as active follows the same fallback the rest of the
 * app already uses for roles (default institution, then main, then the legacy
 * users.role_id), so permissions and the displayed role never disagree.
 */
trait HasModulePermissions
{
    /**
     * Memoised per request — a single response can check permissions dozens of
     * times (middleware, then controller, then a resource) and none of them
     * should re-query.
     *
     * @var array<string, array<string>>
     */
    protected array $resolvedPermissions = [];

    /**
     * Every permission string this user holds, implied grants included.
     *
     * @return array<string>
     */
    public function permissionList(?string $institutionId = null): array
    {
        $cacheKey = $institutionId ?? '__active__';

        if (isset($this->resolvedPermissions[$cacheKey])) {
            return $this->resolvedPermissions[$cacheKey];
        }

        $role = $institutionId === null
            ? $this->getRole()
            : $this->roleForInstitution($institutionId);

        return $this->resolvedPermissions[$cacheKey] = $role
            ? $role->permissionList()
            : [];
    }

    /**
     * The role this user holds at a specific institution, ignoring the
     * default/main fallback. Used when a request names its own institution.
     */
    public function roleForInstitution(string $institutionId)
    {
        $userInstitution = $this->userInstitutions()
            ->where('institution_id', $institutionId)
            ->with('role')
            ->first();

        return $userInstitution?->role;
    }

    /**
     * True when the user holds a wildcard grant — the super-administrator
     * system role, which reaches modules added after it was seeded.
     */
    public function hasFullAccess(?string $institutionId = null): bool
    {
        return in_array(Modules::WILDCARD, $this->permissionList($institutionId), true);
    }

    public function hasPermissionTo(string $permission, ?string $institutionId = null): bool
    {
        $permissions = $this->permissionList($institutionId);

        return in_array(Modules::WILDCARD, $permissions, true)
            || in_array($permission, $permissions, true);
    }

    /**
     * The everyday check: can this user reach a module, at a given ability?
     */
    public function hasModuleAccess(string $module, string $ability = 'view', ?string $institutionId = null): bool
    {
        return $this->hasPermissionTo("{$module}.{$ability}", $institutionId);
    }

    /**
     * Drop the memo — needed after a role's permissions change mid-request
     * (the role builder saving its own role, for instance).
     */
    public function forgetResolvedPermissions(): void
    {
        $this->resolvedPermissions = [];
    }
}
