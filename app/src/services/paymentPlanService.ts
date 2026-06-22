import { api } from '../lib/api'
import type {
  ApiResponse,
  CreatePaymentPlanData,
  PaymentPlan,
  PaymentPlanChange,
} from '../types'

class PaymentPlanService {
  async getPlans(params?: { is_active?: boolean; search?: string }) {
    const query = new URLSearchParams()
    if (params?.is_active !== undefined) {
      query.append('is_active', String(params.is_active))
    }
    if (params?.search) {
      query.append('search', params.search)
    }
    const url = `/payment-plans${query.toString() ? `?${query.toString()}` : ''}`
    const response = await api.get<ApiResponse<PaymentPlan[]>>(url)
    return response.data
  }

  async createPlan(payload: CreatePaymentPlanData) {
    const response = await api.post<ApiResponse<PaymentPlan>>('/payment-plans', payload)
    return response.data
  }

  async updatePlan(id: string, payload: CreatePaymentPlanData) {
    const response = await api.put<ApiResponse<PaymentPlan>>(`/payment-plans/${id}`, payload)
    return response.data
  }

  async deletePlan(id: string) {
    const response = await api.delete<ApiResponse<null>>(`/payment-plans/${id}`)
    return response.data
  }

  async getChangeHistory(params: { student_id?: string; academic_year?: string }) {
    const query = new URLSearchParams()
    if (params.student_id) {
      query.append('student_id', params.student_id)
    }
    if (params.academic_year) {
      query.append('academic_year', params.academic_year)
    }
    const url = `/payment-plan-changes${query.toString() ? `?${query.toString()}` : ''}`
    const response = await api.get<ApiResponse<PaymentPlanChange[]>>(url)
    return response.data
  }
}

export const paymentPlanService = new PaymentPlanService()
