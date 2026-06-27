import { api } from '../lib/api'
import type { GradingScale, CreateGradingScaleData, UpdateGradingScaleData } from '../types'

interface GradingScaleListResponse {
  success: boolean
  data: GradingScale[]
}

interface GradingScaleResponse {
  success: boolean
  data: GradingScale
  message?: string
}

class GradingScaleService {
  private baseUrl = '/grading-scales'

  async getGradingScales(): Promise<GradingScale[]> {
    const response = await api.get<GradingScaleListResponse>(this.baseUrl)
    return response.data.data
  }

  async createGradingScale(data: CreateGradingScaleData): Promise<GradingScale> {
    const response = await api.post<GradingScaleResponse>(this.baseUrl, data)
    return response.data.data
  }

  async updateGradingScale(id: string, data: UpdateGradingScaleData): Promise<GradingScale> {
    const response = await api.put<GradingScaleResponse>(`${this.baseUrl}/${id}`, data)
    return response.data.data
  }

  async deleteGradingScale(id: string): Promise<void> {
    await api.delete(`${this.baseUrl}/${id}`)
  }
}

export const gradingScaleService = new GradingScaleService()
