import { api } from '../lib/api'
import type { User, ApiResponse } from '../types'

export interface CreateUserData {
  first_name: string
  middle_name?: string
  last_name: string
  ext_name?: string
  gender: 'male' | 'female' | 'other'
  birthdate: string
  email: string
  password: string
  role_id?: string
  institution_ids?: string[]
}

export interface UpdateUserData {
  first_name?: string
  middle_name?: string
  last_name?: string
  ext_name?: string
  gender?: 'male' | 'female' | 'other'
  birthdate?: string
  email?: string
  password?: string
  role_id?: string
  institution_ids?: string[]
  is_new?: boolean
  is_active?: boolean
}

class UserService {
  private baseUrl = '/users'

  async getUsers(params?: {
    page?: number
    limit?: number
    search?: string
    gender?: 'male' | 'female' | 'other'
    is_active?: boolean
    role_id?: string
  }) {
    const queryParams = new URLSearchParams()
    
    if (params?.page) queryParams.append('page', params.page.toString())
    if (params?.limit) queryParams.append('limit', params.limit.toString())
    if (params?.search) queryParams.append('search', params.search)
    if (params?.gender) queryParams.append('gender', params.gender)
    if (params?.is_active !== undefined) queryParams.append('is_active', params.is_active.toString())
    if (params?.role_id) queryParams.append('role_id', params.role_id)

    const url = `${this.baseUrl}${queryParams.toString() ? `?${queryParams.toString()}` : ''}`
    const response = await api.get<ApiResponse<User[]>>(url)
    
    return response.data
  }

  async getUser(id: string) {
    const response = await api.get<ApiResponse<User>>(`${this.baseUrl}/${id}`)
    return response.data
  }

  async createUser(data: CreateUserData) {
    const response = await api.post<ApiResponse<User>>(this.baseUrl, data)
    return response.data
  }

  async updateUser(id: string, data: UpdateUserData) {
    const response = await api.put<ApiResponse<User>>(`${this.baseUrl}/${id}`, data)
    return response.data
  }

  async deleteUser(id: string) {
    await api.delete(`${this.baseUrl}/${id}`)
  }

  async assignUserToInstitution(userId: string, institutionId: string, isDefault: boolean = false) {
    const response = await api.post<ApiResponse<any>>(`/user-institutions`, {
      user_id: userId,
      institution_id: institutionId,
      is_default: isDefault
    })
    return response.data
  }

  async removeUserFromInstitution(userId: string, institutionId: string) {
    await api.delete(`/user-institutions/${userId}/${institutionId}`)
  }
}

export const userService = new UserService() 