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
    class_section_id?: string
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

  async getStudentsByClassSection(sectionId: string) {
    const response = await api.get<{ success: boolean; data: any[] }>(`/student-sections?section_id=${sectionId}`)
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

  async assignStudentsToSection(data: {
    student_ids: string[]
    section_id: string
    academic_year: string
  }) {
    const response = await api.post<{ success: boolean; message: string; data: any[] }>('/student-sections/bulk-assign', data)
    return response.data
  }

  async searchStudentsForAssignment(params: {
    search?: string
    page?: number
    per_page?: number
    exclude_section_id?: string
  }) {
    const queryParams = new URLSearchParams()
    
    if (params?.search) queryParams.append('search', params.search)
    if (params?.page) queryParams.append('page', params.page.toString())
    if (params?.per_page) queryParams.append('per_page', params.per_page.toString())
    if (params?.exclude_section_id) queryParams.append('exclude_section_id', params.exclude_section_id)

    const url = `${this.baseUrl}/search-for-assignment${queryParams.toString() ? `?${queryParams.toString()}` : ''}`
    const response = await api.get<PaginatedResponse<Student>>(url)
    
    return response.data
  }

  async removeStudentFromSection(studentSectionId: string) {
    const response = await api.delete<{ success: boolean; message: string }>(`/student-sections/${studentSectionId}`)
    return response.data
  }
}

export const studentService = new StudentService() 