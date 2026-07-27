import React, { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import {
  XMarkIcon,
  MagnifyingGlassIcon,
  DocumentDuplicateIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline'
import { Button } from '../../../components/button'
import { Input } from '../../../components/input'
import { userService } from '../../../services/userService'
import type { AssignedSubject } from '../../../types'

/** A target subject that was not copied to, and why. */
export interface CopySkipped {
  subject_id: string
  subject_title: string
  reason: string
}

export interface CopyResult {
  copied: number
  skipped?: CopySkipped[]
}

interface CopyToSubjectsModalProps {
  isOpen: boolean
  onClose: () => void
  /** What is being copied — shown in the header, e.g. "Quiz 1: Integers". */
  itemTitle: string
  /** "assessment method" | "lesson"; used in the copy for messages. */
  itemLabel: string
  /** The subject the item currently lives in; excluded from the target list. */
  sourceSubjectId: string
  /** Performs the copy and resolves with what the server did. */
  onCopy: (targetSubjectIds: string[]) => Promise<CopyResult>
  /** Called after at least one successful copy, so the caller can refetch. */
  onCopied?: () => void
}

/**
 * Copies an assessment method or lesson into the teacher's other subjects.
 *
 * The common case is teaching the same subject across several sections, so the
 * list is the teacher's own assigned subjects and multiple targets can be
 * picked at once.
 */
export const CopyToSubjectsModal: React.FC<CopyToSubjectsModalProps> = ({
  isOpen,
  onClose,
  itemTitle,
  itemLabel,
  sourceSubjectId,
  onCopy,
  onCopied,
}) => {
  const [selected, setSelected] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [copying, setCopying] = useState(false)
  const [skipped, setSkipped] = useState<CopySkipped[]>([])

  const { data: subjects = [], isLoading } = useQuery({
    queryKey: ['my-assigned-subjects'],
    queryFn: () => userService.getMySubjects(),
    enabled: isOpen,
    staleTime: 5 * 60 * 1000,
  })

  const targets = useMemo(() => {
    const term = search.trim().toLowerCase()
    return subjects
      .filter((subject) => subject.id !== sourceSubjectId)
      .filter((subject) => {
        if (!term) return true
        const section = subject.class_section
        return [subject.title, subject.variant, section?.title, section?.grade_level]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term))
      })
  }, [subjects, sourceSubjectId, search])

  const close = () => {
    setSelected([])
    setSearch('')
    setSkipped([])
    onClose()
  }

  const toggle = (subjectId: string) =>
    setSelected((current) =>
      current.includes(subjectId)
        ? current.filter((id) => id !== subjectId)
        : [...current, subjectId]
    )

  const handleCopy = async () => {
    if (selected.length === 0) return
    setCopying(true)
    setSkipped([])
    try {
      const result = await onCopy(selected)
      const notCopied = result.skipped ?? []
      setSkipped(notCopied)

      if (result.copied > 0) {
        toast.success(
          `${itemLabel} copied to ${result.copied} subject${result.copied === 1 ? '' : 's'} as a draft.`
        )
        onCopied?.()
      }

      // Leave the dialog open when something was skipped so the teacher can
      // read why; otherwise the job is done.
      if (notCopied.length === 0) {
        close()
      } else {
        setSelected(notCopied.map((entry) => entry.subject_id))
      }
    } catch (error) {
      toast.error(
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          `Failed to copy the ${itemLabel}. Please try again.`
      )
    } finally {
      setCopying(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gray-900/50" onClick={close} />
      <div className="relative flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white shadow-xl">
        <header className="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-4">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-base font-semibold text-gray-900">
              <DocumentDuplicateIcon className="h-5 w-5 text-primary-600" />
              Copy to another subject
            </h3>
            <p className="mt-1 truncate text-sm text-gray-500" title={itemTitle}>
              {itemTitle || `Untitled ${itemLabel}`}
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            className="rounded-md p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </header>

        <div className="border-b border-gray-200 px-5 py-3">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search your subjects…"
            leftIcon={<MagnifyingGlassIcon className="h-4 w-4 text-gray-400" />}
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {isLoading ? (
            <p className="py-8 text-center text-sm text-gray-500">Loading your subjects…</p>
          ) : targets.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">
              {search ? 'No subjects match that search.' : 'You have no other subjects to copy into.'}
            </p>
          ) : (
            <ul className="space-y-1">
              {targets.map((subject: AssignedSubject) => {
                const checked = selected.includes(subject.id)
                const section = subject.class_section
                return (
                  <li key={subject.id}>
                    <label
                      className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition ${
                        checked
                          ? 'border-primary-300 bg-primary-50'
                          : 'border-transparent hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        checked={checked}
                        onChange={() => toggle(subject.id)}
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-gray-900">
                          {subject.title}
                          {subject.variant ? ` — ${subject.variant}` : ''}
                        </span>
                        <span className="block truncate text-xs text-gray-500">
                          {section ? `${section.grade_level ?? ''} ${section.title ?? ''}`.trim() : 'No section'}
                        </span>
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>
          )}

          {skipped.length > 0 && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="mb-1 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-amber-700">
                <ExclamationTriangleIcon className="h-3.5 w-3.5" />
                Not copied
              </p>
              <ul className="space-y-1 text-xs text-amber-800">
                {skipped.map((entry) => (
                  <li key={entry.subject_id}>
                    <span className="font-medium">{entry.subject_title || 'Subject'}</span>: {entry.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-gray-200 px-5 py-3">
          <span className="text-xs text-gray-500">
            {selected.length === 0
              ? 'Copies are created as drafts.'
              : `${selected.length} subject${selected.length === 1 ? '' : 's'} selected`}
          </span>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={close} disabled={copying}>
              Cancel
            </Button>
            <Button type="button" onClick={handleCopy} disabled={selected.length === 0 || copying}>
              {copying ? 'Copying…' : 'Copy'}
            </Button>
          </div>
        </footer>
      </div>
    </div>
  )
}

export default CopyToSubjectsModal
