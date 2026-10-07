import { useMemo } from 'react'
import { PDFViewer } from '@react-pdf/renderer'
import { useStudentReportCard } from '../../hooks/useStudentReportCard'
import { useInstitutionLogo } from '../../hooks/useInstitutionLogo'
import type { ReportCardTemplate } from '../../types'
import { getReportCardLayout, resolveReportCardSettings } from './layouts'
import { buildShsCardData } from './shsSemestral/data'
import { ShsSemestralDocument } from './shsSemestral/ShsSemestralDocument'

interface TemplatedReportCardProps {
  template: ReportCardTemplate
  studentId: string
  classSectionId: string
  institutionId: string
  academicYear: string
  principalName: string
  overrideAge?: string
  viewerKey?: string
  viewerHeight?: string
}

/**
 * A learner's report card drawn from the school's own template, loaded from
 * the same sources as the standard card so both always agree on the grades,
 * observed values and attendance they print.
 */
export default function TemplatedReportCard({
  template,
  studentId,
  classSectionId,
  institutionId,
  academicYear,
  principalName,
  overrideAge,
  viewerKey,
  viewerHeight = '100%',
}: TemplatedReportCardProps) {
  const report = useStudentReportCard({ studentId, classSectionId, institutionId, academicYear, enabled: true })
  const { schoolLogoUrl } = useInstitutionLogo(institutionId || undefined)

  const layout = getReportCardLayout(template.layout)
  const settings = useMemo(
    () => (layout ? resolveReportCardSettings(layout, template.settings) : {}),
    [layout, template.settings]
  )

  // The hook filters attendance afresh on every render, so it is keyed by
  // content: a new array each time would rebuild — and re-render — the PDF.
  const attendancesKey = JSON.stringify(report.attendances)
  const data = useMemo(() => {
    if (report.isLoading || report.error || !layout) return null
    return buildShsCardData({
      student: report.student,
      institution: report.institution,
      classSection: report.classSection,
      subjects: report.subjects,
      grades: report.grades,
      coreValueMarkings: report.coreValueMarkings,
      attendances: JSON.parse(attendancesKey),
      schoolDays: report.schoolDays,
      academicYear,
      settings,
      schoolLogoUrl: schoolLogoUrl || null,
      principalName,
      overrideAge,
    })
  }, [
    report.isLoading,
    report.error,
    report.student,
    report.institution,
    report.classSection,
    report.subjects,
    report.grades,
    report.coreValueMarkings,
    report.schoolDays,
    attendancesKey,
    layout,
    academicYear,
    settings,
    schoolLogoUrl,
    principalName,
    overrideAge,
  ])

  if (!layout) {
    return (
      <div className="w-full flex items-center justify-center bg-white" style={{ height: viewerHeight }}>
        <div className="text-sm text-red-700">
          This grade level&apos;s report card template uses a layout this version of the app does not know.
        </div>
      </div>
    )
  }

  if (report.isLoading || !data) {
    return (
      <div className="w-full flex items-center justify-center bg-white" style={{ height: viewerHeight }}>
        <div className={`text-sm ${report.error ? 'text-red-700' : 'text-gray-600'}`}>
          {report.error ? `Error loading report card: ${report.error}` : 'Loading report card…'}
        </div>
      </div>
    )
  }

  return (
    <PDFViewer key={viewerKey} className="w-full" style={{ height: viewerHeight }}>
      <ShsSemestralDocument data={data} settings={settings} />
    </PDFViewer>
  )
}
