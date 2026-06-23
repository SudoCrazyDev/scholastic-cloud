import { api } from '../lib/api'
import type {
  ApiResponse,
  AssignStaffScheduleData,
  AssignStaffScheduleResult,
  CreateStaffScheduleData,
  StaffSchedule,
  StaffScheduleAssignment,
} from '../types'

class StaffScheduleService {
  private baseUrl = '/staff-schedules'

  // --- Schedule templates ---

  async getSchedules(params?: { is_active?: boolean; search?: string }) {
    const query = new URLSearchParams()
    if (params?.is_active !== undefined) {
      query.append('is_active', String(params.is_active))
    }
    if (params?.search) {
      query.append('search', params.search)
    }
    const url = `${this.baseUrl}${query.toString() ? `?${query.toString()}` : ''}`
    const response = await api.get<ApiResponse<StaffSchedule[]>>(url)
    return response.data
  }

  async createSchedule(payload: CreateStaffScheduleData) {
    const response = await api.post<ApiResponse<StaffSchedule>>(this.baseUrl, payload)
    return response.data
  }

  async updateSchedule(id: string, payload: CreateStaffScheduleData) {
    const response = await api.put<ApiResponse<StaffSchedule>>(`${this.baseUrl}/${id}`, payload)
    return response.data
  }

  async deleteSchedule(id: string) {
    const response = await api.delete<ApiResponse<null>>(`${this.baseUrl}/${id}`)
    return response.data
  }

  // --- Assignments ---

  async getAssignments(params?: { staff_schedule_id?: string }) {
    const query = new URLSearchParams()
    if (params?.staff_schedule_id) {
      query.append('staff_schedule_id', params.staff_schedule_id)
    }
    const url = `/staff-schedule-assignments${query.toString() ? `?${query.toString()}` : ''}`
    const response = await api.get<ApiResponse<StaffScheduleAssignment[]>>(url)
    return response.data
  }

  async assign(scheduleId: string, payload: AssignStaffScheduleData) {
    const response = await api.post<ApiResponse<AssignStaffScheduleResult>>(
      `${this.baseUrl}/${scheduleId}/assign`,
      payload
    )
    return response.data
  }

  async unassign(assignmentId: string) {
    const response = await api.delete<ApiResponse<null>>(
      `/staff-schedule-assignments/${assignmentId}`
    )
    return response.data
  }
}

export const staffScheduleService = new StaffScheduleService()
