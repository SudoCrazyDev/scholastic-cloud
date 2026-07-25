import { api } from '../lib/api'
import type { Disbursement, DisbursementType, DisbursementFormData } from '../types'

interface ApiResponse<T> {
  success: boolean
  data: T
  message?: string
}

function toFormData(data: DisbursementFormData): FormData {
  const fd = new FormData()
  fd.append('title', data.title)
  if (data.description != null) fd.append('description', data.description)
  fd.append('amount', String(data.amount))
  fd.append('date_issued', data.date_issued)
  if (data.disbursement_type_id) fd.append('disbursement_type_id', data.disbursement_type_id)
  if (data.in_charge_user_id) fd.append('in_charge_user_id', data.in_charge_user_id)
  ;(data.receipts ?? []).forEach((file) => fd.append('receipts[]', file))
  ;(data.remove_receipt_ids ?? []).forEach((id) => fd.append('remove_receipt_ids[]', id))
  return fd
}

class DisbursementService {
  private baseUrl = '/disbursements'
  private typesUrl = '/disbursement-types'

  async getDisbursements() {
    const response = await api.get<ApiResponse<Disbursement[]>>(this.baseUrl)
    return response.data
  }

  async createDisbursement(data: DisbursementFormData) {
    const response = await api.post<ApiResponse<Disbursement>>(this.baseUrl, toFormData(data))
    return response.data
  }

  // Update uses POST (multipart) because PHP cannot parse uploaded files on PUT.
  async updateDisbursement(id: string, data: DisbursementFormData) {
    const response = await api.post<ApiResponse<Disbursement>>(`${this.baseUrl}/${id}`, toFormData(data))
    return response.data
  }

  async deleteDisbursement(id: string) {
    await api.delete(`${this.baseUrl}/${id}`)
  }

  async getTypes() {
    const response = await api.get<ApiResponse<DisbursementType[]>>(this.typesUrl)
    return response.data
  }

  async createType(name: string) {
    const response = await api.post<ApiResponse<DisbursementType>>(this.typesUrl, { name })
    return response.data
  }

  async deleteType(id: string) {
    await api.delete(`${this.typesUrl}/${id}`)
  }
}

export const disbursementService = new DisbursementService()
