import { api } from '../lib/api'
import type {
  ApiResponse,
  ApproveAttendanceRequestData,
  AttendanceRequestStatus,
  CreateAttendanceRequestData,
  StaffAttendanceRequest,
} from '../types'

class StaffAttendanceRequestService {
  private baseUrl = '/staff-attendance-requests'

  /**
   * Approvers get the whole institution unless scope is 'mine'; everyone else
   * only ever gets their own requests, whatever scope is asked for.
   */
  async list(params?: { status?: AttendanceRequestStatus; scope?: 'mine' | 'all'; from?: string; to?: string }) {
    const query = new URLSearchParams()
    if (params?.status) query.append('status', params.status)
    if (params?.scope) query.append('scope', params.scope)
    if (params?.from) query.append('from', params.from)
    if (params?.to) query.append('to', params.to)
    const url = `${this.baseUrl}${query.toString() ? `?${query.toString()}` : ''}`
    const response = await api.get<ApiResponse<StaffAttendanceRequest[]>>(url)
    return response.data
  }

  async create(data: CreateAttendanceRequestData) {
    const response = await api.post<ApiResponse<StaffAttendanceRequest>>(this.baseUrl, data)
    return response.data
  }

  async approve(id: string, data: ApproveAttendanceRequestData = {}) {
    const response = await api.post<ApiResponse<StaffAttendanceRequest>>(
      `${this.baseUrl}/${id}/approve`,
      data
    )
    return response.data
  }

  async disapprove(id: string, review_note: string) {
    const response = await api.post<ApiResponse<StaffAttendanceRequest>>(
      `${this.baseUrl}/${id}/disapprove`,
      { review_note }
    )
    return response.data
  }

  async cancel(id: string) {
    const response = await api.post<ApiResponse<StaffAttendanceRequest>>(`${this.baseUrl}/${id}/cancel`, {})
    return response.data
  }

  /**
   * Approver-only: take back an approval. The row stays on record but stops
   * counting towards pay, so the payroll period needs regenerating.
   */
  async void(id: string, void_note: string) {
    const response = await api.post<ApiResponse<StaffAttendanceRequest>>(
      `${this.baseUrl}/${id}/void`,
      { void_note }
    )
    return response.data
  }
}

export const staffAttendanceRequestService = new StaffAttendanceRequestService()
