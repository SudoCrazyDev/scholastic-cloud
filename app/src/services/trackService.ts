import { api } from '../lib/api'
import type { Track } from '../types'

class TrackService {
  async getTracks() {
    const response = await api.get<{ success: boolean; data: Track[] }>('/tracks')
    return response.data
  }

  async createTrack(data: { title: string; slug?: string }) {
    const response = await api.post<{ success: boolean; data: Track }>('/tracks', data)
    return response.data
  }

  async updateTrack(id: string, data: { title?: string; slug?: string }) {
    const response = await api.put<{ success: boolean; data: Track }>(`/tracks/${id}`, data)
    return response.data
  }

  async deleteTrack(id: string) {
    await api.delete(`/tracks/${id}`)
  }
}

export const trackService = new TrackService()
