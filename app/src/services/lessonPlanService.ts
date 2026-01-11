import { api } from '../lib/api'
import type { ApiResponse, LessonPlan } from '../types'

export const lessonPlanService = {
  async listBySubject(subjectId: string, quarter?: string): Promise<LessonPlan[]> {
    const res = await api.get<ApiResponse<LessonPlan[]>>('/lesson-plans', {
      params: { subject_id: subjectId, quarter },
    })
    return res.data.data
  },

  async update(id: string, data: Partial<Pick<LessonPlan, 'title' | 'content' | 'topic_id'>>): Promise<LessonPlan> {
    const res = await api.patch<ApiResponse<LessonPlan>>(`/lesson-plans/${id}`, data)
    return res.data.data
  },

  async remove(id: string): Promise<void> {
    await api.delete<ApiResponse<void>>(`/lesson-plans/${id}`)
  },
}

