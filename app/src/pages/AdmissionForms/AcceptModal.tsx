import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { classSectionService } from '../../services/classSectionService'
import { useDebounce } from '../../hooks/useDebounce'
import type { AdmissionFormSubmissionListItem, ClassSection } from '../../types'

interface Props {
  submission: AdmissionFormSubmissionListItem
  onConfirm: (payload: AcceptPayload) => Promise<void>
  onClose: () => void
}

export interface AcceptPayload {
  section_id: string
  student_id?: string
  first_name?: string
  last_name?: string
  middle_name?: string
  lrn?: string
}

export function AcceptModal({ submission, onConfirm, onClose }: Props) {
  const gi = submission.payload.general_information
  const isExisting = !!submission.student_match

  // Section autocomplete
  const [sectionSearch, setSectionSearch] = useState('')
  const [selectedSection, setSelectedSection] = useState<ClassSection | null>(null)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const debouncedSearch = useDebounce(sectionSearch, 300)

  // New student fields (read-only display values)
  const firstName = gi.first_name ?? ''
  const lastName = gi.surname ?? ''
  const middleName = gi.middle_name ?? ''
  const lrn = gi.lrn ?? ''
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: sectionsData, isFetching } = useQuery({
    queryKey: ['sections-search', debouncedSearch],
    queryFn: () =>
      classSectionService.getClassSections({
        search: debouncedSearch || undefined,
        per_page: 20,
      }),
    staleTime: 10_000,
  })

  const sections = sectionsData?.data ?? []

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const handleSectionSelect = (section: ClassSection) => {
    setSelectedSection(section)
    setSectionSearch(`${section.title} — ${section.grade_level}`)
    setDropdownOpen(false)
  }

  const handleSubmit = async () => {
    setError(null)
    if (!selectedSection) {
      setError('Please select a section.')
      return
    }
    const payload: AcceptPayload = { section_id: selectedSection.id }
    if (isExisting) {
      payload.student_id = submission.student_match!.id
    } else {
      if (!firstName.trim() || !lastName.trim()) {
        setError('First name and last name are required.')
        return
      }
      payload.first_name = firstName.trim()
      payload.last_name = lastName.trim()
      payload.middle_name = middleName.trim() || undefined
      payload.lrn = lrn.trim() || undefined
    }
    setSubmitting(true)
    try {
      await onConfirm(payload)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between shrink-0">
          <h3 className="text-lg font-semibold text-gray-900">
            {isExisting ? 'Re-enroll student' : 'Accept & create student'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>

        {/* Scrollable body — student fields only */}
        <div className="overflow-y-auto px-6 py-4 space-y-4 shrink min-h-0">
          {/* Existing student notice */}
          {isExisting && (
            <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-800">
              <p className="font-semibold">Existing student detected</p>
              <p className="mt-0.5 text-blue-700">
                {gi.full_name || `${gi.first_name} ${gi.surname}`} is already in the system.
                {submission.student_match?.section && (
                  <> Previously in <span className="font-medium">{submission.student_match.section.title}</span>{' '}
                  ({submission.student_match.section.academic_year}).</>
                )}
              </p>
            </div>
          )}

          {/* New student fields */}
          {!isExisting && (
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Student information</p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">First name *</label>
                  <input
                    value={firstName}
                    readOnly
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500 cursor-default"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Last name *</label>
                  <input
                    value={lastName}
                    readOnly
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500 cursor-default"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Middle name</label>
                  <input
                    value={middleName}
                    readOnly
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500 cursor-default"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">LRN</label>
                  <input
                    value={lrn}
                    readOnly
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500 cursor-default"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Section picker — outside the scroll area so dropdown floats freely */}
        <div className="px-6 pt-2 pb-3 shrink-0 border-t border-gray-100">
          <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
            Assign to section *
          </label>
          <div className="relative" ref={dropdownRef}>
            <div className="relative">
              <input
                type="text"
                value={sectionSearch}
                onChange={(e) => {
                  setSectionSearch(e.target.value)
                  setSelectedSection(null)
                  setDropdownOpen(true)
                }}
                onFocus={() => setDropdownOpen(true)}
                placeholder="Search by section name or grade level…"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
              {isFetching ? (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">…</span>
              ) : selectedSection ? (
                <button
                  type="button"
                  onClick={() => { setSelectedSection(null); setSectionSearch(''); setDropdownOpen(false) }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                  </svg>
                </button>
              ) : (
                <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clipRule="evenodd" />
                </svg>
              )}
            </div>

            {/* Dropdown — opens upward to avoid clipping by footer */}
            {dropdownOpen && (
              <div className="absolute bottom-full mb-1 w-full bg-white border border-gray-200 rounded-lg shadow-xl max-h-48 overflow-y-auto z-10">
                {sections.length === 0 ? (
                  <p className="px-3 py-3 text-sm text-gray-500 text-center">
                    {isFetching ? 'Searching…' : 'No sections found.'}
                  </p>
                ) : (
                  sections.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => handleSectionSelect(s)}
                      className="w-full text-left px-3 py-2.5 text-sm hover:bg-indigo-50 flex items-center justify-between gap-3 border-b border-gray-50 last:border-0"
                    >
                      <span className="font-medium text-gray-900">{s.title}</span>
                      <span className="text-xs text-gray-500 shrink-0 bg-gray-100 px-2 py-0.5 rounded-full">
                        {s.grade_level}{s.academic_year ? ` · ${s.academic_year}` : ''}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {selectedSection && (
            <p className="mt-1.5 text-xs text-indigo-700 flex items-center gap-1">
              <svg className="w-3.5 h-3.5 text-green-500 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
              </svg>
              <span><span className="font-semibold">{selectedSection.title}</span> — {selectedSection.grade_level}{selectedSection.academic_year ? ` (${selectedSection.academic_year})` : ''}</span>
            </p>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="px-6 pb-2 shrink-0">
            <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-200 flex justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={submitting || !selectedSection}
            onClick={handleSubmit}
            className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-500 transition-colors disabled:opacity-50"
          >
            {submitting ? 'Saving…' : isExisting ? 'Re-enroll' : 'Accept & save student'}
          </button>
        </div>
      </div>
    </div>
  )
}
