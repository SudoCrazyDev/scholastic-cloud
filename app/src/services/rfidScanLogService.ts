import { api } from '../lib/api'
import type { RfidScanLog, CreateRfidScanLogData, RfidScanRequest, KioskScanRequest, KioskScanResponse } from '../types'

class RfidScanLogService {
  private baseUrl = '/rfid-scan-logs'

  async getLogs(params: {
    institution_id: string
    student_id?: string
    date?: string
    date_from?: string
    date_to?: string
    type?: 'enter' | 'exit'
  }) {
    const queryParams = new URLSearchParams()
    queryParams.append('institution_id', params.institution_id)

    if (params.student_id) {
      queryParams.append('student_id', params.student_id)
    }
    if (params.date) {
      queryParams.append('date', params.date)
    }
    if (params.date_from) {
      queryParams.append('date_from', params.date_from)
    }
    if (params.date_to) {
      queryParams.append('date_to', params.date_to)
    }
    if (params.type) {
      queryParams.append('type', params.type)
    }

    const response = await api.get<{ success: boolean; data: RfidScanLog[] }>(
      `${this.baseUrl}?${queryParams.toString()}`
    )
    return response.data
  }

  async getLog(id: string) {
    const response = await api.get<{ success: boolean; data: RfidScanLog }>(`${this.baseUrl}/${id}`)
    return response.data
  }

  async scan(data: RfidScanRequest) {
    const response = await api.post<{ success: boolean; message: string; data: RfidScanLog }>(
      `${this.baseUrl}/scan`,
      data
    )
    return response.data
  }

  async createLog(data: CreateRfidScanLogData) {
    const response = await api.post<{ success: boolean; message: string; data: RfidScanLog }>(this.baseUrl, data)
    return response.data
  }

  async deleteLog(id: string) {
    const response = await api.delete<{ success: boolean; message: string }>(`${this.baseUrl}/${id}`)
    return response.data
  }

  async kioskScan(data: KioskScanRequest) {
    const response = await api.post<{ success: boolean; message: string; data: KioskScanResponse }>(
      '/kiosk/scan',
      data
    )
    return response.data
  }
}

export const rfidScanLogService = new RfidScanLogService()
