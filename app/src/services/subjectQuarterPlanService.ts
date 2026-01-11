import { api } from '../lib/api'
import type { ApiResponse, SubjectQuarterPlan } from '../types'

export interface UpsertSubjectQuarterPlanInput {
  subject_id: string
  quarter: string // '1'..'4'
  start_date: string // YYYY-MM-DD
  exam_date: string // YYYY-MM-DD
  meeting_days?: string[]
  excluded_dates?: string[]
  quizzes_count?: number
  assignments_count?: number
  activities_count?: number
  projects_count?: number
}

export const subjectQuarterPlanService = {
  async getBySubjectAndQuarter(subjectId: string, quarter: string): Promise<SubjectQuarterPlan | null> {
    const res = await api.get<ApiResponse<SubjectQuarterPlan | null>>(
      '/subject-quarter-plans/by-subject-and-quarter',
      { params: { subject_id: subjectId, quarter } }
    )
    return res.data.data
  },

  async upsert(input: UpsertSubjectQuarterPlanInput): Promise<SubjectQuarterPlan> {
    const res = await api.put<ApiResponse<SubjectQuarterPlan>>('/subject-quarter-plans/by-subject-and-quarter', input)
    return res.data.data
  },
}

