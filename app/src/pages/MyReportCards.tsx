import { Component, useEffect, useMemo, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { FileText, Loader2 } from 'lucide-react'
import PrintReportCard from '../components/studentReportCard/studentReportCard'
import TemplatedReportCard from '../components/reportCardTemplates/TemplatedReportCard'
import DepedPerformanceReportCard from '../components/depedPerformanceReport/DepedPerformanceReportCard'
import { getReportCardLayout } from '../components/reportCardTemplates/layouts'
import { ReportCardDataProvider } from '../hooks/useStudentReportCard'
import { progressReportCard } from '../hooks/useMatatagReports'
import { useInstitutionLogo } from '../hooks/useInstitutionLogo'
import { ResponsivePdfViewer } from '../components/ResponsivePdfViewer'
import { useMyReportCard, useMyReportCards } from '../hooks/useReportCardPublications'
import type { MyReportCard, MyReportCardSummary, ReportCardType } from '../services/reportCardPublicationService'

const CARD_LABELS: Record<ReportCardType, string> = {
  'report-card': 'Report Card',
  'performance-report': "Learner's Performance Report",
  matatag: 'Progress Report Card',
}

class PdfErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="w-full h-full flex items-center justify-center p-4">
          <div className="max-w-lg rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            Your report card could not be displayed. Please try again later, or ask your adviser for a
            printed copy.
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

/**
 * The student's report cards — only the ones a teacher has published.
 *
 * Each card prints with the same component the adviser prints it with, fed the
 * data the API composed for this one published card instead of the staff-only
 * endpoints those components normally read.
 */
export default function MyReportCards() {
  const { data: cards = [], isLoading, error } = useMyReportCards()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    if (cards.length > 0 && !cards.some((card) => card.id === selectedId)) {
      setSelectedId(cards[0].id)
    }
  }, [cards, selectedId])

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="mb-6"
        >
          <h1 className="text-3xl font-bold text-gray-900">My Report Cards</h1>
          <p className="mt-1 text-gray-600">
            Report cards your teacher has released to you. You can view, download or print them.
          </p>
        </motion.div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-gray-600">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Loading your report cards…
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">
            We couldn't load your report cards. Please try again later.
          </div>
        ) : cards.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center">
            <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <h2 className="text-lg font-semibold text-gray-900">No report cards yet</h2>
            <p className="mt-1 text-sm text-gray-600">
              Your report card will appear here once your teacher publishes it.
            </p>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
            <nav className="space-y-2" aria-label="Report cards">
              {cards.map((card) => (
                <CardListItem
                  key={card.id}
                  card={card}
                  selected={card.id === selectedId}
                  onSelect={() => setSelectedId(card.id)}
                />
              ))}
            </nav>
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden" style={{ height: '80vh' }}>
              {selectedId && <PublishedCard id={selectedId} />}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function CardListItem({
  card,
  selected,
  onSelect,
}: {
  card: MyReportCardSummary
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left rounded-lg border px-4 py-3 transition-colors ${
        selected
          ? 'border-primary-500 bg-primary-50'
          : 'border-gray-200 bg-white hover:border-primary-300 hover:bg-primary-50/50'
      }`}
    >
      <div className="text-sm font-semibold text-gray-900">SY {card.academic_year}</div>
      <div className="text-sm text-gray-700">{CARD_LABELS[card.card_type] ?? 'Report Card'}</div>
      {card.class_section && (
        <div className="text-xs text-gray-500 mt-0.5">
          {[card.class_section.grade_level, card.class_section.title].filter(Boolean).join(' — ')}
        </div>
      )}
    </button>
  )
}

function PublishedCard({ id }: { id: string }) {
  const { data: card, isLoading, error } = useMyReportCard(id)

  if (isLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center text-sm text-gray-600">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Preparing your report card…
      </div>
    )
  }

  if (error || !card) {
    return (
      <div className="w-full h-full flex items-center justify-center p-6 text-center text-sm text-gray-600">
        This report card is not available. It may have been taken back by your teacher.
      </div>
    )
  }

  return (
    <PdfErrorBoundary key={card.id}>
      {card.card_type === 'matatag' ? <MatatagCard card={card} /> : <GradesCard card={card} />}
    </PdfErrorBoundary>
  )
}

/** The numeric cards: the standard card, a school's own template, or DepEd's Performance Report. */
function GradesCard({ card }: { card: MyReportCard }) {
  const bundle = card.card
  if (!bundle) return null

  const common = {
    viewerKey: card.id,
    viewerHeight: '100%',
    principalName: card.principal_name ?? '',
    studentId: bundle.student.id,
    classSectionId: bundle.class_section.id,
    institutionId: bundle.institution.id,
    academicYear: card.academic_year,
  }

  // Same choice the adviser's modal makes: a Kindergarten template prints
  // MATATAG ratings, so only a grades layout replaces the standard card.
  const template = getReportCardLayout(card.template?.layout)?.source === 'grades' ? card.template : null

  return (
    <ReportCardDataProvider value={bundle}>
      {card.card_type === 'performance-report' ? (
        <DepedPerformanceReportCard {...common} comments={card.comments ?? {}} />
      ) : template ? (
        <TemplatedReportCard {...common} template={template} />
      ) : (
        <PrintReportCard {...common} />
      )}
    </ReportCardDataProvider>
  )
}

function MatatagCard({ card }: { card: MyReportCard }) {
  const report = card.report
  const template = card.template?.layout === 'kinder_trifold' ? card.template : null
  const { schoolLogoUrl } = useInstitutionLogo(template ? (report?.school.id ?? undefined) : undefined)
  const options = useMemo(() => ({ template, schoolLogoUrl }), [template, schoolLogoUrl])

  if (!report) return null

  return (
    <ResponsivePdfViewer
      key={`${card.id}|${schoolLogoUrl ?? ''}`}
      width="100%"
      height="100%"
      showToolbar
      fileName="progress-report-card.pdf"
    >
      {progressReportCard(report, options)}
    </ResponsivePdfViewer>
  )
}
