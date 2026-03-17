import { api } from '../lib/api'
import type { Strand } from '../types'

class StrandService {
  async getStrands(params?: { track_id?: string }) {
    const queryParams = new URLSearchParams()
    if (params?.track_id) queryParams.append('track_id', params.track_id)
    const url = `/strands${queryParams.toString() ? `?${queryParams.toString()}` : ''}`
    const response = await api.get<{ success: boolean; data: Strand[] }>(url)
    return response.data
  }

  async createStrand(data: { track_id: string; title: string; slug?: string }) {
    const response = await api.post<{ success: boolean; data: Strand }>('/strands', data)
    return response.data
  }

  async updateStrand(id: string, data: { track_id?: string; title?: string; slug?: string }) {
    const response = await api.put<{ success: boolean; data: Strand }>(`/strands/${id}`, data)
    return response.data
  }

  async deleteStrand(id: string) {
    await api.delete(`/strands/${id}`)
  }
}

export const strandService = new StrandService()
