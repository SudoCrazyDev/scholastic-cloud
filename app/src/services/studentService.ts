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
    /** Single search: matches first_name, middle_name, last_name, or lrn (backend OR) */
    search?: string
    class_section_id?: string
  }) {
    const queryParams = new URLSearchParams()
    
    if (params?.page) queryParams.append('page', params.page.toString())
    if (params?.per_page) queryParams.append('per_page', params.per_page.toString())
    if (params?.search?.trim()) queryParams.append('search', params.search.trim())
    if (params?.first_name) queryParams.append('first_name', params.first_name)
    if (params?.middle_name) queryParams.append('middle_name', params.middle_name)
    if (params?.last_name) queryParams.append('last_name', params.last_name)
    if (params?.lrn) queryParams.append('lrn', params.lrn)
    if (params?.class_section_id) queryParams.append('class_section_id', params.class_section_id)

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
    // Check if profile_picture is a File object
    const hasFile = data.profile_picture instanceof File
    
    if (hasFile) {
      // Create FormData for file upload
      const formData = new FormData()
      formData.append('first_name', data.first_name)
      if (data.middle_name) formData.append('middle_name', data.middle_name)
      formData.append('last_name', data.last_name)
      if (data.ext_name) formData.append('ext_name', data.ext_name)
      formData.append('gender', data.gender)
      if (data.religion) formData.append('religion', data.religion)
      formData.append('birthdate', data.birthdate)
      if (data.lrn) formData.append('lrn', data.lrn)
      if (data.profile_picture instanceof File) {
        formData.append('profile_picture', data.profile_picture)
      }
      if (data.is_active !== undefined) {
        formData.append('is_active', data.is_active.toString())
      }
      
      // Axios will automatically set Content-Type with boundary for FormData
      const response = await api.post<{ success: boolean; data: Student }>(this.baseUrl, formData)
      return response.data
    } else {
      // Regular JSON request
      const response = await api.post<{ success: boolean; data: Student }>(this.baseUrl, data)
      return response.data
    }
  }

  async updateStudent(id: string, data: UpdateStudentData) {
    // Check if profile_picture is a File object
    const hasFile = data.profile_picture instanceof File
    
    if (hasFile) {
      // Create FormData for file upload
      const formData = new FormData()
      if (data.first_name) formData.append('first_name', data.first_name)
      if (data.middle_name) formData.append('middle_name', data.middle_name)
      if (data.last_name) formData.append('last_name', data.last_name)
      if (data.ext_name) formData.append('ext_name', data.ext_name)
      if (data.gender) formData.append('gender', data.gender)
      if (data.religion) formData.append('religion', data.religion)
      if (data.birthdate) formData.append('birthdate', data.birthdate)
      if (data.lrn) formData.append('lrn', data.lrn)
      if (data.profile_picture instanceof File) {
        formData.append('profile_picture', data.profile_picture, data.profile_picture.name)
      }
      if (data.is_active !== undefined) {
        formData.append('is_active', data.is_active.toString())
      }
      
      // Use POST endpoint specifically for file uploads (PUT/PATCH don't handle multipart/form-data correctly in Laravel)
      // The interceptor will handle Content-Type automatically for FormData
      const response = await api.post<{ success: boolean; data: Student }>(`${this.baseUrl}/${id}/update`, formData)
      return response.data
    } else {
      // Regular JSON request - exclude profile_picture if it's not a file
      const jsonData = { ...data }
      if (jsonData.profile_picture && !(jsonData.profile_picture instanceof File)) {
        delete jsonData.profile_picture
      }
      const response = await api.put<{ success: boolean; data: Student }>(`${this.baseUrl}/${id}`, jsonData)
      return response.data
    }
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
    const response = await api.post<{ success: boolean; message: string; data: any[] }>("/student-sections/bulk-assign", data)
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