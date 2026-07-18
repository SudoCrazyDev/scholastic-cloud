import { api } from '../lib/api'
import type { ApiResponse, PaymentReceiptSubmission, ReceiptSubmissionStatus } from '../types'

class PaymentReceiptService {
  private baseUrl = '/payment-receipt-submissions'

  async list(params?: {
    status?: ReceiptSubmissionStatus
    academic_year?: string
    student_id?: string
  }) {
    const query = new URLSearchParams()
    if (params?.status) query.set('status', params.status)
    if (params?.academic_year) query.set('academic_year', params.academic_year)
    if (params?.student_id) query.set('student_id', params.student_id)
    const suffix = query.toString() ? `?${query.toString()}` : ''
    const response = await api.get<ApiResponse<PaymentReceiptSubmission[]>>(
      `${this.baseUrl}${suffix}`
    )
    return response.data
  }

  async upload(data: {
    academic_year: string
    installment_sequence: number
    installment_label?: string
    file: File
  }) {
    const formData = new FormData()
    formData.append('academic_year', data.academic_year)
    formData.append('installment_sequence', String(data.installment_sequence))
    if (data.installment_label) {
      formData.append('installment_label', data.installment_label)
    }
    formData.append('file', data.file, data.file.name)

    const response = await api.post<ApiResponse<PaymentReceiptSubmission>>(this.baseUrl, formData)
    return response.data
  }

  async approve(id: string, amount: number) {
    const response = await api.post<ApiResponse<PaymentReceiptSubmission>>(
      `${this.baseUrl}/${id}/approve`,
      { amount }
    )
    return response.data
  }

  async reject(id: string, review_note: string) {
    const response = await api.post<ApiResponse<PaymentReceiptSubmission>>(
      `${this.baseUrl}/${id}/reject`,
      { review_note }
    )
    return response.data
  }
}

export const paymentReceiptService = new PaymentReceiptService()
