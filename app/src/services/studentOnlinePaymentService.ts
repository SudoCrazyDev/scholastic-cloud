import { api } from '../lib/api'
import type {
  ApiResponse,
  StudentOnlinePaymentTransaction,
  CreateStudentOnlinePaymentCheckoutData,
} from '../types'

class StudentOnlinePaymentService {
  private baseUrl = '/student-online-payments'

  async getTransactions(params?: { student_id?: string; academic_year?: string }) {
    const queryParams = new URLSearchParams()
    if (params?.student_id) queryParams.append('student_id', params.student_id)
    if (params?.academic_year) queryParams.append('academic_year', params.academic_year)

    const url = `${this.baseUrl}${queryParams.toString() ? `?${queryParams.toString()}` : ''}`
    const response = await api.get<ApiResponse<StudentOnlinePaymentTransaction[]>>(url)
    return response.data
  }

  async createCheckout(data: CreateStudentOnlinePaymentCheckoutData) {
    const response = await api.post<ApiResponse<StudentOnlinePaymentTransaction>>(
      `${this.baseUrl}/checkout`,
      data
    )
    return response.data
  }

  async getTransaction(id: string) {
    const response = await api.get<ApiResponse<StudentOnlinePaymentTransaction>>(`${this.baseUrl}/${id}`)
    return response.data
  }
}

export const studentOnlinePaymentService = new StudentOnlinePaymentService()
