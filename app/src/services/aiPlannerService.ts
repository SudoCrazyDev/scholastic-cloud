import { api } from '../lib/api'
import type { ApiResponse, LessonPlan } from '../types'

export interface AiTopicSuggestion {
  title: string
  description?: string
  quarter: string
}

export interface GenerationTask {
  id: string
  type: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  total_items: number | null
  processed_items: number
  progress_percentage: number
  result: any
  error_message: string | null
  created_at: string
  updated_at: string
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

  async generateLessonPlans(subjectId: string, quarter: string, overwrite = false): Promise<{ task_id: string }> {
    const res = await api.post<ApiResponse<never> & { task_id: string }>(
      `/ai/subjects/${subjectId}/quarters/${quarter}/lesson-plans/generate`,
      { overwrite }
    )
    return { task_id: res.data.task_id }
  },

  async checkGenerationStatus(taskId: string): Promise<GenerationTask> {
    const res = await api.get<ApiResponse<never> & { task: GenerationTask }>(
      `/ai/generation-tasks/${taskId}/status`
    )
    return res.data.task
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

