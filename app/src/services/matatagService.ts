import { api } from '../lib/api'
import type {
  ApiResponse,
  MatatagGrid,
  MatatagNarrativeWrite,
  MatatagNarratives,
  MatatagProgressReport,
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

  /**
   * A section's report cards.
   *
   * Naming a `learning_area_id` also attaches that one PACE form for every
   * learner — the "print the class's Reading & Literacy forms" job. Without
   * one, the cards come back on their own: a whole section across all five
   * areas is ~600 pages and is not served by accident. The response says which
   * of the three it gave you in `pace.scope`.
   */
  async getSectionReport(params: {
    class_section_id: string
    learning_area_id?: string
    academic_year?: string
  }) {
    const response = await api.get<ApiResponse<MatatagProgressReport>>(
      `/matatag/progress-report${this.query(params)}`
    )
    return response.data.data
  }

  /** One learner's card and all of their PACE forms. */
  async getLearnerReport(
    studentId: string,
    params: { class_section_id: string; learning_area_id?: string; academic_year?: string }
  ) {
    const response = await api.get<ApiResponse<MatatagProgressReport>>(
      `/matatag/progress-report/${studentId}${this.query(params)}`
    )
    return response.data.data
  }

  /**
   * DepEd's own .xlsx for this section, filled in.
   *
   * The PDFs are what a parent is handed; this is what the division office
   * asks for. It is built server-side by filling DepEd's committed workbook,
   * so it carries their fills, formulas and print settings rather than our
   * rendering of them.
   *
   * `responseType: 'blob'` means an *error* arrives as a Blob as well, so a 422
   * saying the section is too big for DepEd's form, or a 503 naming a missing
   * PHP extension, would otherwise reach the teacher as a generic failure. The
   * body is decoded here, where its shape is known.
   */
  async getWorkbook(params: {
    class_section_id: string
    academic_year?: string
  }): Promise<Blob> {
    try {
      const response = await api.get(`/matatag/workbook${this.query(params)}`, {
        responseType: 'blob',
        // The server loads and rewrites a seventeen-sheet workbook; the
        // default timeout cuts it off part-way through a file that was
        // going to arrive.
        timeout: 120000,
      })
      return response.data as Blob
    } catch (error) {
      throw await this.decodeBlobError(error)
    }
  }

  /** Turn an errored blob response back into the message the API sent. */
  private async decodeBlobError(error: unknown): Promise<unknown> {
    const data = (error as { response?: { data?: unknown } })?.response?.data

    if (!(data instanceof Blob)) {
      return error
    }

    try {
      const parsed = JSON.parse(await data.text())
      if (typeof parsed?.message === 'string' && parsed.message !== '') {
        return new Error(parsed.message)
      }
    } catch {
      // A blob that is not JSON tells us nothing useful; fall through to the
      // original error so the caller's own fallback wording is used.
    }

    return error
  }
}

export const matatagService = new MatatagService()
