import { api } from '../lib/api'
import type { ApiResponse, DefaultDiscount, CreateDefaultDiscountData, UpdateDefaultDiscountData } from '../types'

class DefaultDiscountService {
  private baseUrl = '/default-discounts'

  async getDefaultDiscounts(params?: { search?: string; is_active?: boolean }) {
    const queryParams = new URLSearchParams()
    if (params?.search) queryParams.append('search', params.search)
    if (params?.is_active !== undefined) {
      queryParams.append('is_active', params.is_active ? '1' : '0')
    }

    const url = `${this.baseUrl}${queryParams.toString() ? `?${queryParams.toString()}` : ''}`
    const response = await api.get<ApiResponse<DefaultDiscount[]>>(url)
    return response.data
  }

  async getDefaultDiscount(id: string) {
    const response = await api.get<ApiResponse<DefaultDiscount>>(`${this.baseUrl}/${id}`)
    return response.data
  }

  async createDefaultDiscount(data: CreateDefaultDiscountData) {
    const response = await api.post<ApiResponse<DefaultDiscount>>(this.baseUrl, data)
    return response.data
  }

  async updateDefaultDiscount(id: string, data: UpdateDefaultDiscountData) {
    const response = await api.put<ApiResponse<DefaultDiscount>>(`${this.baseUrl}/${id}`, data)
    return response.data
  }

  async deleteDefaultDiscount(id: string) {
    await api.delete(`${this.baseUrl}/${id}`)
  }
}

export const defaultDiscountService = new DefaultDiscountService()
