import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import toast from 'react-hot-toast'

import {
  reportCardPublicationService,
  type ReportCardType,
} from '../services/reportCardPublicationService'

/** The API's own message where there is one, otherwise the caller's fallback. */
function messageFrom(error: unknown, fallback: string): string {
  if (isAxiosError(error)) {
    const message = error.response?.data?.message
    if (typeof message === 'string' && message !== '') return message
  }

  return fallback
}

const publicationsKey = (sectionId: string, cardType: ReportCardType) =>
  ['report-card-publications', sectionId, cardType] as const

/** Which learners in a section can see this card in the student portal. */
export function useReportCardPublications(params: {
  sectionId: string
  cardType: ReportCardType
  enabled?: boolean
}) {
  return useQuery({
    queryKey: publicationsKey(params.sectionId, params.cardType),
    queryFn: () =>
      reportCardPublicationService.list({
        class_section_id: params.sectionId,
        card_type: params.cardType,
      }),
    enabled: params.enabled !== false && Boolean(params.sectionId),
    staleTime: 0,
    refetchOnWindowFocus: false,
    // A 403 means this person may not see the toggle; retrying will not change it.
    retry: false,
  })
}

/** Publish or unpublish one learner's card, or several at once. */
export function useReportCardPublicationMutations(params: {
  sectionId: string
  cardType: ReportCardType
}) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ studentIds, published }: { studentIds: string[]; published: boolean }) =>
      reportCardPublicationService.update({
        class_section_id: params.sectionId,
        card_type: params.cardType,
        student_ids: studentIds,
        published,
      }),
    onSuccess: (_result, { studentIds, published }) => {
      queryClient.invalidateQueries({ queryKey: publicationsKey(params.sectionId, params.cardType) })
      const what = studentIds.length === 1 ? 'Report card' : `${studentIds.length} report cards`
      toast.success(
        published
          ? `${what} published. The student can now see it in their portal.`
          : `${what} unpublished. The student can no longer see it.`
      )
    },
    onError: (error) => {
      toast.error(messageFrom(error, 'Could not change who can see this report card.'))
    },
  })
}

/** The signed-in student's published cards. */
export function useMyReportCards() {
  return useQuery({
    queryKey: ['my-report-cards'],
    queryFn: () => reportCardPublicationService.myCards(),
    staleTime: 60 * 1000,
  })
}

/**
 * One published card's data.
 *
 * Held hard, like the staff previews: a refetch mid-preview remounts the PDF
 * viewer, which in react-pdf v4 means a blank frame.
 */
export function useMyReportCard(id: string | null) {
  return useQuery({
    queryKey: ['my-report-cards', id],
    queryFn: () => reportCardPublicationService.myCard(id as string),
    enabled: Boolean(id),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: false,
  })
}

/**
 * Everything a staff tab needs to show and flip each learner's publish state.
 *
 * `studentIds` is the roster the tab shows, so "publish all" means exactly the
 * learners on screen.
 */
export function useSectionReportCardPublishing(params: {
  sectionId: string
  cardType: ReportCardType
  studentIds: string[]
  enabled?: boolean
}) {
  const { data, isLoading } = useReportCardPublications(params)
  const mutation = useReportCardPublicationMutations(params)

  const published = data?.published ?? {}
  const pendingIds = mutation.isPending ? mutation.variables?.studentIds ?? [] : []
  const publishedCount = params.studentIds.filter((id) => published[id]).length

  return {
    isLoading,
    /** False while loading, and for anyone who may look but not publish. */
    canPublish: data?.can_publish ?? false,
    /** Whether the toggle should be shown at all — a 403 leaves `data` empty. */
    available: Boolean(data),
    isPublished: (studentId: string) => Boolean(published[studentId]),
    publishedBy: (studentId: string) => published[studentId]?.published_by ?? null,
    isPending: (studentId: string) => pendingIds.includes(studentId),
    isBulkPending: mutation.isPending && pendingIds.length > 1,
    publishedCount,
    total: params.studentIds.length,
    toggle: (studentId: string) =>
      mutation.mutate({ studentIds: [studentId], published: !published[studentId] }),
    setAll: (publishedState: boolean) =>
      mutation.mutate({
        studentIds: params.studentIds.filter((id) => Boolean(published[id]) !== publishedState),
        published: publishedState,
      }),
  }
}

export type SectionReportCardPublishing = ReturnType<typeof useSectionReportCardPublishing>
