import { api } from '../lib/api'
import type { ApiResponse, FinanceDashboardSummary } from '../types'

class FinanceDashboardService {
  async getSummary(academicYear: string) {
    const queryParams = new URLSearchParams()
    queryParams.append('academic_year', academicYear)

    const response = await api.get<ApiResponse<FinanceDashboardSummary>>(
      `/finance/dashboard?${queryParams.toString()}`
    )
    return response.data
  }
}

export const financeDashboardService = new FinanceDashboardService()
