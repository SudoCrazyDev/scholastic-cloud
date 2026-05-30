import { api } from '../lib/api'
import type {
  ApiResponse,
  StudentLedgerResponse,
  StudentNOAResponse,
  StudentPaymentPlan,
  StudentPaymentPlanType,
} from '../types'

class StudentFinanceService {
  async getLedger(studentId: string, academicYear?: string) {
    const queryParams = new URLSearchParams()
    if (academicYear) {
      queryParams.append('academic_year', academicYear)
    }

    const url = `/students/${studentId}/ledger${queryParams.toString() ? `?${queryParams.toString()}` : ''}`
    const response = await api.get<ApiResponse<StudentLedgerResponse>>(url)
    return response.data
  }

  async getNoticeOfAccount(studentId: string, academicYear?: string) {
    const queryParams = new URLSearchParams()
    if (academicYear) {
      queryParams.append('academic_year', academicYear)
    }

    const url = `/students/${studentId}/noa${queryParams.toString() ? `?${queryParams.toString()}` : ''}`
    const response = await api.get<ApiResponse<StudentNOAResponse>>(url)
    return response.data
  }

  async getPaymentPlan(studentId: string, academicYear: string) {
    const params = new URLSearchParams({ academic_year: academicYear })
    const url = `/students/${studentId}/payment-plan?${params.toString()}`
    const response = await api.get<ApiResponse<StudentPaymentPlan | null>>(url)
    return response.data
  }

  async setPaymentPlan(
    studentId: string,
    payload: { academic_year: string; plan_type: StudentPaymentPlanType }
  ) {
    const response = await api.post<ApiResponse<StudentPaymentPlan>>(
      `/students/${studentId}/payment-plan`,
      payload
    )
    return response.data
  }
}

export const studentFinanceService = new StudentFinanceService()
