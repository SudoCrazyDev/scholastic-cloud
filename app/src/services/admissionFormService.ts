import { api } from '../lib/api'
import type { AdmissionFormPayload, AdmissionFormSubmissionListItem } from '../types'

export const admissionFormService = {
  async getPublicInstitution(id: string) {
    const response = await api.get<{
      success: boolean
      data: {
        id: string
        title: string
        abbr: string | null
        address: string | null
        logo_url: string | null
      }
    }>(`/public/institutions/${id}`)
    return response.data
  },

  async submitPublic(payload: AdmissionFormPayload & { institution_id: string }) {
    const response = await api.post<{ success: boolean; message?: string; data?: { id: string } }>(
      '/public/admission-form-submissions',
      payload
    )
    return response.data
  },

  async list(params?: { page?: number; per_page?: number; search?: string; institution_id?: string }) {
    const searchParams = new URLSearchParams()
    if (params?.page) searchParams.set('page', String(params.page))
    if (params?.per_page) searchParams.set('per_page', String(params.per_page))
    if (params?.search) searchParams.set('search', params.search)
    if (params?.institution_id) searchParams.set('institution_id', params.institution_id)

    const q = searchParams.toString()
    const response = await api.get<{
      success: boolean
      data: AdmissionFormSubmissionListItem[]
      pagination: {
        current_page: number
        last_page: number
        per_page: number
        total: number
        from: number | null
        to: number | null
      }
    }>(`/admission-form-submissions${q ? `?${q}` : ''}`)
    return response.data
  },

  async getOne(id: string) {
    const response = await api.get<{ success: boolean; data: AdmissionFormSubmissionListItem }>(
      `/admission-form-submissions/${id}`
    )
    return response.data
  },
}
