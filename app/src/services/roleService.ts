import { api } from '../lib/api'
import type { Role, PaginatedResponse } from '../types'

export interface CreateRoleData {
  title: string
  slug: string
}

export interface UpdateRoleData {
  title?: string
  slug?: string
}

class RoleService {
  private baseUrl = '/roles'

  async getRoles(params?: {
    page?: number
    limit?: number
    search?: string
    sortBy?: string
    sortDirection?: 'asc' | 'desc'
  }) {
    const queryParams = new URLSearchParams()
    
    if (params?.page) queryParams.append('page', params.page.toString())
    if (params?.limit) queryParams.append('limit', params.limit.toString())
    if (params?.search) queryParams.append('search', params.search)
    if (params?.sortBy) queryParams.append('sort_by', params.sortBy)
    if (params?.sortDirection) queryParams.append('sort_direction', params.sortDirection)

    const url = `${this.baseUrl}${queryParams.toString() ? `?${queryParams.toString()}` : ''}`
    const response = await api.get<PaginatedResponse<Role>>(url)
    
    return response.data
  }

  async getRole(id: string) {
    const response = await api.get<{ data: Role }>(`${this.baseUrl}/${id}`)
    return response.data
  }

  async createRole(data: CreateRoleData) {
    const response = await api.post<{ data: Role }>(this.baseUrl, data)
    return response.data
  }

  async updateRole(id: string, data: UpdateRoleData) {
    const response = await api.put<{ data: Role }>(`${this.baseUrl}/${id}`, data)
    return response.data
  }

  async deleteRole(id: string) {
    await api.delete(`${this.baseUrl}/${id}`)
  }
}

export const roleService = new RoleService() 