import { api } from '../lib/api'
import type { User, PaginatedResponse } from '../types'

export interface CreateStaffData {
  first_name: string
  middle_name?: string
  last_name: string
  ext_name?: string
  gender: 'male' | 'female' | 'other'
  birthdate: string
  email: string
  password: string
  role_id: string
}

export interface UpdateStaffData {
  first_name?: string
  middle_name?: string
  last_name?: string
  ext_name?: string
  gender?: 'male' | 'female' | 'other'
  birthdate?: string
  email?: string
  password?: string
  role_id?: string
}

export interface UpdateStaffRoleData {
  role_id: string
}

class StaffService {
  private baseUrl = '/staffs'

  async getStaffs(params?: {
    page?: number
    limit?: number
    search?: string
    sortBy?: string
    sortDirection?: 'asc' | 'desc'
    gender?: 'male' | 'female' | 'other'
    is_active?: boolean
    role_id?: string
  }) {
    const queryParams = new URLSearchParams()
    
    if (params?.page) queryParams.append('page', params.page.toString())
    if (params?.limit) queryParams.append('limit', params.limit.toString())
    if (params?.search) queryParams.append('search', params.search)
    if (params?.sortBy) queryParams.append('sort_by', params.sortBy)
    if (params?.sortDirection) queryParams.append('sort_direction', params.sortDirection)
    if (params?.gender) queryParams.append('gender', params.gender)
    if (params?.is_active !== undefined) queryParams.append('is_active', params.is_active.toString())
    if (params?.role_id) queryParams.append('role_id', params.role_id)

    const url = `${this.baseUrl}${queryParams.toString() ? `?${queryParams.toString()}` : ''}`
    const response = await api.get<PaginatedResponse<User>>(url)
    
    return response.data
  }

  async getStaff(id: string) {
    const response = await api.get<{ data: User }>(`${this.baseUrl}/${id}`)
    return response.data
  }

  async createStaff(data: CreateStaffData) {
    const response = await api.post<{ data: User }>(this.baseUrl, data)
    return response.data
  }

  async updateStaff(id: string, data: UpdateStaffData) {
    const response = await api.put<{ data: User }>(`${this.baseUrl}/${id}`, data)
    return response.data
  }

  async updateStaffRole(id: string, data: UpdateStaffRoleData) {
    const response = await api.put<{ data: User }>(`${this.baseUrl}/${id}/role`, data)
    return response.data
  }

  async deleteStaff(id: string) {
    await api.delete(`${this.baseUrl}/${id}`)
  }
}

export const staffService = new StaffService() 