import { Component, useMemo, useState, type ReactNode } from 'react'
import { PDFViewer } from '@react-pdf/renderer'
import { AlertTriangle, Download, FileSpreadsheet, FileText, Loader2 } from 'lucide-react'
import { Button } from '../../../components/button'
import { Select } from '../../../components/select'
import { Ks1PaceForm } from '../../../components/matatagReports/Ks1PaceForm'
import { Ks1ProgressReportCard } from '../../../components/matatagReports/Ks1ProgressReportCard'
import { useMatatagReport, useMatatagReportDownloads } from '../../../hooks/useMatatagReports'
import type { MatatagLearner, MatatagLearningAreaSummary } from '../../../types'

interface Props {
  classSectionId: string
  sectionTitle: string
  academicYear?: string
  learners: MatatagLearner[]
  learningAreas: MatatagLearningAreaSummary[]
}

type Preview = 'card' | 'pace'

/**
 * Printing.
 *
 * Two things get handed out: the progress report card, which is the prose, and
 * the PACE forms, which are the descriptor grid. A parent gets the card with
 * the forms stapled behind it.
 *
 * The preview is one learner at a time and nothing else, on purpose. Rendering
 * a PDF happens in the browser, and a 50-learner section is 50 cards or several
 * hundred form pages — worth waiting for behind a Download button, not worth
 * rendering into a viewport nobody asked to fill.
 */
export function MatatagReportsPanel({
  classSectionId,
  sectionTitle,
  academicYear,
  learners,
  learningAreas,
}: Props) {
  const [studentId, setStudentId] = useState<string>(learners[0]?.student_id ?? '')
  const [areaId, setAreaId] = useState<string>(learningAreas[0]?.id ?? '')
  const [preview, setPreview] = useState<Preview>('card')

  const downloads = useMatatagReportDownloads({
    sectionId: classSectionId,
    sectionTitle,
    academicYear,
  })

  const learner = learners.find(l => l.student_id === studentId)
  const area = learningAreas.find(a => a.id === areaId)

  // The preview always asks for one learner, so the catalog comes back whole
  // and both documents render from the same payload.
  const report = useMatatagReport({
    sectionId: classSectionId,
    studentId: studentId || undefined,
    academicYear,
    enabled: Boolean(studentId),
  })

  /**
   * react-pdf v4 mis-renders on incremental prop updates, so the viewer is
   * remounted on anything that changes the document rather than updated in
   * place. The same trick `StudentReportCardModal` uses, and for the same bug.
   */
  const viewerKey = useMemo(
    () => `${studentId}|${preview}|${academicYear ?? ''}|${report.dataUpdatedAt}`,
    [studentId, preview, academicYear, report.dataUpdatedAt]
  )

  if (learners.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center">
        <p className="text-sm text-gray-600">
          There is nobody on this section's roster for {academicYear ?? 'this year'}, so there is
          nothing to print.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <h4 className="text-sm font-semibold text-gray-900">One learner</h4>
          <p className="mt-0.5 text-xs text-gray-500">
            Their card, and all {learningAreas.length} PACE forms.
          </p>

          <div className="mt-3 space-y-3">
            <label className="block text-xs font-medium text-gray-600">
              <span className="block mb-1">Learner</span>
              <Select
                inputSize="sm"
                value={studentId}
                onChange={event => setStudentId(event.target.value)}
                options={learners.map(l => ({ value: l.student_id, label: l.name }))}
              />
            </label>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                color="primary"
                size="sm"
                disabled={!learner || downloads.isBusy}
                leftIcon={<Download className="w-4 h-4" />}
                onClick={() =>
                  learner &&
                  downloads.learnerCard.mutate({ studentId: learner.student_id, name: learner.name })
                }
              >
                {downloads.learnerCard.isPending ? 'Building…' : 'Report card'}
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!learner || downloads.isBusy}
                leftIcon={<FileText className="w-4 h-4" />}
                onClick={() =>
                  learner &&
                  downloads.learnerPaceForms.mutate({
                    studentId: learner.student_id,
                    name: learner.name,
                  })
                }
              >
                {downloads.learnerPaceForms.isPending ? 'Building…' : 'PACE forms'}
              </Button>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <h4 className="text-sm font-semibold text-gray-900">The whole class</h4>
          <p className="mt-0.5 text-xs text-gray-500">
            {learners.length} learners. PACE forms print one learning area at a time — all five at
            once is about {learners.length * 5 * 3} pages.
          </p>

          <div className="mt-3 space-y-3">
            <label className="block text-xs font-medium text-gray-600">
              <span className="block mb-1">Learning area</span>
              <Select
                inputSize="sm"
                value={areaId}
                onChange={event => setAreaId(event.target.value)}
                options={learningAreas.map(a => ({ value: a.id, label: a.title }))}
              />
            </label>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                color="primary"
                size="sm"
                disabled={downloads.isBusy}
                leftIcon={<Download className="w-4 h-4" />}
                onClick={() => downloads.classCards.mutate()}
              >
                {downloads.classCards.isPending ? 'Building…' : 'All report cards'}
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!area || downloads.isBusy}
                leftIcon={<FileText className="w-4 h-4" />}
                onClick={() =>
                  area &&
                  downloads.classPaceForms.mutate({
                    learningAreaId: area.id,
                    areaTitle: area.title,
                  })
                }
              >
                {downloads.classPaceForms.isPending ? 'Building…' : `${area?.title ?? 'Area'} forms`}
              </Button>
            </div>
          </div>
        </section>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h4 className="text-sm font-semibold text-gray-900">DepEd's own workbook</h4>
        <p className="mt-0.5 text-xs text-gray-500">
          The whole section as the official <span className="font-medium">.xlsx</span> e-class
          record — every descriptor, both narratives per term and the attendance, on DepEd's own
          sheets. This is the file a division office asks for; the report cards above are what a
          parent is handed.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={downloads.isBusy}
            leftIcon={<FileSpreadsheet className="w-4 h-4" />}
            onClick={() => downloads.sectionWorkbook.mutate()}
          >
            {downloads.sectionWorkbook.isPending ? 'Building…' : 'Download the workbook'}
          </Button>

          <span className="text-xs text-gray-400">
            Built on the server; takes a few seconds.
          </span>
        </div>
      </section>

      {report.data && report.data.warnings.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="flex items-center gap-2 text-sm font-medium text-amber-900">
            <AlertTriangle className="w-4 h-4" />
            Check these before printing
          </p>
          <ul className="mt-1 space-y-0.5 text-xs text-amber-800 list-disc list-inside">
            {report.data.warnings.map((warning, index) => (
              <li key={index}>{warning.message}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 px-4 py-2">
          <span className="text-xs font-medium text-gray-600">Preview</span>

          {(['card', 'pace'] as const).map(key => (
            <button
              key={key}
              type="button"
              onClick={() => setPreview(key)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                preview === key
                  ? 'bg-primary-100 text-primary-800'
                  : 'text-gray-500 hover:text-primary-600'
              }`}
            >
              {key === 'card' ? 'Report card' : 'PACE forms'}
            </button>
          ))}

          <span className="ml-auto text-xs text-gray-400">{learner?.name}</span>
        </div>

        <div className="h-[720px] w-full">
          {report.isLoading && (
            <div className="flex h-full items-center justify-center gap-2 text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Loading this learner's record…</span>
            </div>
          )}

          {report.isError && (
            <div className="flex h-full items-center justify-center">
              <div className="max-w-md rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                Could not load the report.{' '}
                <button type="button" className="underline" onClick={() => report.refetch()}>
                  Try again
                </button>
              </div>
            </div>
          )}

          {report.data && (
            <PdfErrorBoundary key={viewerKey}>
              <PDFViewer width="100%" height="100%" showToolbar>
                {preview === 'card' ? (
                  <Ks1ProgressReportCard report={report.data} />
                ) : (
                  <Ks1PaceForm report={report.data} />
                )}
              </PDFViewer>
            </PdfErrorBoundary>
          )}
        </div>
      </div>

      <p className="text-[11px] text-gray-500">
        The card carries the narratives, the attendance and the A–E legend. The descriptor grid is
        not on the card — DepEd prints it on the PACE forms, which staple behind it.
      </p>
    </div>
  )
}

/**
 * A failed PDF render throws during React's render pass, which unmounts the
 * whole tab. A boundary keeps the failure inside the preview frame, where the
 * teacher can still reach the Download buttons above it.
 */
class PdfErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error('MATATAG report PDF render error:', error)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full items-center justify-center p-4">
          <div className="max-w-lg rounded-lg border border-red-200 bg-red-50 p-4 text-sm">
            <div className="font-semibold text-red-800">The preview could not be drawn.</div>
            <div className="mt-2 text-red-700">{this.state.error.message}</div>
            <div className="mt-2 text-xs text-red-700/80">
              The Download buttons above build the same document and may still work.
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
