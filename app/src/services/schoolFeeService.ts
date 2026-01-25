import { api } from '../lib/api'
import type { ApiResponse, SchoolFee, CreateSchoolFeeData, UpdateSchoolFeeData } from '../types'

class SchoolFeeService {
  private baseUrl = '/school-fees'

  async getSchoolFees(params?: { search?: string; is_active?: boolean }) {
    const queryParams = new URLSearchParams()
    if (params?.search) queryParams.append('search', params.search)
    if (params?.is_active !== undefined) {
      queryParams.append('is_active', params.is_active ? '1' : '0')
    }

    const url = `${this.baseUrl}${queryParams.toString() ? `?${queryParams.toString()}` : ''}`
    const response = await api.get<ApiResponse<SchoolFee[]>>(url)
    return response.data
  }

  async getSchoolFee(id: string) {
    const response = await api.get<ApiResponse<SchoolFee>>(`${this.baseUrl}/${id}`)
    return response.data
  }

  async createSchoolFee(data: CreateSchoolFeeData) {
    const response = await api.post<ApiResponse<SchoolFee>>(this.baseUrl, data)
    return response.data
  }

  async updateSchoolFee(id: string, data: UpdateSchoolFeeData) {
    const response = await api.put<ApiResponse<SchoolFee>>(`${this.baseUrl}/${id}`, data)
    return response.data
  }

  async deleteSchoolFee(id: string) {
    await api.delete(`${this.baseUrl}/${id}`)
  }
}

export const schoolFeeService = new SchoolFeeService()
