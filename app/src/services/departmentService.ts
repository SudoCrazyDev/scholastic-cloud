import { api } from '../lib/api'
import type { Department, CreateDepartmentData, UpdateDepartmentData } from '../types'

interface ApiResponse<T> {
  success: boolean
  data: T
  message?: string
}

class DepartmentService {
  private baseUrl = '/departments'

  async getDepartments(institutionId?: string) {
    const params = institutionId ? { institution_id: institutionId } : {}
    const query = new URLSearchParams(params as Record<string, string>).toString()
    const url = query ? `${this.baseUrl}?${query}` : this.baseUrl
    const response = await api.get<ApiResponse<Department[]>>(url)
    return response.data
  }

  async getDepartment(id: string) {
    const response = await api.get<ApiResponse<Department>>(`${this.baseUrl}/${id}`)
    return response.data
  }

  async createDepartment(data: CreateDepartmentData, institutionId?: string) {
    const payload = institutionId ? { ...data, institution_id: institutionId } : data
    const response = await api.post<ApiResponse<Department>>(this.baseUrl, payload)
    return response.data
  }

  async updateDepartment(id: string, data: UpdateDepartmentData) {
    const response = await api.put<ApiResponse<Department>>(`${this.baseUrl}/${id}`, data)
    return response.data
  }

  async deleteDepartment(id: string) {
    await api.delete(`${this.baseUrl}/${id}`)
  }
}

export const departmentService = new DepartmentService()
