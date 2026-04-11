import { api } from '../lib/api'
import type { StudentRfidTag, CreateStudentRfidTagData, UpdateStudentRfidTagData } from '../types'

class StudentRfidTagService {
  private baseUrl = '/student-rfid-tags'

  async getByStudent(studentId: string) {
    const response = await api.get<{ success: boolean; data: StudentRfidTag[] }>(
      `${this.baseUrl}?student_id=${studentId}`
    )
    return response.data
  }

  async create(data: CreateStudentRfidTagData) {
    const response = await api.post<{ success: boolean; message: string; data: StudentRfidTag }>(
      this.baseUrl,
      data
    )
    return response.data
  }

  async update(id: string, data: UpdateStudentRfidTagData) {
    const response = await api.put<{ success: boolean; message: string; data: StudentRfidTag }>(
      `${this.baseUrl}/${id}`,
      data
    )
    return response.data
  }

  async remove(id: string) {
    const response = await api.delete<{ success: boolean; message: string }>(
      `${this.baseUrl}/${id}`
    )
    return response.data
  }
}

export const studentRfidTagService = new StudentRfidTagService()
