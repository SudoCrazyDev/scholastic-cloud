import { api } from '../lib/api'
import type { ReportCardLayout, ReportCardTemplate, ReportCardTemplatePayload } from '../types'

export interface ReportCardTemplateList {
  templates: ReportCardTemplate[]
  layouts: { value: ReportCardLayout; label: string }[]
  /** The platform's grade levels plus every spelling this school's sections use. */
  gradeLevels: string[]
}

/**
 * A school's own report card designs and the grade levels they are assigned to.
 * The caller's institution is resolved server-side, so no id is passed.
 */
class ReportCardTemplateService {
  private baseUrl = '/report-card-templates'

  async list(): Promise<ReportCardTemplateList> {
    const response = await api.get<{
      success: boolean
      data: ReportCardTemplate[]
      layouts: ReportCardTemplateList['layouts']
      grade_levels?: string[]
    }>(this.baseUrl)
    return {
      templates: response.data.data,
      layouts: response.data.layouts,
      gradeLevels: response.data.grade_levels ?? [],
    }
  }

  /** The template this grade level prints, or null for the standard card. */
  async forGradeLevel(gradeLevel: string): Promise<ReportCardTemplate | null> {
    const response = await api.get<{ success: boolean; data: ReportCardTemplate | null }>(
      `${this.baseUrl}/for-grade-level`,
      { params: { grade_level: gradeLevel } }
    )
    return response.data.data
  }

  async create(payload: ReportCardTemplatePayload) {
    const response = await api.post<{ success: boolean; message: string; data: ReportCardTemplate }>(
      this.baseUrl,
      payload
    )
    return response.data
  }

  async update(id: string, payload: Partial<ReportCardTemplatePayload>) {
    const response = await api.put<{ success: boolean; message: string; data: ReportCardTemplate }>(
      `${this.baseUrl}/${id}`,
      payload
    )
    return response.data
  }

  async delete(id: string) {
    const response = await api.delete<{ success: boolean; message: string }>(`${this.baseUrl}/${id}`)
    return response.data
  }
}

export const reportCardTemplateService = new ReportCardTemplateService()
