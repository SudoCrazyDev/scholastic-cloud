import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import {
  XMarkIcon,
  EyeIcon,
  EyeSlashIcon,
  ClockIcon,
  AcademicCapIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline'
import type { Topic } from '../../../types'
import { Button } from '../../../components/button'
import { Badge } from '../../../components/badge'
import { assessmentMethodService } from '../../../services/assessmentMethodService'
import { LessonContentViewer, stripHtml } from './LessonContentViewer'
import { RichTextEditor } from './RichTextEditor'
import { PreviewAssessmentModal } from './PreviewAssessmentModal'

interface PreviewLessonModalProps {
  topic: Topic
  onClose: () => void
}

/**
 * Read-only preview of a lesson rendered the way students see it in ViewLesson,
 * including the same section stepper. "Mark as complete" is disabled since this
 * is purely a "view as student" preview; linked assessments open their own
 * student preview instead of a real attempt.
 */
export const PreviewLessonModal: React.FC<PreviewLessonModalProps> = ({ topic, onClose }) => {
  const blocks = topic.content ?? []
  const [assessmentId, setAssessmentId] = React.useState<string | null>(null)

  const {
    data: previewMethod,
    isFetching: loadingAssessment,
    error: assessmentError,
  } = useQuery({
    queryKey: ['assessment-method-preview', assessmentId],
    queryFn: () => assessmentMethodService.get(assessmentId as string),
    enabled: !!assessmentId,
    retry: false,
  })

  React.useEffect(() => {
    if (assessmentError) {
      toast.error('Failed to load the linked assessment preview.')
      setAssessmentId(null)
    }
  }, [assessmentError])

  return (
    <div className="fixed inset-0 z-50 bg-black/50">
      <div className="absolute inset-0 flex flex-col bg-gray-50">
        <header className="flex items-center justify-between gap-3 border-b border-gray-200 bg-gradient-to-r from-indigo-50 via-white to-white px-6 py-4">
          <div className="flex items-center gap-2">
            <EyeIcon className="h-5 w-5 text-indigo-600" />
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Student Preview</h3>
              <p className="text-sm text-gray-500">This is what students see when viewing this lesson.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-700"
            title="Close"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </header>

        {!topic.is_published && (
          <div className="flex items-center justify-center gap-2 border-b border-amber-200 bg-amber-50 px-6 py-2 text-sm font-medium text-amber-800">
            <EyeSlashIcon className="h-4 w-4" />
            Draft — students can't see this lesson yet.
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-4xl space-y-6 p-6">
            {/* Lesson header */}
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{topic.title}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-500">
                {topic.quarter && <Badge color="zinc">Q{topic.quarter}</Badge>}
                {topic.estimated_minutes ? (
                  <span className="inline-flex items-center gap-1">
                    <ClockIcon className="h-4 w-4" />
                    {topic.estimated_minutes} min
                  </span>
                ) : null}
              </div>
            </div>

            {stripHtml(topic.description) && (
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <RichTextEditor value={topic.description as string} editable={false} />
              </div>
            )}

            {/* Learning objectives */}
            {topic.learning_objectives && topic.learning_objectives.length > 0 && (
              <div className="rounded-xl border-l-4 border-indigo-500 bg-indigo-50 p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-indigo-900">
                  <AcademicCapIcon className="h-4 w-4" />
                  Learning objectives
                </div>
                <ul className="list-disc space-y-1 pl-5 text-sm text-indigo-900">
                  {topic.learning_objectives.map((obj, i) => (
                    <li key={i}>{obj}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Content — same stepper students get; assessments open their student preview */}
            {blocks.length === 0 ? (
              <div className="rounded-xl border-2 border-dashed border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
                This lesson has no content blocks yet.
              </div>
            ) : (
              <LessonContentViewer
                blocks={blocks}
                mode="stepper"
                onOpenAssessment={(id) => setAssessmentId(id)}
              />
            )}

            {/* Footer */}
            <div className="flex items-center justify-between gap-4 border-t border-gray-200 pt-5">
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
              <Button disabled className="inline-flex items-center gap-2">
                <CheckCircleIcon className="h-4 w-4" />
                Mark as complete
              </Button>
            </div>
            <p className="pb-4 text-center text-xs text-gray-400">Preview mode — progress is not recorded.</p>
          </div>
        </div>
      </div>

      {/* Linked-assessment preview (stacked on top) */}
      {assessmentId && loadingAssessment && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40">
          <div className="flex items-center gap-3 rounded-xl bg-white px-6 py-4 shadow-lg">
            <div className="h-5 w-5 animate-spin rounded-full border-b-2 border-indigo-600" />
            <span className="text-sm text-gray-600">Loading assessment preview...</span>
          </div>
        </div>
      )}
      {assessmentId && previewMethod && (
        <PreviewAssessmentModal method={previewMethod} onClose={() => setAssessmentId(null)} />
      )}
    </div>
  )
}

export default PreviewLessonModal
