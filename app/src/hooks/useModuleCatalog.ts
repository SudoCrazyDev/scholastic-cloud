import { useQuery } from '@tanstack/react-query'
import { permissionService } from '../services/permissionService'

/**
 * The list of modules a role can be given access to, fetched from the API so
 * the role builder and the API's own enforcement never drift apart.
 *
 * The catalog only changes on deploy, so it is cached for the session.
 */
export function useModuleCatalog(enabled: boolean = true) {
  return useQuery({
    queryKey: ['permission-catalog'],
    queryFn: () => permissionService.getCatalog(),
    enabled,
    staleTime: Infinity,
    gcTime: Infinity,
  })
}
