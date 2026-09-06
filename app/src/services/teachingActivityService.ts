import { api } from '../lib/api'
import type {
  ApiResponse,
  TeachingActivityAssessmentSubmissions,
  TeachingActivityFilters,
  TeachingActivityOverview,
  TeachingActivityTeacherDetail,
} from '../types'

/**
 * Teaching Activity — read-only oversight of teachers' lesson and assessment
 * output. There is no write side: the module carries no `manage` ability, and
 * anything that needs changing is changed on the screen that owns it.
 */
class TeachingActivityService {
  private query(filters: TeachingActivityFilters): string {
    const params = new URLSearchParams()

    // Empty strings would be sent as `?quarter=` and read as a filter for the
    // empty quarter, so only real values are appended.
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params.append(key, String(value))
      }
    })

    const query = params.toString()
    return query ? `?${query}` : ''
  }

  async getOverview(filters: TeachingActivityFilters = {}) {
    const response = await api.get<ApiResponse<TeachingActivityOverview>>(
      `/teaching-activity/overview${this.query(filters)}`
    )
    return response.data
  }

  async getTeacher(userId: string, filters: Pick<TeachingActivityFilters, 'academic_year' | 'quarter'> = {}) {
    const response = await api.get<ApiResponse<TeachingActivityTeacherDetail>>(
      `/teaching-activity/teachers/${userId}${this.query(filters)}`
    )
    return response.data
  }

  async getAssessmentSubmissions(itemId: string) {
    const response = await api.get<ApiResponse<TeachingActivityAssessmentSubmissions>>(
      `/teaching-activity/assessments/${itemId}/submissions`
    )
    return response.data
  }
}

export const teachingActivityService = new TeachingActivityService()
