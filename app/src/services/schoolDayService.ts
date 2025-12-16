import { api } from '../lib/api'
import type { SchoolDay, CreateSchoolDayData, UpdateSchoolDayData, BulkUpsertSchoolDayData } from '../types'

class SchoolDayService {
  private baseUrl = '/school-days'

  async getSchoolDays(params: {
    institution_id: string
    academic_year?: string
    month?: number
    year?: number
  }) {
    const queryParams = new URLSearchParams()
    queryParams.append('institution_id', params.institution_id)
    
    if (params.academic_year) {
      queryParams.append('academic_year', params.academic_year)
    }
    if (params.month !== undefined) {
      queryParams.append('month', params.month.toString())
    }
    if (params.year !== undefined) {
      queryParams.append('year', params.year.toString())
    }

    const url = `${this.baseUrl}?${queryParams.toString()}`
    const response = await api.get<{ success: boolean; data: SchoolDay[] }>(url)
    return response.data
  }

  async getSchoolDay(id: string) {
    const response = await api.get<{ success: boolean; data: SchoolDay }>(`${this.baseUrl}/${id}`)
    return response.data
  }

  async createSchoolDay(data: CreateSchoolDayData) {
    const response = await api.post<{ success: boolean; message: string; data: SchoolDay }>(this.baseUrl, data)
    return response.data
  }

  async updateSchoolDay(id: string, data: UpdateSchoolDayData) {
    const response = await api.put<{ success: boolean; message: string; data: SchoolDay }>(`${this.baseUrl}/${id}`, data)
    return response.data
  }

  async deleteSchoolDay(id: string) {
    const response = await api.delete<{ success: boolean; message: string }>(`${this.baseUrl}/${id}`)
    return response.data
  }

  async bulkUpsert(data: BulkUpsertSchoolDayData) {
    const response = await api.post<{ success: boolean; message: string; data: { created: number; updated: number; total: number } }>(`${this.baseUrl}/bulk-upsert`, data)
    return response.data
  }
}

export const schoolDayService = new SchoolDayService()

