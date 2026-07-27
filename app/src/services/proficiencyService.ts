import { api } from '../lib/api'
import type { GradingPeriodConfig } from '../types'

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

/**
 * Passing-percentage keys are fixed q1..q4 on the wire. A term-based year simply
 * leaves q4 at zero; how many periods to render comes from `grading_periods`.
 */
export type PeriodPassingKey =
  | 'q1_passing_percentage'
  | 'q2_passing_percentage'
  | 'q3_passing_percentage'
  | 'q4_passing_percentage'

/** Passing percentage for a grading period ordinal ('1'..'4'). */
export const periodPassingPercentage = (
  row: ProficiencyRow | ProficiencyBySectionRow,
  period: string
): number => row[`q${period}_passing_percentage` as PeriodPassingKey] ?? 0

export interface ProficiencyResponse {
  success: boolean
  data: ProficiencyRow[]
  /** Quarters vs terms for the requested academic year. */
  grading_periods?: GradingPeriodConfig
}

export interface ProficiencyBySectionResponse {
  success: boolean
  data: ProficiencyBySectionRow[]
  /** Quarters vs terms for the requested academic year. */
  grading_periods?: GradingPeriodConfig
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
