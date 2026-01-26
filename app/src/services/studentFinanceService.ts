import { api } from '../lib/api'
import type { ApiResponse, StudentLedgerResponse, StudentNOAResponse } from '../types'

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
}

export const studentFinanceService = new StudentFinanceService()
