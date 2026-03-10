import { api } from '../lib/api'
import type { GradeLevel, CreateGradeLevelData, UpdateGradeLevelData } from '../types'

interface GradeLevelListResponse {
  success: boolean
  data: GradeLevel[]
}

interface GradeLevelResponse {
  success: boolean
  data: GradeLevel
  message?: string
}

class GradeLevelService {
  private baseUrl = '/grade-levels'

  async getGradeLevels(): Promise<GradeLevel[]> {
    const response = await api.get<GradeLevelListResponse>(this.baseUrl)
    return response.data.data
  }

  async createGradeLevel(data: CreateGradeLevelData): Promise<GradeLevel> {
    const response = await api.post<GradeLevelResponse>(this.baseUrl, data)
    return response.data.data
  }

  async updateGradeLevel(id: string, data: UpdateGradeLevelData): Promise<GradeLevel> {
    const response = await api.put<GradeLevelResponse>(`${this.baseUrl}/${id}`, data)
    return response.data.data
  }

  async deleteGradeLevel(id: string): Promise<void> {
    await api.delete(`${this.baseUrl}/${id}`)
  }
}

export const gradeLevelService = new GradeLevelService()
