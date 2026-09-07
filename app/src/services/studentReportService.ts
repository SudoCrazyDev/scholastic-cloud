import { api } from '../lib/api'
import type {
  StudentRosterGroupBy,
  StudentRosterResponse,
  StudentRosterSort,
  StudentStatisticsResponse,
} from '../types'

/**
 * The Students screen's Printing and Statistics tabs.
 *
 * Both read the same set of enrolments for one academic year — statistics
 * counts it, roster lists the names — so the Printing tab uses statistics for
 * its section/grade-level picker and only fetches the roster when printing.
 */
class StudentReportService {
  async getStatistics(academicYear?: string) {
    const queryParams = new URLSearchParams()
    if (academicYear) queryParams.append('academic_year', academicYear)

    const url = `/students/statistics${queryParams.toString() ? `?${queryParams.toString()}` : ''}`
    const response = await api.get<{ success: boolean; data: StudentStatisticsResponse }>(url)

    return response.data
  }

  async getRoster(params: {
    academic_year?: string
    group_by?: StudentRosterGroupBy
    sort?: StudentRosterSort
    /** Print only these sections; omit for every section in the year. */
    section_ids?: string[]
    /** Print only these grade levels; omit for every grade level in the year. */
    grade_levels?: string[]
  }) {
    const queryParams = new URLSearchParams()

    if (params.academic_year) queryParams.append('academic_year', params.academic_year)
    if (params.group_by) queryParams.append('group_by', params.group_by)
    if (params.sort) queryParams.append('sort', params.sort)
    params.section_ids?.forEach((id) => queryParams.append('section_ids[]', id))
    params.grade_levels?.forEach((level) => queryParams.append('grade_levels[]', level))

    const url = `/students/roster${queryParams.toString() ? `?${queryParams.toString()}` : ''}`
    const response = await api.get<{ success: boolean; data: StudentRosterResponse }>(url)

    return response.data
  }
}

export const studentReportService = new StudentReportService()
