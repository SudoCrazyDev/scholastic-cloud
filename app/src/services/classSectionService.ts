import { api } from '../lib/api'
import type { ClassSection, PaginatedResponse, CreateClassSectionData, UpdateClassSectionData } from '../types'

class ClassSectionService {
  private baseUrl = '/class-sections'

  async getClassSections(params?: {
    page?: number
    per_page?: number
    search?: string
    grade_level?: string
  }) {
    const queryParams = new URLSearchParams()
    
    if (params?.page) queryParams.append('page', params.page.toString())
    if (params?.per_page) queryParams.append('per_page', params.per_page.toString())
    if (params?.search) queryParams.append('search', params.search)
    if (params?.grade_level) queryParams.append('grade_level', params.grade_level)

    const url = `${this.baseUrl}${queryParams.toString() ? `?${queryParams.toString()}` : ''}`
    const response = await api.get<PaginatedResponse<ClassSection>>(url)
    
    return response.data
  }

  async getClassSectionsByInstitution(institutionId?: string, params?: {
    page?: number
    per_page?: number
    search?: string
    grade_level?: string
  }) {
    const queryParams = new URLSearchParams()
    
    if (params?.page) queryParams.append('page', params.page.toString())
    if (params?.per_page) queryParams.append('per_page', params.per_page.toString())
    if (params?.search) queryParams.append('search', params.search)
    if (params?.grade_level) queryParams.append('grade_level', params.grade_level)

    const url = `${this.baseUrl}/by-institution${institutionId ? `/${institutionId}` : ''}${queryParams.toString() ? `?${queryParams.toString()}` : ''}`
    const response = await api.get<PaginatedResponse<ClassSection>>(url)
    
    return response.data
  }

  async getClassSection(id: string) {
    const response = await api.get<{ data: ClassSection }>(`${this.baseUrl}/${id}`)
    return response.data
  }

  async createClassSection(data: CreateClassSectionData) {
    const response = await api.post<{ data: ClassSection }>(this.baseUrl, data)
    return response.data
  }

  async updateClassSection(id: string, data: UpdateClassSectionData) {
    const response = await api.put<{ data: ClassSection }>(`${this.baseUrl}/${id}`, data)
    return response.data
  }

  async deleteClassSection(id: string) {
    await api.delete(`${this.baseUrl}/${id}`)
  }
}

export const classSectionService = new ClassSectionService() 