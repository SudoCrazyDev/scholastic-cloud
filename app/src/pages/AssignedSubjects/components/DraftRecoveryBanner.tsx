import React from 'react'
import { ArrowUturnLeftIcon, CloudArrowUpIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import { Button } from '../../../components/button'

const relativeTime = (timestamp: number): string => {
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.round(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

/**
 * Offers back work that was autosaved in this browser but never reached the
 * server — the usual cause being a save that failed on a slow connection.
 */
export const DraftRecoveryBanner: React.FC<{
  savedAt: number
  itemLabel: string
  onRestore: () => void
  onDiscard: () => void
}> = ({ savedAt, itemLabel, onRestore, onDiscard }) => (
  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
    <div className="flex items-start gap-2 text-sm text-amber-800">
      <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        Unsaved {itemLabel} changes from <strong>{relativeTime(savedAt)}</strong> were found on this
        device. They were never saved to the server.
      </span>
    </div>
    <div className="flex items-center gap-2">
      <Button type="button" size="sm" onClick={onRestore}>
        <ArrowUturnLeftIcon className="mr-1 h-3.5 w-3.5" />
        Restore
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={onDiscard}>
        Discard
      </Button>
    </div>
  </div>
)

/**
 * Small status line telling the teacher whether their work is only in the
 * browser or actually on the server.
 */
export const DraftStatus: React.FC<{ isDirty: boolean; lastAutosavedAt: number | null }> = ({
  isDirty,
  lastAutosavedAt,
}) => {
  if (!isDirty) return null
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700"
      title="Your changes are kept in this browser until you save. They are not on the server yet."
    >
      <CloudArrowUpIcon className="h-3.5 w-3.5" />
      {lastAutosavedAt ? 'Unsaved — kept in this browser' : 'Unsaved changes'}
    </span>
  )
}
