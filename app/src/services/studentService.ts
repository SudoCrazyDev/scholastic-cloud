import { api } from '../lib/api'
import type { Student, CreateStudentData, UpdateStudentData, PaginatedResponse } from '../types'

class StudentService {
  private baseUrl = '/students'

  async getStudents(params?: {
    page?: number
    per_page?: number
    first_name?: string
    middle_name?: string
    last_name?: string
    lrn?: string
  }) {
    const queryParams = new URLSearchParams()
    
    if (params?.page) queryParams.append('page', params.page.toString())
    if (params?.per_page) queryParams.append('per_page', params.per_page.toString())
    if (params?.first_name) queryParams.append('first_name', params.first_name)
    if (params?.middle_name) queryParams.append('middle_name', params.middle_name)
    if (params?.last_name) queryParams.append('last_name', params.last_name)
    if (params?.lrn) queryParams.append('lrn', params.lrn)

    const url = `${this.baseUrl}${queryParams.toString() ? `?${queryParams.toString()}` : ''}`
    const response = await api.get<PaginatedResponse<Student>>(url)
    
    return response.data
  }

  async getStudent(id: string) {
    const response = await api.get<{ success: boolean; data: Student }>(`${this.baseUrl}/${id}`)
    return response.data
  }

  async createStudent(data: CreateStudentData) {
    const response = await api.post<{ success: boolean; data: Student }>(this.baseUrl, data)
    return response.data
  }

  async updateStudent(id: string, data: UpdateStudentData) {
    const response = await api.put<{ success: boolean; data: Student }>(`${this.baseUrl}/${id}`, data)
    return response.data
  }

  async deleteStudent(id: string) {
    const response = await api.delete<{ success: boolean; message: string }>(`${this.baseUrl}/${id}`)
    return response.data
  }

  async checkStudentExists(data: {
    first_name: string
    middle_name?: string
    last_name?: string
  }) {
    const response = await api.post<{ exists: boolean }>(`${this.baseUrl}/exists`, data)
    return response.data
  }
}

export const studentService = new StudentService() 