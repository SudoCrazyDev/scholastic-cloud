<?php

namespace App\Models\Concerns;

use App\Models\TalaAccess;
use App\Support\Modules;

/**
 * Resolves what a staff user is allowed to reach, from the role attached to
 * their active institution.
 *
 * Which institution counts as active follows the same fallback the rest of the
 * app already uses for roles (default institution, then main, then the legacy
 * users.role_id), so permissions and the displayed role never disagree.
 *
 * One module does not work this way. Tala is granted to individual teachers by
 * an administrator, so its permissions come from `tala_access` and not from the
 * role — see applyTalaAccess(), which is the only exception in here.
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

        return $this->resolvedPermissions[$cacheKey] = $this->applyTalaAccess(
            $role ? $role->permissionList() : [],
            $institutionId,
        );
    }

    /**
     * Tala is granted per teacher, not per role.
     *
     * Every other module is answered entirely by the role. Tala is the
     * exception: an administrator picks the individual teachers who get it, so
     * that a school can run a pilot with two of them without inventing a
     * parallel role. That makes `tala_access` the only source of `tala.view` and
     * `tala.manage`, and this the one place the two systems meet.
     *
     * Three rules, in order:
     *
     *   1. A wildcard holder keeps everything. That is the platform's
     *      super-administrator, who must be able to reach a school's Tala setup
     *      to support it, and who is not a teacher any administrator can grant.
     *   2. A role never confers either permission — including a role that still
     *      carries one from before this change, which is why they are stripped
     *      rather than merely not added.
     *   3. `tala.configure` carries `tala.view` back. The administrator who sets
     *      the school's key and hands out access has to be able to open the
     *      screen where that happens, and granting themselves a teacher's seat
     *      to do it would be a strange thing to require. It is `view` only: an
     *      administrator can configure Tala without being able to chat with it.
     *
     * @param  array<string>  $permissions
     * @return array<string>
     */
    protected function applyTalaAccess(array $permissions, ?string $institutionId): array
    {
        if (in_array(Modules::WILDCARD, $permissions, true)) {
            return $permissions;
        }

        $canConfigure = in_array('tala.configure', $permissions, true);

        $permissions = array_values(array_filter(
            $permissions,
            fn (string $permission) => $permission !== 'tala.view' && $permission !== 'tala.manage',
        ));

        $institutionId ??= $this->institutionForPermissions();

        if ($institutionId !== null && TalaAccess::isGranted($this->id, $institutionId)) {
            return array_merge($permissions, ['tala.view', 'tala.manage']);
        }

        return $canConfigure ? array_merge($permissions, ['tala.view']) : $permissions;
    }

    /**
     * Which school a permission check without an explicit institution refers to.
     *
     * Mirrors getRole()'s fallback — default, then main — so a grant and the
     * role it sits alongside are never read from two different institutions.
     */
    protected function institutionForPermissions(): ?string
    {
        $preferred = $this->userInstitutions()
            ->where('is_default', true)
            ->first()
            ?? $this->userInstitutions()->where('is_main', true)->first();

        return $preferred?->institution_id;
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
