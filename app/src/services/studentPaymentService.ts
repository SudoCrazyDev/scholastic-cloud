import { api } from '../lib/api'
import type { ApiResponse, StudentPayment, CreateStudentPaymentData, StudentReceipt } from '../types'

class StudentPaymentService {
  private baseUrl = '/student-payments'

  async getPayments(params: { student_id: string; academic_year?: string }) {
    const queryParams = new URLSearchParams()
    queryParams.append('student_id', params.student_id)
    if (params.academic_year) queryParams.append('academic_year', params.academic_year)

    const url = `${this.baseUrl}?${queryParams.toString()}`
    const response = await api.get<ApiResponse<StudentPayment[]>>(url)
    return response.data
  }

  async createPayment(data: CreateStudentPaymentData) {
    const response = await api.post<ApiResponse<StudentPayment>>(this.baseUrl, data)
    return response.data
  }

  async getPayment(id: string) {
    const response = await api.get<ApiResponse<StudentPayment>>(`${this.baseUrl}/${id}`)
    return response.data
  }

  async getReceipt(id: string) {
    const response = await api.get<ApiResponse<StudentReceipt>>(`${this.baseUrl}/${id}/receipt`)
    return response.data
  }
}

export const studentPaymentService = new StudentPaymentService()
