import { api } from '../lib/api'
import type { ApiResponse, StudentFee, CreateStudentFeeData, UpdateStudentFeeData } from '../types'

class StudentFeeService {
  private baseUrl = '/student-fees'

  async getStudentFees(params?: { search?: string; is_active?: boolean }) {
    const queryParams = new URLSearchParams()
    if (params?.search) queryParams.append('search', params.search)
    if (params?.is_active !== undefined) {
      queryParams.append('is_active', params.is_active ? '1' : '0')
    }

    const url = `${this.baseUrl}${queryParams.toString() ? `?${queryParams.toString()}` : ''}`
    const response = await api.get<ApiResponse<StudentFee[]>>(url)
    return response.data
  }

  async getStudentFee(id: string) {
    const response = await api.get<ApiResponse<StudentFee>>(`${this.baseUrl}/${id}`)
    return response.data
  }

  async createStudentFee(data: CreateStudentFeeData) {
    const response = await api.post<ApiResponse<StudentFee>>(this.baseUrl, data)
    return response.data
  }

  async updateStudentFee(id: string, data: UpdateStudentFeeData) {
    const response = await api.put<ApiResponse<StudentFee>>(`${this.baseUrl}/${id}`, data)
    return response.data
  }

  async deleteStudentFee(id: string) {
    await api.delete(`${this.baseUrl}/${id}`)
  }
}

export const studentFeeService = new StudentFeeService()
