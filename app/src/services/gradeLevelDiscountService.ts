import { api } from '../lib/api'
import type { ApiResponse, GradeLevelDiscount, CreateGradeLevelDiscountData } from '../types'

class GradeLevelDiscountService {
  private baseUrl = '/grade-level-discounts'

  async getDiscounts(params: { academic_year?: string; grade_level?: string }) {
    const queryParams = new URLSearchParams()
    if (params.academic_year) queryParams.append('academic_year', params.academic_year)
    if (params.grade_level) queryParams.append('grade_level', params.grade_level)
    const url = `${this.baseUrl}?${queryParams.toString()}`
    const response = await api.get<ApiResponse<GradeLevelDiscount[]>>(url)
    return response.data
  }

  async createDiscount(data: CreateGradeLevelDiscountData) {
    const response = await api.post<ApiResponse<GradeLevelDiscount>>(this.baseUrl, data)
    return response.data
  }

  async updateDiscount(id: string, data: Partial<CreateGradeLevelDiscountData>) {
    const response = await api.put<ApiResponse<GradeLevelDiscount>>(`${this.baseUrl}/${id}`, data)
    return response.data
  }

  async deleteDiscount(id: string) {
    await api.delete(`${this.baseUrl}/${id}`)
  }
}

export const gradeLevelDiscountService = new GradeLevelDiscountService()
