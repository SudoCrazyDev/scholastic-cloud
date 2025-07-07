import { api } from '../lib/api'
import type { Institution, ApiResponse, CreateInstitutionData, UpdateInstitutionData } from '../types'

class InstitutionService {
  private baseUrl = '/institutions'

  async getInstitutions(params?: {
    page?: number
    limit?: number
    search?: string
    region?: string
    division?: string
  }) {
    const queryParams = new URLSearchParams()
    
    if (params?.page) queryParams.append('page', params.page.toString())
    if (params?.limit) queryParams.append('limit', params.limit.toString())
    if (params?.search) queryParams.append('search', params.search)
    if (params?.region) queryParams.append('region', params.region)
    if (params?.division) queryParams.append('division', params.division)

    const url = `${this.baseUrl}${queryParams.toString() ? `?${queryParams.toString()}` : ''}`
    const response = await api.get<ApiResponse<Institution[]>>(url)
    
    return response.data
  }

  async getInstitution(id: string) {
    const response = await api.get<ApiResponse<Institution>>(`${this.baseUrl}/${id}`)
    return response.data
  }

  async createInstitution(data: CreateInstitutionData) {
    const response = await api.post<ApiResponse<Institution>>(this.baseUrl, data)
    return response.data
  }

  async updateInstitution(id: string, data: UpdateInstitutionData) {
    const response = await api.put<ApiResponse<Institution>>(`${this.baseUrl}/${id}`, data)
    return response.data
  }

  async deleteInstitution(id: string) {
    await api.delete(`${this.baseUrl}/${id}`)
  }

  async assignSubscription(institutionId: string, subscriptionId: string, expirationDate: string, discount?: number) {
    const response = await api.post<ApiResponse<any>>(`${this.baseUrl}/${institutionId}/subscriptions`, {
      subscription_id: subscriptionId,
      expiration_date: expirationDate,
      discount: discount || 0
    })
    return response.data
  }
}

export const institutionService = new InstitutionService() 