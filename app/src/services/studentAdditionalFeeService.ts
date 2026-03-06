import { api } from '../lib/api'
import type { ApiResponse, StudentAdditionalFee, CreateStudentAdditionalFeeData } from '../types'

class StudentAdditionalFeeService {
  private baseUrl = '/student-additional-fees'

  async getFees(params: { student_id: string; academic_year?: string }) {
    const queryParams = new URLSearchParams()
    queryParams.append('student_id', params.student_id)
    if (params.academic_year) queryParams.append('academic_year', params.academic_year)
    const url = `${this.baseUrl}?${queryParams.toString()}`
    const response = await api.get<ApiResponse<StudentAdditionalFee[]>>(url)
    return response.data
  }

  async createFee(data: CreateStudentAdditionalFeeData) {
    const response = await api.post<ApiResponse<StudentAdditionalFee>>(this.baseUrl, data)
    return response.data
  }

  async updateFee(id: string, data: Partial<CreateStudentAdditionalFeeData>) {
    const response = await api.put<ApiResponse<StudentAdditionalFee>>(`${this.baseUrl}/${id}`, data)
    return response.data
  }

  async deleteFee(id: string) {
    await api.delete(`${this.baseUrl}/${id}`)
  }
}

export const studentAdditionalFeeService = new StudentAdditionalFeeService()
