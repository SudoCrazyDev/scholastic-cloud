import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import toast from 'react-hot-toast'

import {
  performanceReportCommentService,
  type AdviserCommentWrite,
} from '../services/performanceReportCommentService'

/** The API's own message where there is one, otherwise the caller's fallback. */
function messageFrom(error: unknown, fallback: string): string {
  if (isAxiosError(error)) {
    const message = error.response?.data?.message
    if (typeof message === 'string' && message !== '') return message
  }

  return fallback
}

const commentsKey = (sectionId: string, academicYear?: string) =>
  ['performance-report', 'comments', sectionId, academicYear ?? ''] as const

/**
 * Every adviser comment on a section for a year.
 *
 * `staleTime: 0`, unlike most reads in this app: an adviser and a department
 * head can be writing on the same section at once, and a card is printed
 * straight after it is written. Stale prose here would be printed, handed to a
 * parent, and only then noticed.
 */
export function usePerformanceReportComments(params: {
  sectionId: string
  academicYear?: string
  enabled?: boolean
}) {
  return useQuery({
    queryKey: commentsKey(params.sectionId, params.academicYear),
    queryFn: () =>
      performanceReportCommentService.list({
        class_section_id: params.sectionId,
        academic_year: params.academicYear,
      }),
    enabled: params.enabled !== false && Boolean(params.sectionId),
    staleTime: 0,
    refetchOnWindowFocus: false,
    // The tab is behind a feature and a permission, and a school without either
    // gets a 403 no amount of retrying will change — three attempts just delay
    // the empty state.
    retry: false,
  })
}

export function usePerformanceReportCommentMutations(params: {
  sectionId: string
  academicYear?: string
}) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (comments: AdviserCommentWrite[]) =>
      performanceReportCommentService.bulkUpsert({
        class_section_id: params.sectionId,
        academic_year: params.academicYear,
        comments,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: commentsKey(params.sectionId, params.academicYear) })
    },
    onError: (error) => {
      toast.error(messageFrom(error, 'Could not save this comment.'))
    },
  })
}
