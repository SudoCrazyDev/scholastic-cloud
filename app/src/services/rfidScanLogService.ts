import { api } from '../lib/api'
import type {
  RfidScanLog,
  CreateRfidScanLogData,
  RfidScanRequest,
  KioskScanRequest,
  KioskScanResponse,
  RfidScanLogPagination,
  ClassSectionDailyAttendanceRow,
  ClassSectionDailyAttendanceSummary,
} from '../types'

/** See the comment on `kioskScan`. */
const KIOSK_SCAN_TIMEOUT_MS = 15_000

class RfidScanLogService {
  private baseUrl = '/rfid-scan-logs'

  async getLogs(params: {
    institution_id: string
    student_id?: string
    search?: string
    date?: string
    date_from?: string
    date_to?: string
    datetime_from?: string
    datetime_to?: string
    type?: 'enter' | 'exit'
    page?: number
    per_page?: number
  }) {
    const queryParams = new URLSearchParams()
    queryParams.append('institution_id', params.institution_id)

    if (params.student_id) {
      queryParams.append('student_id', params.student_id)
    }
    if (params.search) {
      queryParams.append('search', params.search)
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
    if (params.datetime_from) {
      queryParams.append('datetime_from', params.datetime_from)
    }
    if (params.datetime_to) {
      queryParams.append('datetime_to', params.datetime_to)
    }
    if (params.type) {
      queryParams.append('type', params.type)
    }
    if (params.page) {
      queryParams.append('page', String(params.page))
    }
    if (params.per_page) {
      queryParams.append('per_page', String(params.per_page))
    }

    const response = await api.get<{
      success: boolean
      data: RfidScanLog[]
      pagination: RfidScanLogPagination
    }>(`${this.baseUrl}?${queryParams.toString()}`)
    return response.data
  }

  async getClassSectionDaily(params: {
    class_section_id: string
    date: string
    search?: string
  }) {
    const queryParams = new URLSearchParams()
    queryParams.append('class_section_id', params.class_section_id)
    queryParams.append('date', params.date)
    // Scans are stored in UTC; tell the API which wall-clock day the viewer means.
    queryParams.append('tz_offset', String(new Date(`${params.date}T00:00:00`).getTimezoneOffset()))
    if (params.search) {
      queryParams.append('search', params.search)
    }

    const response = await api.get<{
      success: boolean
      data: ClassSectionDailyAttendanceRow[]
      summary: ClassSectionDailyAttendanceSummary
    }>(`${this.baseUrl}/class-section-daily?${queryParams.toString()}`)
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
      data,
      // Bounded on purpose. The shared client sets no timeout, so a gate kiosk
      // on a dead link holds the tap's write open for however long the OS takes
      // to give up on the connection — a minute or more — and the failure card
      // then lands long after that student has walked off, in front of whoever
      // is standing there next. Fifteen seconds is far longer than a healthy
      // scan needs and short enough to stay in the same conversation.
      { timeout: KIOSK_SCAN_TIMEOUT_MS }
    )
    return response.data
  }
}

export const rfidScanLogService = new RfidScanLogService()
