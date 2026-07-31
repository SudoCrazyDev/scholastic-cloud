import { api } from '../lib/api'
import type { ApiResponse, MyTimesheet } from '../types'

class MyTimesheetService {
  /**
   * The signed-in staff member's own punches, day by day. Defaults to the
   * month so far; the API never returns a future date.
   */
  async get(params?: { from?: string; to?: string }) {
    const query = new URLSearchParams()
    if (params?.from) query.append('from', params.from)
    if (params?.to) query.append('to', params.to)
    const url = `/my-timesheet${query.toString() ? `?${query.toString()}` : ''}`
    const response = await api.get<ApiResponse<MyTimesheet>>(url)
    return response.data
  }
}

export const myTimesheetService = new MyTimesheetService()
