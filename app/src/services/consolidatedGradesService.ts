import { api } from '../lib/api'

export interface ConsolidatedGradesResponse {
  success: boolean
  data: {
    section: {
      id: string
      title: string
      grade_level: string
      academic_year: string
    }
    quarter: number
    students: Array<{
      student_id: string
      student_name: string
      lrn: string
      subjects: Array<{
        subject_id: string
        subject_title: string
        subject_variant: string
        grade: number | string | null
        final_grade: number | string | null
        calculated_grade: number | string | null
      }>
    }>
  }
}

class ConsolidatedGradesService {
  private baseUrl = '/section-consolidated-grades'

  async getSectionConsolidatedGrades(sectionId: string, quarter: number) {
    const queryParams = new URLSearchParams()
    queryParams.append('section_id', sectionId)
    queryParams.append('quarter', quarter.toString())

    const url = `${this.baseUrl}?${queryParams.toString()}`
    const response = await api.get<ConsolidatedGradesResponse>(url)
    
    return response.data
  }
}

export const consolidatedGradesService = new ConsolidatedGradesService() 