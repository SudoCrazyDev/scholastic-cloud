import { api } from '../lib/api'
import type { ApiResponse, FinanceDashboardSummary, FinanceCollectionsResponse } from '../types'

class FinanceDashboardService {
  async getSummary(academicYear: string) {
    const queryParams = new URLSearchParams()
    queryParams.append('academic_year', academicYear)

    const response = await api.get<ApiResponse<FinanceDashboardSummary>>(
      `/finance/dashboard?${queryParams.toString()}`
    )
    return response.data
  }

  async getCollections(academicYear: string) {
    const queryParams = new URLSearchParams()
    queryParams.append('academic_year', academicYear)

    const response = await api.get<ApiResponse<FinanceCollectionsResponse>>(
      `/finance/collections?${queryParams.toString()}`
    )
    return response.data
  }
}

export const financeDashboardService = new FinanceDashboardService()
