import { api } from '../lib/api'
import type { ApiResponse, PaymentVoidRequest, PaymentVoidStatus } from '../types'

class PaymentVoidService {
  private baseUrl = '/payment-void-requests'

  async list(status?: PaymentVoidStatus) {
    const url = status ? `${this.baseUrl}?status=${status}` : this.baseUrl
    const response = await api.get<ApiResponse<PaymentVoidRequest[]>>(url)
    return response.data
  }

  async create(data: { receipt_number: string; request_note: string }) {
    const response = await api.post<ApiResponse<PaymentVoidRequest>>(this.baseUrl, data)
    return response.data
  }

  async approve(id: string) {
    const response = await api.post<ApiResponse<PaymentVoidRequest>>(`${this.baseUrl}/${id}/approve`, {})
    return response.data
  }

  async disapprove(id: string, review_note: string) {
    const response = await api.post<ApiResponse<PaymentVoidRequest>>(
      `${this.baseUrl}/${id}/disapprove`,
      { review_note }
    )
    return response.data
  }
}

export const paymentVoidService = new PaymentVoidService()
