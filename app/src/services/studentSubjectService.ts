import { api } from '../lib/api'
import type { ApiResponse } from '../types'

export interface BulkAssignStudentSubjectsPayload {
  student_ids: string[]
  subject_id: string
}

class StudentSubjectService {
  async listBySubject(subjectId: string) {
    const response = await api.get<{ success: boolean; data: any[] }>(`/student-subjects`, {
      params: { subject_id: subjectId },
    })
    return response.data
  }

  async bulkAssign(payload: BulkAssignStudentSubjectsPayload) {
    const response = await api.post<{ success: boolean; message: string; data: any[] }>(
      `/student-subjects/bulk-assign`,
      payload,
    )
    return response.data
  }

  async deleteAssignment(assignmentId: string) {
    const response = await api.delete<ApiResponse<void>>(`/student-subjects/${assignmentId}`)
    return response.data
  }
}

export const studentSubjectService = new StudentSubjectService()