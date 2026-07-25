import { api } from '../lib/api'
import type { ApiResponse, SmsGateway, SmsMessage, SmsSettings } from '../types'

export interface SmsMessageListMeta {
  current_page: number
  last_page: number
  per_page: number
  total: number
}

export interface SmsMessageListResponse {
  success: boolean
  data: SmsMessage[]
  meta: SmsMessageListMeta
}

export interface SmsMessageFilters {
  direction?: 'outbound' | 'inbound'
  status?: string
  gateway_id?: string
  search?: string
  from?: string
  to?: string
  per_page?: number
  page?: number
}

class SmsService {
  // --- Gateways ---

  async getGateways() {
    const response = await api.get<ApiResponse<SmsGateway[]>>('/sms/gateways')
    return response.data
  }

  async getGateway(id: string) {
    const response = await api.get<ApiResponse<SmsGateway>>(`/sms/gateways/${id}`)
    return response.data
  }

  async createGateway(name: string, location?: string) {
    const response = await api.post<ApiResponse<SmsGateway & { pairing_code?: string }>>('/sms/gateways', {
      name,
      ...(location ? { location } : {}),
    })
    return response.data
  }

  async updateGateway(id: string, payload: { name?: string; location?: string | null }) {
    const response = await api.patch<ApiResponse<SmsGateway>>(`/sms/gateways/${id}`, payload)
    return response.data
  }

  async deleteGateway(id: string) {
    const response = await api.delete<ApiResponse<null>>(`/sms/gateways/${id}`)
    return response.data
  }

  async refreshPairingCode(id: string) {
    const response = await api.post<ApiResponse<{ pairing_code: string; expires_at: string }>>(
      `/sms/gateways/${id}/refresh-pairing-code`,
    )
    return response.data
  }

  /** Fetch the pre-filled agent config (.env text) for this gateway. */
  async getInstallerConfig(id: string) {
    const response = await api.get(`/sms/gateways/${id}/installer`, { responseType: 'text' })
    return response.data as string
  }

  // --- Messages ---

  async getMessages(filters: SmsMessageFilters = {}) {
    const query = new URLSearchParams()
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        query.append(key, String(value))
      }
    })
    const url = `/sms/messages${query.toString() ? `?${query}` : ''}`
    const response = await api.get<SmsMessageListResponse>(url)
    return response.data
  }

  async getMessage(id: string) {
    const response = await api.get<ApiResponse<SmsMessage>>(`/sms/messages/${id}`)
    return response.data
  }

  async queueMessage(payload: {
    numbers: string[]
    body: string
    gateway_id?: string
    scheduled_at?: string
  }) {
    const response = await api.post<ApiResponse<{ queued: number; ids: string[] }>>('/sms/messages', payload)
    return response.data
  }

  async retryMessage(id: string) {
    const response = await api.post<ApiResponse<SmsMessage>>(`/sms/messages/${id}/retry`)
    return response.data
  }

  async cancelMessage(id: string) {
    const response = await api.post<ApiResponse<SmsMessage>>(`/sms/messages/${id}/cancel`)
    return response.data
  }

  // --- Settings ---

  async getSettings() {
    const response = await api.get<ApiResponse<SmsSettings>>('/sms/settings')
    return response.data
  }

  async updateSettings(payload: Partial<Omit<SmsSettings, 'id' | 'institution_id' | 'created_at' | 'updated_at'>>) {
    const response = await api.put<ApiResponse<SmsSettings>>('/sms/settings', payload)
    return response.data
  }
}

export const smsService = new SmsService()
