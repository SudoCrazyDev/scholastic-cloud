import { api } from '../lib/api'
import type { 
  Subject, 
  CreateSubjectData, 
  UpdateSubjectData, 
  ReorderSubjectsData,
  ApiResponse, 
  PaginatedResponse 
} from '../types'

class SubjectService {
  async getSubjects(params?: {
    class_section_id?: string
    institution_id?: string
    search?: string
    page?: number
    per_page?: number
  }): Promise<PaginatedResponse<Subject>> {
    const response = await api.get('/subjects', { params })
    return response.data
  }

  async getSubject(id: string): Promise<ApiResponse<Subject>> {
    const response = await api.get(`/subjects/${id}`)
    return response.data
  }

  async createSubject(data: CreateSubjectData): Promise<ApiResponse<Subject>> {
    const response = await api.post('/subjects', data)
    return response.data
  }

  async updateSubject(id: string, data: UpdateSubjectData): Promise<ApiResponse<Subject>> {
    const response = await api.put(`/subjects/${id}`, data)
    return response.data
  }

  async deleteSubject(id: string): Promise<ApiResponse<void>> {
    const response = await api.delete(`/subjects/${id}`)
    return response.data
  }

  async reorderSubjects(classSectionId: string, subjectOrders: Array<{ id: string; order: number }>): Promise<ApiResponse<void>> {
    const data: ReorderSubjectsData = {
      class_section_id: classSectionId,
      subject_orders: subjectOrders
    }
    const response = await api.post('/subjects/reorder', data)
    return response.data
  }
}

export const subjectService = new SubjectService() 