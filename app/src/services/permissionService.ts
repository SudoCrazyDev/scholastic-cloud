import { api } from '../lib/api'
import type { ApiResponse, ModuleCatalog } from '../types'

class PermissionService {
  /**
   * The module catalog the role builder renders. Platform-only modules are
   * included by the API only for super-administrators.
   */
  async getCatalog() {
    const response = await api.get<ApiResponse<ModuleCatalog>>('/permissions/catalog')
    return response.data.data
  }

  /** The signed-in user's own permission set. */
  async getMine() {
    const response = await api.get<ApiResponse<{ permissions: string[]; full_access: boolean }>>(
      '/permissions/me'
    )
    return response.data.data
  }
}

export const permissionService = new PermissionService()
