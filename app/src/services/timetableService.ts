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

export interface TeacherSubjectSlot {
  id: string
  title: string
  section: string | null
  grade_level: string | null
  start_time: string
  end_time: string
  meeting_days: string[]
}

export type TeacherTimetableData = Record<string, TeacherSubjectSlot[]>

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

  async getTeachersTimetable(teacherIds: string[], academicYear?: string): Promise<ApiResponse<TeacherTimetableData>> {
    const params = new URLSearchParams()
    teacherIds.forEach(id => params.append('ids[]', id))
    if (academicYear) params.set('academic_year', academicYear)
    const response = await api.get(`/timetable/teachers?${params.toString()}`)
    return response.data
  }
}

export const timetableService = new TimetableService()
