import { api } from '../lib/api'
import type { ApiResponse, FinanceDashboardSummary, FinanceCollectionsResponse, CollectionReportResponse } from '../types'

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

  async getCollectionsReport(startDate: string, endDate: string) {
    const queryParams = new URLSearchParams()
    queryParams.append('start_date', startDate)
    queryParams.append('end_date', endDate)

    const response = await api.get<ApiResponse<CollectionReportResponse>>(
      `/finance/collections/report?${queryParams.toString()}`
    )
    return response.data
  }
}

export const financeDashboardService = new FinanceDashboardService()
