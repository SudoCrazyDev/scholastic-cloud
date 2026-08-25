import { api } from '../lib/api'
import type {
  ApiResponse,
  StudentLedgerResponse,
  StudentNOAResponse,
  StudentPaymentPlan,
} from '../types'

/**
 * TESTING AID — passes a simulated date through to the API.
 *
 * A recalculated plan prices each period from the balance on the day that period opened, so
 * checking what November bills means being in November. Put `?as_of=2026-11-15` on the page
 * URL and the ledger and notice of account are read as though that were today. Taken from the
 * address bar rather than threaded through the components, so it adds nothing to remove later:
 * delete this function, its two call sites below, and the SimulateRequestDate middleware.
 *
 * The API ignores it outside a local environment.
 */
const simulatedDate = (): string | null => {
  if (typeof window === 'undefined') return null
  const asOf = new URLSearchParams(window.location.search).get('as_of')
  return asOf && /^\d{4}-\d{2}-\d{2}$/.test(asOf) ? asOf : null
}

class StudentFinanceService {
  async getLedger(studentId: string, academicYear?: string) {
    const queryParams = new URLSearchParams()
    if (academicYear) {
      queryParams.append('academic_year', academicYear)
    }
    const asOf = simulatedDate()
    if (asOf) {
      queryParams.append('as_of', asOf)
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

    const asOf = simulatedDate()
    if (asOf) {
      queryParams.append('as_of', asOf)
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
    payload: { academic_year: string; payment_plan_id: string; note?: string }
  ) {
    const response = await api.post<ApiResponse<StudentPaymentPlan>>(
      `/students/${studentId}/payment-plan`,
      payload
    )
    return response.data
  }
}

export const studentFinanceService = new StudentFinanceService()
