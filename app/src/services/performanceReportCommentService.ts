import { api } from '../lib/api'

/** `"<student_id>:<quarter>"` — flat, because a card is looked up by both at once. */
export type AdviserCommentKey = string

export interface AdviserComment {
  comment: string
  updated_at: string | null
  /** Null once the staff member who wrote it has left the school. */
  recorded_by: string | null
}

export interface AdviserCommentsResponse {
  academic_year: string
  /** The server's cap, read rather than duplicated — see the controller. */
  max_length: number
  comments: Record<AdviserCommentKey, AdviserComment>
  can_manage: boolean
}

export interface AdviserCommentWrite {
  student_id: string
  quarter: string
  /** Empty or whitespace deletes the row rather than storing a blank. */
  comment: string
}

const API_URL = '/performance-report/comments'

/**
 * The adviser's comment to a parent, per term, for DepEd's Annex G.
 *
 * The whole section loads at once rather than a learner at a time: before a card
 * run an adviser wants to see who is still missing one, and fifty requests to
 * answer that is the wrong shape.
 */
export const performanceReportCommentService = {
  list: (params: { class_section_id: string; academic_year?: string }) =>
    api
      .get(API_URL, { params })
      .then((res) => res.data?.data as AdviserCommentsResponse),

  bulkUpsert: (data: {
    class_section_id: string
    academic_year?: string
    comments: AdviserCommentWrite[]
  }) => api.post(API_URL, data).then((res) => res.data?.data),
}
