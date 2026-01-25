import { api } from '../lib/api'
import type { ApiResponse, StudentDiscount, CreateStudentDiscountData } from '../types'

class StudentDiscountService {
  private baseUrl = '/student-discounts'

  async getDiscounts(params: { student_id: string; academic_year?: string }) {
    const queryParams = new URLSearchParams()
    queryParams.append('student_id', params.student_id)
    if (params.academic_year) queryParams.append('academic_year', params.academic_year)

    const url = `${this.baseUrl}?${queryParams.toString()}`
    const response = await api.get<ApiResponse<StudentDiscount[]>>(url)
    return response.data
  }

  async createDiscount(data: CreateStudentDiscountData) {
    const response = await api.post<ApiResponse<StudentDiscount>>(this.baseUrl, data)
    return response.data
  }

  async deleteDiscount(id: string) {
    await api.delete(`${this.baseUrl}/${id}`)
  }
}

export const studentDiscountService = new StudentDiscountService()
