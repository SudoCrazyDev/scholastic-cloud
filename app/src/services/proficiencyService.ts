import { api } from '../lib/api'

export interface ProficiencyRow {
  grade_level: string
  subject_title: string
  total_students: number
  passed_count: number
  passing_percentage: number
  average_grade: number | null
  q1_total: number
  q1_passed: number
  q1_passing_percentage: number
  q2_total: number
  q2_passed: number
  q2_passing_percentage: number
  q3_total: number
  q3_passed: number
  q3_passing_percentage: number
  q4_total: number
  q4_passed: number
  q4_passing_percentage: number
}

export interface ProficiencyBySectionRow {
  section_id: string
  section_title: string
  grade_level: string
  subject_title: string
  total_students: number
  passed_count: number
  passing_percentage: number
  average_grade: number | null
  passed_female: number
  passed_male: number
  passed_other: number
  q1_total: number
  q1_passed: number
  q1_passing_percentage: number
  q2_total: number
  q2_passed: number
  q2_passing_percentage: number
  q3_total: number
  q3_passed: number
  q3_passing_percentage: number
  q4_total: number
  q4_passed: number
  q4_passing_percentage: number
}

export interface ProficiencyResponse {
  success: boolean
  data: ProficiencyRow[]
}

export interface ProficiencyBySectionResponse {
  success: boolean
  data: ProficiencyBySectionRow[]
}

class ProficiencyService {
  private baseUrl = '/proficiency'

  async getProficiency(params: {
    academic_year: string
    institution_id?: string
    grade_level?: string
  }): Promise<ProficiencyResponse> {
    const queryParams = new URLSearchParams()
    queryParams.append('academic_year', params.academic_year)
    if (params.institution_id) queryParams.append('institution_id', params.institution_id)
    if (params.grade_level) queryParams.append('grade_level', params.grade_level)

    const response = await api.get<ProficiencyResponse>(`${this.baseUrl}?${queryParams.toString()}`)
    return response.data
  }

  async getProficiencyBySection(params: {
    academic_year: string
    institution_id?: string
    grade_level?: string
    section_id?: string
  }): Promise<ProficiencyBySectionResponse> {
    const queryParams = new URLSearchParams()
    queryParams.append('academic_year', params.academic_year)
    if (params.institution_id) queryParams.append('institution_id', params.institution_id)
    if (params.grade_level) queryParams.append('grade_level', params.grade_level)
    if (params.section_id) queryParams.append('section_id', params.section_id)

    const response = await api.get<ProficiencyBySectionResponse>(
      `${this.baseUrl}/by-section?${queryParams.toString()}`
    )
    return response.data
  }
}

export const proficiencyService = new ProficiencyService()
