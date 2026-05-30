import { api } from '../lib/api'
import type { ApiResponse, PaginatedResponse, BiometricDevice, ZkUserMapping } from '../types'

class BiometricService {
  // --- Devices ---

  async getDevices() {
    const response = await api.get<ApiResponse<BiometricDevice[]>>('/biometric/devices')
    return response.data
  }

  async getDevice(id: string) {
    const response = await api.get<ApiResponse<BiometricDevice>>(`/biometric/devices/${id}`)
    return response.data
  }

  async createDevice(name: string) {
    const response = await api.post<ApiResponse<BiometricDevice & { pairing_code: string }>>('/biometric/devices', { name })
    return response.data
  }

  async deleteDevice(id: string) {
    const response = await api.delete<ApiResponse<null>>(`/biometric/devices/${id}`)
    return response.data
  }

  async refreshPairingCode(id: string) {
    const response = await api.post<ApiResponse<{ pairing_code: string; expires_at: string }>>(`/biometric/devices/${id}/refresh-pairing-code`)
    return response.data
  }

  // --- ZK User Mappings ---

  async getZkUsers(params?: { device_id?: string; linked?: boolean; page?: number; per_page?: number }) {
    const query = new URLSearchParams()
    if (params?.device_id) query.append('device_id', params.device_id)
    if (params?.linked !== undefined) query.append('linked', params.linked ? '1' : '0')
    if (params?.page) query.append('page', String(params.page))
    if (params?.per_page) query.append('per_page', String(params.per_page))
    const url = `/biometric/zk-users${query.toString() ? `?${query}` : ''}`
    const response = await api.get<PaginatedResponse<ZkUserMapping>>(url)
    return response.data
  }

  async linkStaff(zkMappingId: string, userId: string) {
    const response = await api.post<ApiResponse<ZkUserMapping>>(`/biometric/zk-users/${zkMappingId}/link`, { user_id: userId })
    return response.data
  }

  async unlinkStaff(zkMappingId: string) {
    const response = await api.delete<ApiResponse<null>>(`/biometric/zk-users/${zkMappingId}/link`)
    return response.data
  }

  async deleteZkUser(zkMappingId: string) {
    const response = await api.delete<ApiResponse<null>>(`/biometric/zk-users/${zkMappingId}`)
    return response.data
  }

  async enrollToDevice(zkMappingId: string) {
    const response = await api.post<ApiResponse<ZkUserMapping>>(`/biometric/zk-users/${zkMappingId}/enroll`)
    return response.data
  }

  async triggerFingerprint(zkMappingId: string) {
    const response = await api.post<ApiResponse<null>>(`/biometric/zk-users/${zkMappingId}/trigger-fingerprint`)
    return response.data
  }

  async addStaffToDevice(deviceId: string, userId: string, zkUserId?: string) {
    const response = await api.post<ApiResponse<ZkUserMapping>>('/biometric/zk-users', {
      device_id: deviceId,
      user_id: userId,
      ...(zkUserId ? { zk_user_id: zkUserId } : {}),
    })
    return response.data
  }
}

export const biometricService = new BiometricService()
