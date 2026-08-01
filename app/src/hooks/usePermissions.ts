import { useMemo } from 'react'
import { useAuth } from './useAuth'

/** Grants every module, including ones added after the role was saved. */
const WILDCARD = '*'

/**
 * What the signed-in user's role can reach.
 *
 * The permission set arrives on the profile payload, so this reads from auth
 * state rather than firing its own request — the sidebar and every route guard
 * call it on each render.
 *
 * This mirrors App\Http\Middleware\EnsureModuleAccess on the API. Hiding a
 * button here is a courtesy, not the enforcement — the API refuses the call
 * regardless of what the client chose to render.
 */
export function usePermissions() {
  const { user } = useAuth()

  const permissions = useMemo<Set<string>>(
    () => new Set<string>(Array.isArray(user?.permissions) ? user.permissions : []),
    [user?.permissions]
  )

  const fullAccess = permissions.has(WILDCARD) || Boolean(user?.full_access)

  return useMemo(() => {
    /** Does the role hold this exact permission string? */
    const hasPermission = (permission: string): boolean =>
      fullAccess || permissions.has(permission)

    /** Can the user reach a module, at the given ability? */
    const can = (module: string, ability: string = 'view'): boolean =>
      hasPermission(`${module}.${ability}`)

    /** Read-only access: can open the module but not change anything in it. */
    const canView = (module: string): boolean => can(module, 'view')

    const canManage = (module: string): boolean => can(module, 'manage')

    /** True when the user can reach at least one of the given modules. */
    const canViewAny = (modules: string[]): boolean => modules.some(canView)

    return {
      permissions,
      fullAccess,
      hasPermission,
      can,
      canView,
      canManage,
      canViewAny,
      /** Students hold no module permissions at all. */
      isStudent: user?.role?.slug === 'student',
    }
  }, [permissions, fullAccess, user?.role?.slug])
}
