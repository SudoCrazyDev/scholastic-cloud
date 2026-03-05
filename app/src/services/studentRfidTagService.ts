import { api } from '../lib/api'
import type { StudentRfidTag, CreateStudentRfidTagData, UpdateStudentRfidTagData } from '../types'

class StudentRfidTagService {
  private baseUrl = '/student-rfid-tags'

  async getTags(params?: { student_id?: string; institution_id?: string }) {
    const queryParams = new URLSearchParams()

    if (params?.student_id) {
      queryParams.append('student_id', params.student_id)
    }
    if (params?.institution_id) {
      queryParams.append('institution_id', params.institution_id)
    }

    const url = queryParams.toString()
      ? `${this.baseUrl}?${queryParams.toString()}`
      : this.baseUrl

    const response = await api.get<{ success: boolean; data: StudentRfidTag[] }>(url)
    return response.data
  }

  async getTag(id: string) {
    const response = await api.get<{ success: boolean; data: StudentRfidTag }>(`${this.baseUrl}/${id}`)
    return response.data
  }

  async createTag(data: CreateStudentRfidTagData) {
    const response = await api.post<{ success: boolean; message: string; data: StudentRfidTag }>(this.baseUrl, data)
    return response.data
  }

  async updateTag(id: string, data: UpdateStudentRfidTagData) {
    const response = await api.put<{ success: boolean; message: string; data: StudentRfidTag }>(`${this.baseUrl}/${id}`, data)
    return response.data
  }

  async deleteTag(id: string) {
    const response = await api.delete<{ success: boolean; message: string }>(`${this.baseUrl}/${id}`)
    return response.data
  }
}

export const studentRfidTagService = new StudentRfidTagService()
