import { useAuth } from './useAuth';

export function useRoleAccess(allowedRoles: string[]) {
  const { user } = useAuth();
  const userRoleSlug = user?.role?.slug;

  const hasAccess = userRoleSlug ? allowedRoles.includes(userRoleSlug) : false;

  return {
    hasAccess,
    userRole: userRoleSlug,
    user,
  };
} 