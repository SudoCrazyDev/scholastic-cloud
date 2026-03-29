import { api } from '../lib/api'
import type {
  ApiResponse,
  Subject,
  ClassSection,
  TimetableConflict,
  UpdateSubjectScheduleData,
} from '../types'

export interface SectionTimetableResponse {
  section: ClassSection
  subjects: Subject[]
}

class TimetableService {
  async getSectionTimetable(sectionId: string): Promise<ApiResponse<SectionTimetableResponse>> {
    const response = await api.get(`/timetable/section/${sectionId}`)
    return response.data
  }

  async getConflicts(): Promise<ApiResponse<TimetableConflict[]>> {
    const response = await api.get('/timetable/conflicts')
    return response.data
  }

  async updateSubjectSchedule(
    subjectId: string,
    data: UpdateSubjectScheduleData,
  ): Promise<ApiResponse<Subject>> {
    const response = await api.patch(`/timetable/subjects/${subjectId}/schedule`, data)
    return response.data
  }
}

export const timetableService = new TimetableService()
