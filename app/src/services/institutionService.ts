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
    // Check if logo is a File object
    const hasFile = data.logo instanceof File
    
    if (hasFile) {
      // Create FormData for file upload
      const formData = new FormData()
      formData.append('title', data.title)
      formData.append('abbr', data.abbr)
      if (data.address) formData.append('address', data.address)
      if (data.division) formData.append('division', data.division)
      if (data.region) formData.append('region', data.region)
      if (data.gov_id) formData.append('gov_id', data.gov_id)
      if (data.logo instanceof File) {
        formData.append('logo', data.logo)
      }
      if (data.subscription_id) formData.append('subscription_id', data.subscription_id)
      
      const response = await api.post<{ data: Institution }>(this.baseUrl, formData)
      return response.data
    } else {
      // Regular JSON request - exclude logo if it's not a file
      const jsonData = { ...data }
      if (jsonData.logo && !(jsonData.logo instanceof File)) {
        delete jsonData.logo
      }
      const response = await api.post<{ data: Institution }>(this.baseUrl, jsonData)
      return response.data
    }
  }

  async updateInstitution(id: string, data: UpdateInstitutionData) {
    // Check if logo is a File object
    const hasFile = data.logo instanceof File
    
    if (hasFile) {
      // Create FormData for file upload
      const formData = new FormData()
      if (data.title) formData.append('title', data.title)
      if (data.abbr) formData.append('abbr', data.abbr)
      if (data.address) formData.append('address', data.address)
      if (data.division) formData.append('division', data.division)
      if (data.region) formData.append('region', data.region)
      if (data.gov_id) formData.append('gov_id', data.gov_id)
      if (data.logo instanceof File) {
        formData.append('logo', data.logo)
      }
      
      // Use POST endpoint specifically for file uploads (PUT/PATCH don't handle multipart/form-data correctly in Laravel)
      const response = await api.post<{ data: Institution }>(`${this.baseUrl}/${id}`, formData)
      return response.data
    } else {
      // Regular JSON request - exclude logo if it's not a file
      const jsonData = { ...data }
      if (jsonData.logo && !(jsonData.logo instanceof File)) {
        // If logo is a string URL, remove it to avoid sending URL strings
        delete jsonData.logo
      }
      const response = await api.put<{ data: Institution }>(`${this.baseUrl}/${id}`, jsonData)
      return response.data
    }
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