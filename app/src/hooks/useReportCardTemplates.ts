import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { reportCardTemplateService } from '../services/reportCardTemplateService'
import type { ReportCardTemplatePayload } from '../types'

const LIST_KEY = ['report-card-templates'] as const

const errorMessage = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback

/** The school's templates and the layouts a template can use (Settings). */
export function useReportCardTemplates(enabled = true) {
  return useQuery({
    queryKey: LIST_KEY,
    queryFn: () => reportCardTemplateService.list(),
    enabled,
  })
}

/**
 * The template a grade level prints, or null when it keeps the standard card.
 * Read by every report card screen, so it is cached for the session.
 */
export function useReportCardTemplateForGradeLevel(gradeLevel: string | null | undefined, enabled = true) {
  const trimmed = (gradeLevel ?? '').trim()
  return useQuery({
    queryKey: ['report-card-templates', 'for-grade-level', trimmed.toLowerCase()],
    queryFn: () => reportCardTemplateService.forGradeLevel(trimmed),
    enabled: enabled && trimmed !== '',
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  })
}

export function useReportCardTemplateMutations() {
  const queryClient = useQueryClient()
  // Both the Settings list and every grade-level lookup sit under this prefix.
  const invalidate = () => queryClient.invalidateQueries({ queryKey: LIST_KEY })

  const createTemplate = useMutation({
    mutationFn: (payload: ReportCardTemplatePayload) => reportCardTemplateService.create(payload),
    onSuccess: (result) => {
      invalidate()
      toast.success(result.message)
    },
    onError: (error) => toast.error(errorMessage(error, 'Failed to create the report card template')),
  })

  const updateTemplate = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<ReportCardTemplatePayload> }) =>
      reportCardTemplateService.update(id, payload),
    onSuccess: (result) => {
      invalidate()
      toast.success(result.message)
    },
    onError: (error) => toast.error(errorMessage(error, 'Failed to save the report card template')),
  })

  const deleteTemplate = useMutation({
    mutationFn: (id: string) => reportCardTemplateService.delete(id),
    onSuccess: (result) => {
      invalidate()
      toast.success(result.message)
    },
    onError: (error) => toast.error(errorMessage(error, 'Failed to delete the report card template')),
  })

  return { createTemplate, updateTemplate, deleteTemplate }
}
