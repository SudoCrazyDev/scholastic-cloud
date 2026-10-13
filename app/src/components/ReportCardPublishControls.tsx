import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Button } from './button'
import { ConfirmationModal } from './ConfirmationModal'
import type { SectionReportCardPublishing } from '../hooks/useReportCardPublications'

/**
 * One learner's Publish / Unpublish toggle.
 *
 * Renders nothing for someone who may not see publication state at all, and a
 * read-only badge for someone who may see it but not change it.
 */
export function ReportCardPublishButton({
  publishing,
  studentId,
  studentName,
}: {
  publishing: SectionReportCardPublishing
  studentId: string
  studentName?: string
}) {
  if (!publishing.available || !studentId) return null

  const published = publishing.isPublished(studentId)
  const by = publishing.publishedBy(studentId)
  const title = published
    ? `Visible to ${studentName || 'the student'} in their portal${by ? ` — published by ${by}` : ''}`
    : `Hidden from ${studentName || 'the student'} until published`

  if (!publishing.canPublish) {
    return (
      <span
        title={title}
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
          published ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'
        }`}
      >
        {published ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
        {published ? 'Published' : 'Not published'}
      </span>
    )
  }

  return (
    <Button
      type="button"
      size="sm"
      variant={published ? 'solid' : 'outline'}
      color={published ? 'success' : 'primary'}
      title={title}
      loading={publishing.isPending(studentId)}
      disabled={publishing.isBulkPending}
      onClick={() => publishing.toggle(studentId)}
      leftIcon={published ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
    >
      {published ? 'Published' : 'Publish'}
    </Button>
  )
}

/**
 * How many learners can see their card, with Publish all / Unpublish all.
 *
 * Both ask first: one click here changes what a whole class can read.
 */
export function ReportCardPublishBar({ publishing }: { publishing: SectionReportCardPublishing }) {
  const [confirm, setConfirm] = useState<'publish' | 'unpublish' | null>(null)

  if (!publishing.available || publishing.total === 0) return null

  const { publishedCount, total } = publishing

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
      <div>
        <p className="text-sm font-medium text-gray-900">
          {publishedCount} of {total} published to the student portal
        </p>
        <p className="text-xs text-gray-500">
          A student sees their report card only after it is published, and stops seeing it if you
          unpublish it. It always shows the grades as they stand now.
        </p>
      </div>
      {publishing.canPublish && (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={publishedCount === 0 || publishing.isBulkPending}
            onClick={() => setConfirm('unpublish')}
          >
            Unpublish all
          </Button>
          <Button
            type="button"
            size="sm"
            loading={publishing.isBulkPending}
            disabled={publishedCount === total}
            onClick={() => setConfirm('publish')}
          >
            Publish all
          </Button>
        </div>
      )}

      <ConfirmationModal
        isOpen={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          publishing.setAll(confirm === 'publish')
          setConfirm(null)
        }}
        title={confirm === 'publish' ? 'Publish every report card?' : 'Unpublish every report card?'}
        message={
          confirm === 'publish'
            ? `${total - publishedCount} student(s) will be able to see their report card in the student portal.`
            : `${publishedCount} student(s) will no longer be able to see their report card.`
        }
        confirmText={confirm === 'publish' ? 'Publish all' : 'Unpublish all'}
        variant={confirm === 'publish' ? 'info' : 'warning'}
      />
    </div>
  )
}
