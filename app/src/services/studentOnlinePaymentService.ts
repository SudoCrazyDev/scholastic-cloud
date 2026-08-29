import { api } from '../lib/api'
import type {
  ApiResponse,
  StudentOnlinePaymentTransaction,
  CreateStudentOnlinePaymentCheckoutData,
  OnlinePaymentAvailability,
} from '../types'

class StudentOnlinePaymentService {
  private baseUrl = '/student-online-payments'

  /**
   * Whether this school takes online payments at all, and through whom.
   *
   * Cheap and safe to call on load: it reads the school's merchant account
   * without touching the provider, and returns no keys.
   */
  async getAvailability() {
    const response = await api.get<ApiResponse<OnlinePaymentAvailability>>(
      `${this.baseUrl}/availability`
    )
    return response.data
  }

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

  async recordOutcome(id: string, outcome: 'failed' | 'cancelled') {
    const response = await api.post<ApiResponse<StudentOnlinePaymentTransaction>>(
      `${this.baseUrl}/${id}/outcome`,
      { outcome }
    )
    return response.data
  }
}

export const studentOnlinePaymentService = new StudentOnlinePaymentService()
