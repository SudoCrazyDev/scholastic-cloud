import { api } from '../lib/api'
import type {
  ApiResponse,
  SchoolFeeDefault,
  CreateSchoolFeeDefaultData,
  UpdateSchoolFeeDefaultData,
  BulkSchoolFeeDefaultData
} from '../types'

class SchoolFeeDefaultService {
  private baseUrl = '/school-fee-defaults'

  async getDefaults(params?: { academic_year?: string; grade_level?: string; school_fee_id?: string }) {
    const queryParams = new URLSearchParams()
    if (params?.academic_year) queryParams.append('academic_year', params.academic_year)
    if (params?.grade_level) queryParams.append('grade_level', params.grade_level)
    if (params?.school_fee_id) queryParams.append('school_fee_id', params.school_fee_id)

    const url = `${this.baseUrl}${queryParams.toString() ? `?${queryParams.toString()}` : ''}`
    const response = await api.get<ApiResponse<SchoolFeeDefault[]>>(url)
    return response.data
  }

  async upsertDefault(data: CreateSchoolFeeDefaultData) {
    const response = await api.post<ApiResponse<SchoolFeeDefault>>(this.baseUrl, data)
    return response.data
  }

  async updateDefault(id: string, data: UpdateSchoolFeeDefaultData) {
    const response = await api.put<ApiResponse<SchoolFeeDefault>>(`${this.baseUrl}/${id}`, data)
    return response.data
  }

  async bulkUpsert(data: BulkSchoolFeeDefaultData) {
    const response = await api.post<ApiResponse<{ saved: number }>>(`${this.baseUrl}/bulk-upsert`, data)
    return response.data
  }

  async deleteDefault(id: string) {
    await api.delete(`${this.baseUrl}/${id}`)
  }
}

export const schoolFeeDefaultService = new SchoolFeeDefaultService()
