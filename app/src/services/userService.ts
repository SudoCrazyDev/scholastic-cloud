import { api } from '../lib/api'
import type { User, PaginatedResponse } from '../types'
import type { AssignedSubject } from '../types'

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

  async getUser(id: string) {
    const response = await api.get<{ data: User }>(`${this.baseUrl}/${id}`)
    return response.data
  }

  async createUser(data: CreateUserData) {
    const response = await api.post<{ data: User }>(this.baseUrl, data)
    return response.data
  }

  async updateUser(id: string, data: UpdateUserData) {
    const response = await api.put<{ data: User }>(`${this.baseUrl}/${id}`, data)
    return response.data
  }

  async deleteUser(id: string) {
    await api.delete(`${this.baseUrl}/${id}`)
  }

  async assignUserToInstitution(userId: string, institutionId: string, isDefault: boolean = false) {
    const response = await api.post<{ data: any }>(`/user-institutions`, {
      user_id: userId,
      institution_id: institutionId,
      is_default: isDefault
    })
    return response.data
  }

  async removeUserFromInstitution(userId: string, institutionId: string) {
    await api.delete(`/user-institutions/${userId}/${institutionId}`)
  }

  async getMyClassSections(params?: {
    page?: number
    per_page?: number
    search?: string
    institution_id?: string
  }) {
    const queryParams = new URLSearchParams()
    
    if (params?.page) queryParams.append('page', params.page.toString())
    if (params?.per_page) queryParams.append('per_page', params.per_page.toString())
    if (params?.search) queryParams.append('search', params.search)
    if (params?.institution_id) queryParams.append('institution_id', params.institution_id)

    const url = `/users/my/class-sections${queryParams.toString() ? `?${queryParams.toString()}` : ''}`
    const response = await api.get<PaginatedResponse<any>>(url)
    
    return response.data
  }

  async getMySubjects(academicYear?: string) {
    const params = new URLSearchParams()
    if (academicYear) params.set('academic_year', academicYear)
    const url = `/users/my/subjects${params.toString() ? `?${params.toString()}` : ''}`
    const response = await api.get<{ data: AssignedSubject[]; success: boolean; message?: string }>(url)
    return response.data.data
  }
}

export const userService = new UserService() 