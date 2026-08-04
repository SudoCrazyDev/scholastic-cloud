import { api } from '../lib/api'

export interface StudentPortalAccessSettings {
  student_portal_enabled: boolean
  student_portal_disabled_message: string | null
  default_disabled_message: string
}

/**
 * The institution-wide switch that temporarily closes the student portal.
 * Resolves the caller's own institution server-side (no id needed).
 */
class StudentPortalAccessService {
  async getSettings() {
    const response = await api.get<{ success: boolean; data: StudentPortalAccessSettings }>(
      '/student-portal-access'
    )
    return response.data.data
  }

  async updateSettings(payload: {
    student_portal_enabled: boolean
    student_portal_disabled_message?: string | null
  }) {
    const response = await api.put<{
      success: boolean
      message: string
      data: StudentPortalAccessSettings & { students_signed_out: number }
    }>('/student-portal-access', payload)
    return response.data
  }
}

export const studentPortalAccessService = new StudentPortalAccessService()
