import { api } from '../lib/api'
import type {
  Announcement,
  AnnouncementAttachment,
  AnnouncementFeedItem,
  ApiResponse,
  CreateAnnouncementData,
} from '../types'

class AnnouncementService {
  private baseUrl = '/announcements'

  /* ---- Authoring (teachers + admins) ---- */

  async getAnnouncements(params?: {
    search?: string
    category?: string
    status?: string
    publish_from?: string
    publish_to?: string
    expires_from?: string
    expires_to?: string
  }) {
    const query = new URLSearchParams()
    if (params?.search) query.append('search', params.search)
    if (params?.category && params.category !== 'all') query.append('category', params.category)
    if (params?.status && params.status !== 'all') query.append('status', params.status)
    if (params?.publish_from) query.append('publish_from', params.publish_from)
    if (params?.publish_to) query.append('publish_to', params.publish_to)
    if (params?.expires_from) query.append('expires_from', params.expires_from)
    if (params?.expires_to) query.append('expires_to', params.expires_to)
    const url = `${this.baseUrl}${query.toString() ? `?${query.toString()}` : ''}`
    const response = await api.get<ApiResponse<Announcement[]>>(url)
    return response.data
  }

  async createAnnouncement(payload: CreateAnnouncementData) {
    const response = await api.post<ApiResponse<Announcement>>(this.baseUrl, payload)
    return response.data
  }

  async updateAnnouncement(id: string, payload: CreateAnnouncementData) {
    const response = await api.put<ApiResponse<Announcement>>(`${this.baseUrl}/${id}`, payload)
    return response.data
  }

  async deleteAnnouncement(id: string) {
    const response = await api.delete<ApiResponse<null>>(`${this.baseUrl}/${id}`)
    return response.data
  }

  async uploadAttachment(id: string, file: File) {
    const formData = new FormData()
    formData.append('file', file)
    const response = await api.post<ApiResponse<AnnouncementAttachment>>(
      `${this.baseUrl}/${id}/attachments`,
      formData,
    )
    return response.data
  }

  async deleteAttachment(id: string, attachmentId: string) {
    const response = await api.delete<ApiResponse<null>>(
      `${this.baseUrl}/${id}/attachments/${attachmentId}`,
    )
    return response.data
  }

  /* ---- Viewer feed (students + staff) ---- */

  async getFeed() {
    const response = await api.get<ApiResponse<AnnouncementFeedItem[]>>(`${this.baseUrl}/feed`)
    return response.data
  }

  async getUnreadCount() {
    const response = await api.get<ApiResponse<{ count: number }>>(`${this.baseUrl}/unread-count`)
    return response.data
  }

  async markRead(id: string) {
    const response = await api.post<ApiResponse<null>>(`${this.baseUrl}/${id}/read`, {})
    return response.data
  }
}

export const announcementService = new AnnouncementService()
