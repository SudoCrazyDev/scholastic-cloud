import { api } from '../lib/api'
import type { StudentAttendance, CreateStudentAttendanceData, UpdateStudentAttendanceData, BulkUpsertStudentAttendanceData } from '../types'

class StudentAttendanceService {
  private baseUrl = '/student-attendances'

  async getAttendances(params: {
    class_section_id: string
    academic_year?: string
    month?: number
    year?: number
  }) {
    const queryParams = new URLSearchParams()
    queryParams.append('class_section_id', params.class_section_id)
    
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
    const response = await api.get<{ success: boolean; data: StudentAttendance[] }>(url)
    return response.data
  }

  async getAttendance(id: string) {
    const response = await api.get<{ success: boolean; data: StudentAttendance }>(`${this.baseUrl}/${id}`)
    return response.data
  }

  async createAttendance(data: CreateStudentAttendanceData) {
    const response = await api.post<{ success: boolean; message: string; data: StudentAttendance }>(this.baseUrl, data)
    return response.data
  }

  async updateAttendance(id: string, data: UpdateStudentAttendanceData) {
    const response = await api.put<{ success: boolean; message: string; data: StudentAttendance }>(`${this.baseUrl}/${id}`, data)
    return response.data
  }

  async deleteAttendance(id: string) {
    const response = await api.delete<{ success: boolean; message: string }>(`${this.baseUrl}/${id}`)
    return response.data
  }

  async bulkUpsert(data: BulkUpsertStudentAttendanceData) {
    const response = await api.post<{ success: boolean; message: string; data: { created: number; updated: number; total: number } }>(`${this.baseUrl}/bulk-upsert`, data)
    return response.data
  }
}

export const studentAttendanceService = new StudentAttendanceService()

