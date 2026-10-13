import { api } from '../lib/api'
import type {
  ClassSection,
  Institution,
  MatatagProgressReport,
  ReportCardTemplate,
  SchoolDay,
  Student,
  StudentAttendance,
  Subject,
} from '../types'
import type { StudentRunningGrade } from './studentRunningGradeService'

/**
 * Which card a publication releases, matching the staff tab it is published from:
 * the Report Cards tab, the DepEd Performance Report tab, or MATATAG Progress.
 */
export type ReportCardType = 'report-card' | 'performance-report' | 'matatag'

export interface ReportCardPublicationState {
  published_at: string | null
  /** Null once the staff member who published it has left the school. */
  published_by: string | null
}

export interface ReportCardPublicationsResponse {
  academic_year: string
  card_type: ReportCardType
  /** Keyed by student id; a learner missing from it is unpublished. */
  published: Record<string, ReportCardPublicationState>
  can_publish: boolean
}

/** One card in the student portal's list. */
export interface MyReportCardSummary {
  id: string
  card_type: ReportCardType
  academic_year: string
  published_at: string | null
  class_section: { id: string; title: string; grade_level: string | null } | null
}

/** What `useStudentReportCard` fetches for the numeric cards, composed by the API. */
export interface ReportCardBundle {
  student: Student
  institution: Institution
  class_section: ClassSection
  subjects: Subject[]
  grades: StudentRunningGrade[]
  core_value_markings: Record<string, unknown>[]
  attendances: StudentAttendance[]
  school_days: SchoolDay[]
}

export interface MyReportCard {
  id: string
  card_type: ReportCardType
  academic_year: string
  template: ReportCardTemplate | null
  /** The numeric cards and the Performance Report. */
  principal_name?: string
  card?: ReportCardBundle
  /** The Performance Report's adviser comments, keyed by period ordinal. */
  comments?: Record<string, string>
  /** The MATATAG progress report, for this one learner. */
  report?: MatatagProgressReport
}

/**
 * Publishing report cards to the student portal, and reading them back there.
 *
 * Staff publish a learner's card from the tab that prints it; the student sees
 * only what has been published, through `my/report-cards`.
 */
export const reportCardPublicationService = {
  list: (params: { class_section_id: string; card_type: ReportCardType }) =>
    api
      .get('/report-card-publications', { params })
      .then((res) => res.data?.data as ReportCardPublicationsResponse),

  update: (data: {
    class_section_id: string
    card_type: ReportCardType
    student_ids: string[]
    published: boolean
  }) =>
    api
      .put('/report-card-publications', data)
      .then((res) => res.data?.data as { changed: number; skipped: number }),

  myCards: () =>
    api.get('/my/report-cards').then((res) => (res.data?.data ?? []) as MyReportCardSummary[]),

  myCard: (id: string) =>
    api.get(`/my/report-cards/${id}`).then((res) => res.data?.data as MyReportCard),
}
