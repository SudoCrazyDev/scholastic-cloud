import { api } from '@/lib/api';
import type { 
  SubjectTemplate, 
  CreateSubjectTemplateData, 
  UpdateSubjectTemplateData,
  ApiResponse 
} from '../types'

export const subjectTemplateService = {
  /**
   * Get all subject templates
   */
  async getAll(params?: { grade_level?: string; search?: string }): Promise<ApiResponse<SubjectTemplate[]>> {
    const response = await api.get('/subject-templates', { params })
    return response.data
  },

  /**
   * Get a single subject template by ID
   */
  async getById(id: string): Promise<ApiResponse<SubjectTemplate>> {
    const response = await api.get(`/subject-templates/${id}`)
    return response.data
  },

  /**
   * Create a new subject template
   */
  async create(data: CreateSubjectTemplateData): Promise<ApiResponse<SubjectTemplate>> {
    const response = await api.post('/subject-templates', data)
    return response.data
  },

  /**
   * Update an existing subject template
   */
  async update(id: string, data: UpdateSubjectTemplateData): Promise<ApiResponse<SubjectTemplate>> {
    const response = await api.put(`/subject-templates/${id}`, data)
    return response.data
  },

  /**
   * Delete a subject template
   */
  async delete(id: string): Promise<ApiResponse> {
    const response = await api.delete(`/subject-templates/${id}`)
    return response.data
  },

  /**
   * Apply a template to a class section
   */
  async applyToSection(templateId: string, classSectionId: string): Promise<ApiResponse> {
    const response = await api.post(`/subject-templates/${templateId}/apply`, {
      class_section_id: classSectionId
    })
    return response.data
  }
}