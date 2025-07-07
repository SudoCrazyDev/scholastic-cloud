import { api } from '../lib/api'
import type { Subscription, ApiResponse, CreateSubscriptionData, UpdateSubscriptionData } from '../types'

class SubscriptionService {
  private baseUrl = '/subscriptions'

  async getSubscriptions(params?: {
    page?: number
    limit?: number
    search?: string
  }) {
    const queryParams = new URLSearchParams()
    
    if (params?.page) queryParams.append('page', params.page.toString())
    if (params?.limit) queryParams.append('limit', params.limit.toString())
    if (params?.search) queryParams.append('search', params.search)

    const url = `${this.baseUrl}${queryParams.toString() ? `?${queryParams.toString()}` : ''}`
    const response = await api.get<ApiResponse<Subscription[]>>(url)
    
    return response.data
  }

  async getSubscription(id: string) {
    const response = await api.get<ApiResponse<Subscription>>(`${this.baseUrl}/${id}`)
    return response.data
  }

  async createSubscription(data: CreateSubscriptionData) {
    const response = await api.post<ApiResponse<Subscription>>(this.baseUrl, data)
    return response.data
  }

  async updateSubscription(id: string, data: UpdateSubscriptionData) {
    const response = await api.put<ApiResponse<Subscription>>(`${this.baseUrl}/${id}`, data)
    return response.data
  }

  async deleteSubscription(id: string) {
    await api.delete(`${this.baseUrl}/${id}`)
  }
}

export const subscriptionService = new SubscriptionService() 