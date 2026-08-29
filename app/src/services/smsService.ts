import { api } from '../lib/api'
import type { ApiResponse, GateSmsSetting, SmsGateway, SmsMessage, SmsSettings } from '../types'

export interface SmsMessageListMeta {
  current_page: number
  last_page: number
  per_page: number
  total: number
  /** Queued outbound rows for the whole institution — unaffected by the active filters. */
  queued_total: number
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

export interface SmsGatewayLogLine {
  seq: number
  ts: string
  level: 'debug' | 'info' | 'warn' | 'error'
  text: string
}

export interface SmsGatewayLogs {
  /** Changes when the agent restarts — a signal to clear and start over. */
  run_id: string | null
  lines: SmsGatewayLogLine[]
  updated_at: string | null
  agent_online: boolean
}

export interface GateSmsSettingsResponse {
  success: boolean
  data: GateSmsSetting[]
  meta: { variables: string[] }
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

  /**
   * Ask the kiosk to re-check its modem. The portal cannot reach a kiosk
   * directly, so this only queues the request; the agent picks it up on its
   * next poll (≈5s) and reports back. Poll the gateway list and wait for
   * `modem_checked_at` to move.
   */
  async refreshGatewayStatus(id: string) {
    const response = await api.post<ApiResponse<{ agent_online: boolean; checked_at: string | null }>>(
      `/sms/gateways/${id}/refresh-status`,
    )
    return response.data
  }

  /**
   * The kiosk agent's recent log lines. Polling this is also what keeps the
   * agent pushing, so call it on an interval while the viewer is open.
   */
  async getGatewayLogs(id: string, sinceSeq = 0) {
    const response = await api.get<ApiResponse<SmsGatewayLogs>>(
      `/sms/gateways/${id}/logs?since_seq=${sinceSeq}`,
    )
    return response.data
  }

  /** Download the installer bundle (.zip: agent source + pre-filled config) for this gateway. */
  async getInstaller(id: string) {
    const response = await api.get(`/sms/gateways/${id}/installer`, { responseType: 'blob' })
    return response.data as Blob
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

  /** Cancels every queued outbound message for the institution, ignoring list filters. */
  async cancelQueuedMessages() {
    const response = await api.post<ApiResponse<{ canceled: number }>>('/sms/messages/cancel-queued')
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

  // --- Gate (entrance/exit) notification settings ---

  /** Both gate rows, plus the template variables the server understands. */
  async getGateSettings() {
    const response = await api.get<GateSmsSettingsResponse>('/sms/gate-settings')
    return response.data
  }

  async updateGateSetting(
    gateType: 'enter' | 'exit',
    payload: Partial<
      Pick<
        GateSmsSetting,
        | 'is_enabled'
        | 'sms_gateway_id'
        | 'message_template'
        | 'cooldown_minutes'
        | 'late_threshold_minutes'
        | 'timezone'
      >
    >,
  ) {
    const response = await api.put<ApiResponse<GateSmsSetting>>(`/sms/gate-settings/${gateType}`, payload)
    return response.data
  }
}

export const smsService = new SmsService()
