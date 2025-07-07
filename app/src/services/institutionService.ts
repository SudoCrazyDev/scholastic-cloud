import { api } from '../lib/api'
import type { Institution, PaginatedResponse, CreateInstitutionData, UpdateInstitutionData } from '../types'

class InstitutionService {
  private baseUrl = '/institutions'

  async getInstitutions(params?: {
    page?: number
    limit?: number
    search?: string
    sortBy?: string
    sortDirection?: 'asc' | 'desc'
    region?: string
    division?: string
  }) {
    const queryParams = new URLSearchParams()
    
    if (params?.page) queryParams.append('page', params.page.toString())
    if (params?.limit) queryParams.append('limit', params.limit.toString())
    if (params?.search) queryParams.append('search', params.search)
    if (params?.sortBy) queryParams.append('sort_by', params.sortBy)
    if (params?.sortDirection) queryParams.append('sort_direction', params.sortDirection)
    if (params?.region) queryParams.append('region', params.region)
    if (params?.division) queryParams.append('division', params.division)

    const url = `${this.baseUrl}${queryParams.toString() ? `?${queryParams.toString()}` : ''}`
    const response = await api.get<PaginatedResponse<Institution>>(url)
    
    return response.data
  }

  async getInstitution(id: string) {
    const response = await api.get<{ data: Institution }>(`${this.baseUrl}/${id}`)
    return response.data
  }

  async createInstitution(data: CreateInstitutionData) {
    const response = await api.post<{ data: Institution }>(this.baseUrl, data)
    return response.data
  }

  async updateInstitution(id: string, data: UpdateInstitutionData) {
    const response = await api.put<{ data: Institution }>(`${this.baseUrl}/${id}`, data)
    return response.data
  }

  async deleteInstitution(id: string) {
    await api.delete(`${this.baseUrl}/${id}`)
  }

  async assignSubscription(institutionId: string, subscriptionId: string, expirationDate: string, discount?: number) {
    const response = await api.post<{ data: any }>(`${this.baseUrl}/${institutionId}/subscriptions`, {
      subscription_id: subscriptionId,
      expiration_date: expirationDate,
      discount: discount || 0
    })
    return response.data
  }
}

export const institutionService = new InstitutionService() 