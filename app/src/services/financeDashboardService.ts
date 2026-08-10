import { api } from '../lib/api'
import type { ApiResponse, FinanceStudentBalances, FinanceCollectionsResponse, CollectionReportResponse } from '../types'

class FinanceDashboardService {
  async getStudentBalances(params: {
    academic_year: string
    grade_level?: string
    section_id?: string
  }) {
    const queryParams = new URLSearchParams()
    queryParams.append('academic_year', params.academic_year)
    if (params.grade_level) queryParams.append('grade_level', params.grade_level)
    if (params.section_id) queryParams.append('section_id', params.section_id)

    const response = await api.get<ApiResponse<FinanceStudentBalances>>(
      `/finance/dashboard/students?${queryParams.toString()}`
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
