import { api } from '../lib/api'
import type { ApiResponse, LessonPlan } from '../types'

export interface AiTopicSuggestion {
  title: string
  description?: string
  quarter: string
}

export const aiPlannerService = {
  async generateTopics(subjectId: string, quarter: string, count = 10): Promise<AiTopicSuggestion[]> {
    const res = await api.post<
      ApiResponse<{
        subject_id: string
        quarter: string
        topics: AiTopicSuggestion[]
      }>
    >(`/ai/subjects/${subjectId}/quarters/${quarter}/topics/generate`, { count })
    return res.data.data.topics
  },

  async generateLessonPlans(subjectId: string, quarter: string, overwrite = false): Promise<LessonPlan[]> {
    const res = await api.post<ApiResponse<LessonPlan[]>>(
      `/ai/subjects/${subjectId}/quarters/${quarter}/lesson-plans/generate`,
      { overwrite }
    )
    return res.data.data
  },

  async generateAssessments(
    subjectId: string,
    quarter: string,
    params: { subject_ecr_id?: string; overwrite?: boolean } = {}
  ): Promise<unknown[]> {
    const res = await api.post<ApiResponse<unknown[]>>(
      `/ai/subjects/${subjectId}/quarters/${quarter}/assessments/generate`,
      params
    )
    return res.data.data
  },
}

