import { api } from '../lib/api'
import type {
  ApiResponse,
  MatatagGrid,
  MatatagNarrativeWrite,
  MatatagNarratives,
  MatatagRatingWrite,
  MatatagReference,
  MatatagSectionAttendance,
  MatatagSectionStatus,
  MatatagStudentAttendance,
} from '../types'

/**
 * DepEd MATATAG Key Stage 1 progress reporting.
 *
 * Every call below is closed twice on the API — by the `matatag-grading`
 * feature, which the school either has or does not, and by the module
 * permission, which is the school's own decision about its staff. Hiding a tab
 * in the client is a courtesy; these will 403 regardless.
 */
class MatatagService {
  private query(params: Record<string, string | number | undefined | null>): string {
    const search = new URLSearchParams()

    // Empty strings would be sent as `?term=` and read as a filter for the
    // empty term, so only real values are appended.
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        search.append(key, String(value))
      }
    })

    const query = search.toString()
    return query ? `?${query}` : ''
  }

  /** Terms, descriptors and macro skills. Config, not queries. */
  async getReference() {
    const response = await api.get<ApiResponse<MatatagReference>>('/matatag/reference')
    return response.data.data
  }

  async getSections(params: { institution_id?: string; academic_year?: string } = {}) {
    const response = await api.get<ApiResponse<{ academic_year: string; sections: MatatagSectionStatus[] }>>(
      `/matatag/sections${this.query(params)}`
    )
    return response.data.data
  }

  async optIn(sectionId: string, params: { academic_year?: string; curriculum_version_id?: string } = {}) {
    const response = await api.post<ApiResponse<unknown>>(
      `/matatag/sections/${sectionId}/opt-in`,
      params
    )
    return response.data
  }

  async optOut(sectionId: string, params: { academic_year?: string } = {}) {
    const response = await api.delete<ApiResponse<unknown>>(
      `/matatag/sections/${sectionId}/opt-in${this.query(params)}`
    )
    return response.data
  }

  /**
   * One (learning area, term) block: its columns, its learners, and every
   * descriptor already in it.
   *
   * Deliberately unpaginated — area and term already bound it, and a paginated
   * grid cannot fill a column, which is how a teacher actually works.
   */
  async getGrid(params: {
    class_section_id: string
    term: number
    learning_area_id?: string
    academic_year?: string
  }) {
    const response = await api.get<ApiResponse<MatatagGrid>>(`/matatag/grid${this.query(params)}`)
    return response.data.data
  }

  /**
   * The only way a descriptor is ever written. There is no single-cell
   * endpoint: one code path means one set of guards, so a client changing one
   * cell posts a one-element array.
   */
  async saveRatings(params: {
    class_section_id: string
    term: number
    academic_year?: string
    ratings: MatatagRatingWrite[]
  }) {
    const response = await api.post<ApiResponse<{ written: number; cleared: number; saved_at: string }>>(
      '/matatag/grid/bulk-upsert',
      params
    )
    return response.data.data
  }

  async getNarratives(params: { class_section_id: string; term?: number; academic_year?: string }) {
    const response = await api.get<ApiResponse<MatatagNarratives>>(
      `/matatag/narratives${this.query(params)}`
    )
    return response.data.data
  }

  async saveNarratives(params: {
    class_section_id: string
    academic_year?: string
    narratives: MatatagNarrativeWrite[]
  }) {
    const response = await api.post<ApiResponse<{ written: number; cleared: number; saved_at: string }>>(
      '/matatag/narratives/bulk-upsert',
      params
    )
    return response.data.data
  }

  /** Derived from the school's own attendance records. Nothing writes it. */
  async getSectionAttendance(params: { class_section_id: string; academic_year?: string }) {
    const response = await api.get<ApiResponse<MatatagSectionAttendance>>(
      `/matatag/attendance${this.query(params)}`
    )
    return response.data.data
  }

  async getStudentAttendance(params: {
    class_section_id: string
    student_id: string
    academic_year?: string
  }) {
    const response = await api.get<ApiResponse<MatatagStudentAttendance>>(
      `/matatag/attendance${this.query(params)}`
    )
    return response.data.data
  }
}

export const matatagService = new MatatagService()
