import { api } from '../lib/api'
import type { ApiResponse, GateDevice } from '../types'

export interface GateDevicePairingCode {
  success: boolean
  pairing_code: string
  expires_at: string
  message?: string
}

/**
 * Admin-side management of paired gate kiosks. The kiosk's own calls (`/gate/pair`,
 * `/gate/heartbeat`) deliberately do not go through here — they carry a device
 * token rather than the signed-in user's, so they cannot share this axios client.
 */
class GateDeviceService {
  private baseUrl = '/gate/devices'

  async getDevices(gateType?: 'enter' | 'exit' | 'both') {
    const query = gateType ? `?gate_type=${gateType}` : ''
    const response = await api.get<ApiResponse<GateDevice[]>>(`${this.baseUrl}${query}`)
    return response.data
  }

  async getDevice(id: string) {
    const response = await api.get<ApiResponse<GateDevice>>(`${this.baseUrl}/${id}`)
    return response.data
  }

  /**
   * Register a kiosk. The pairing code comes back on this response and nowhere
   * else — show it to the admin before they navigate away, or they will have to
   * mint a new one.
   */
  async createDevice(payload: {
    name: string
    gate_type: 'enter' | 'exit' | 'both'
    location?: string | null
  }) {
    const response = await api.post<ApiResponse<GateDevice & { pairing_code: string }>>(
      this.baseUrl,
      payload,
    )
    return response.data
  }

  async updateDevice(
    id: string,
    payload: { name?: string; location?: string | null; gate_type?: 'enter' | 'exit' | 'both' },
  ) {
    const response = await api.patch<ApiResponse<GateDevice>>(`${this.baseUrl}/${id}`, payload)
    return response.data
  }

  async deleteDevice(id: string) {
    const response = await api.delete<ApiResponse<null>>(`${this.baseUrl}/${id}`)
    return response.data
  }

  /** Only valid while the device is still unpaired. */
  async refreshPairingCode(id: string) {
    const response = await api.post<GateDevicePairingCode>(`${this.baseUrl}/${id}/refresh-pairing-code`)
    return response.data
  }

  /**
   * Revoke a paired kiosk's token and hand it a fresh code. The device fails its
   * next call with a 401, which is what makes it drop its local roster — so this
   * is also how a lost or stolen kiosk is cut off.
   */
  async unpairDevice(id: string) {
    const response = await api.post<GateDevicePairingCode>(`${this.baseUrl}/${id}/unpair`)
    return response.data
  }
}

export const gateDeviceService = new GateDeviceService()
