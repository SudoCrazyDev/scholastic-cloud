import { api } from '../lib/api'
import type {
  ApiResponse,
  CalendarEventType,
  CreateStaffCalendarEventData,
  StaffCalendarEvent,
} from '../types'

class StaffCalendarService {
  private baseUrl = '/staff-calendar-events'

  async getEvents(params?: { from?: string; to?: string; type?: CalendarEventType }) {
    const query = new URLSearchParams()
    if (params?.from) query.append('from', params.from)
    if (params?.to) query.append('to', params.to)
    if (params?.type) query.append('type', params.type)
    const url = `${this.baseUrl}${query.toString() ? `?${query.toString()}` : ''}`
    const response = await api.get<ApiResponse<StaffCalendarEvent[]>>(url)
    return response.data
  }

  async createEvent(payload: CreateStaffCalendarEventData) {
    const response = await api.post<ApiResponse<StaffCalendarEvent>>(this.baseUrl, payload)
    return response.data
  }

  async updateEvent(id: string, payload: CreateStaffCalendarEventData) {
    const response = await api.put<ApiResponse<StaffCalendarEvent>>(`${this.baseUrl}/${id}`, payload)
    return response.data
  }

  async deleteEvent(id: string) {
    const response = await api.delete<ApiResponse<null>>(`${this.baseUrl}/${id}`)
    return response.data
  }
}

export const staffCalendarService = new StaffCalendarService()
