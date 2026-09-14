import { pdf, type DocumentProps } from '@react-pdf/renderer'
import { useMutation, useQuery } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import toast from 'react-hot-toast'
import { Ks1PaceForm } from '../components/matatagReports/Ks1PaceForm'
import { Ks1ProgressReportCard } from '../components/matatagReports/Ks1ProgressReportCard'
import { safeFilename, saveBlob } from '../components/matatagReports/matatagPdfShared'
import { matatagService } from '../services/matatagService'
import type { MatatagProgressReport } from '../types'

/**
 * The progress report card and the PACE forms.
 *
 * Reading and rendering are kept together here so the page stays a page: the
 * repo's layering is `pages → hooks → services → lib/api.ts`, and a component
 * reaching for the service directly to fetch a report would be a back-edge
 * around it.
 *
 * Downloads **fetch on demand** rather than reading a cached query. One
 * learner's five PACE forms is about 126 KB of competency text, and a panel
 * that loads it when it opens has paid for it even when nobody prints
 * anything.
 */

function messageFrom(error: unknown, fallback: string): string {
  if (isAxiosError(error)) {
    // A request that never reached the API carries no server message, and
    // blaming the PDF for that sends you looking in the wrong place.
    if (error.request && !error.response) {
      return 'Could not reach the server to load the report.'
    }

    const message = error.response?.data?.message
    if (typeof message === 'string' && message !== '') return message
  }

  // A thrown Error carries a message written for this teacher — "this section
  // has no learners on its roster", "DepEd's workbook holds 50 of each sex".
  // Falling back past it would replace something specific with something
  // generic.
  if (error instanceof Error && error.message !== '') {
    return error.message
  }

  return fallback
}

export const matatagReportKeys = {
  report: (sectionId: string, studentId?: string, areaId?: string, year?: string) =>
    ['matatag', 'report', sectionId, studentId ?? 'section', areaId ?? 'all', year ?? ''] as const,
}

/**
 * A report, for previewing on screen.
 *
 * Held hard: the payload is large, entirely derived from data the other panels
 * already write, and a refetch mid-preview remounts a PDF viewer — which in
 * react-pdf v4 means a blank frame and a scroll position lost.
 */
export function useMatatagReport(params: {
  sectionId: string
  studentId?: string
  learningAreaId?: string
  academicYear?: string
  enabled?: boolean
}) {
  return useQuery({
    queryKey: matatagReportKeys.report(
      params.sectionId,
      params.studentId,
      params.learningAreaId,
      params.academicYear
    ),
    queryFn: () =>
      params.studentId
        ? matatagService.getLearnerReport(params.studentId, {
            class_section_id: params.sectionId,
            learning_area_id: params.learningAreaId,
            academic_year: params.academicYear,
          })
        : matatagService.getSectionReport({
            class_section_id: params.sectionId,
            learning_area_id: params.learningAreaId,
            academic_year: params.academicYear,
          }),
    enabled: params.enabled !== false && Boolean(params.sectionId),
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: 1,
  })
}

interface DownloadParams {
  sectionId: string
  sectionTitle: string
  academicYear?: string
}

/**
 * The four print jobs a Grade 1 adviser actually has.
 *
 * Deliberately not five: there is no "every PACE form for every learner". That
 * is 50 learners × 5 areas ≈ 600 pages from one click, and the API does not
 * serve it either — `pace.scope` comes back `omitted` and says so. Both real
 * jobs narrow it, by learner or by area.
 */
export function useMatatagReportDownloads({ sectionId, sectionTitle, academicYear }: DownloadParams) {
  const section = safeFilename(sectionTitle)
  const year = academicYear ?? ''

  const onError = (fallback: string) => (error: unknown) => {
    toast.error(messageFrom(error, fallback))
    console.error('MATATAG report failed', error)
  }

  const learnerReport = (studentId: string, learningAreaId?: string) =>
    matatagService.getLearnerReport(studentId, {
      class_section_id: sectionId,
      learning_area_id: learningAreaId,
      academic_year: academicYear,
    })

  const learnerCard = useMutation({
    mutationFn: async ({ studentId, name }: { studentId: string; name: string }) => {
      const report = await learnerReport(studentId)
      await render(<Ks1ProgressReportCard report={report} />, `Report Card - ${safeFilename(name)} - ${year}.pdf`)
    },
    onError: onError('Could not build this report card.'),
  })

  const learnerPaceForms = useMutation({
    mutationFn: async ({ studentId, name }: { studentId: string; name: string }) => {
      const report = await learnerReport(studentId)
      assertHasForms(report)
      await render(<Ks1PaceForm report={report} />, `PACE Forms - ${safeFilename(name)} - ${year}.pdf`)
    },
    onError: onError('Could not build these PACE forms.'),
  })

  const classCards = useMutation({
    mutationFn: async () => {
      const report = await matatagService.getSectionReport({
        class_section_id: sectionId,
        academic_year: academicYear,
      })

      if (report.learners.length === 0) {
        throw new Error('This section has no learners on its roster for this year.')
      }

      await render(<Ks1ProgressReportCard report={report} />, `Report Cards - ${section} - ${year}.pdf`)
    },
    onError: onError('Could not build the report cards.'),
  })

  const classPaceForms = useMutation({
    mutationFn: async ({ learningAreaId, areaTitle }: { learningAreaId: string; areaTitle: string }) => {
      const report = await matatagService.getSectionReport({
        class_section_id: sectionId,
        learning_area_id: learningAreaId,
        academic_year: academicYear,
      })

      assertHasForms(report)

      await render(
        <Ks1PaceForm report={report} />,
        `PACE ${safeFilename(areaTitle)} - ${section} - ${year}.pdf`
      )
    },
    onError: onError('Could not build the PACE forms for this class.'),
  })

  /**
   * DepEd's own workbook for the section.
   *
   * Built on the server rather than here: the macro-skill encoding on those
   * sheets *is* fill colour, and `xlsx@0.18.5` — the build already in this
   * repo — silently drops fills on write. So the API fills DepEd's committed
   * template and we save what comes back.
   *
   * Slower than the PDFs by a wide margin (the server loads and rewrites a
   * seventeen-sheet workbook), which is why the button says so.
   */
  const sectionWorkbook = useMutation({
    mutationFn: async () => {
      const blob = await matatagService.getWorkbook({
        class_section_id: sectionId,
        academic_year: academicYear,
      })

      saveBlob(blob, `MATATAG ECR - ${section} - ${year}.xlsx`)
    },
    onError: onError("Could not build DepEd's workbook for this section."),
  })

  return {
    learnerCard,
    learnerPaceForms,
    classCards,
    classPaceForms,
    sectionWorkbook,
    isBusy:
      learnerCard.isPending ||
      learnerPaceForms.isPending ||
      classCards.isPending ||
      classPaceForms.isPending ||
      sectionWorkbook.isPending,
  }
}

async function render(
  document: React.ReactElement<DocumentProps>,
  filename: string
): Promise<void> {
  const blob = await pdf(document).toBlob()
  saveBlob(blob, filename)
}

/**
 * The API answers `omitted` when a request would have produced every form for
 * every learner. Reaching here with that means the caller forgot to narrow, and
 * rendering a form with no rows would be a silently empty PDF.
 */
function assertHasForms(report: MatatagProgressReport): void {
  if (report.pace.learning_areas.length === 0) {
    throw new Error(
      report.pace.note ?? 'No PACE forms came back for this request. Choose a learner or an area.'
    )
  }
}
