import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ClipboardList } from 'lucide-react'
import { admissionFormService } from '../../services/admissionFormService'
import { Switch } from '../../components/switch'
import { useAuth } from '../../hooks/useAuth'
import { useRoleAccess } from '../../hooks/useRoleAccess'
import type { AdmissionFormPayload, AdmissionFormSubmissionListItem } from '../../types'
import { AdmissionSubmissionDetailView } from './AdmissionSubmissionDetailView'
import { AcceptModal } from './AcceptModal'
import type { AcceptPayload } from './AcceptModal'
import { ConfirmationModal } from '../../components/ConfirmationModal'

function applicantLabel(payload: AdmissionFormPayload): string {
  const g = payload.general_information
  if (g.full_name?.trim()) return g.full_name.trim()
  const parts = [g.first_name, g.middle_name, g.surname].filter(Boolean).join(' ')
  return parts || '—'
}

function StatusBadge({ status }: { status: AdmissionFormSubmissionListItem['status'] }) {
  if (status === 'accepted') {
    return (
      <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
        Accepted
      </span>
    )
  }
  if (status === 'rejected') {
    return (
      <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
        Rejected
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
      Pending
    </span>
  )
}

const ADMISSION_FORMS_ROLES = ['principal', 'institution-administrator']

export default function AdmissionForms() {
  const navigate = useNavigate()
  const { hasAccess } = useRoleAccess(ADMISSION_FORMS_ROLES)
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [searchDraft, setSearchDraft] = useState('')
  const [statusFilter, setStatusFilter] = useState<'pending' | 'accepted' | 'rejected'>('pending')
  const [detail, setDetail] = useState<AdmissionFormSubmissionListItem | null>(null)
  const [acceptTarget, setAcceptTarget] = useState<AdmissionFormSubmissionListItem | null>(null)
  const [createTarget, setCreateTarget] = useState<AdmissionFormSubmissionListItem | null>(null)
  const [rejectTarget, setRejectTarget] = useState<AdmissionFormSubmissionListItem | null>(null)
  const [rejecting, setRejecting] = useState(false)

  const institutionId =
    user?.user_institutions?.find((ui: { is_default?: boolean }) => ui.is_default)?.institution_id
    ?? user?.user_institutions?.[0]?.institution_id

  useEffect(() => {
    if (!hasAccess) navigate('/dashboard')
  }, [hasAccess, navigate])

  const publicFormUrl = useMemo(() => {
    if (!institutionId || typeof window === 'undefined') return ''
    return `${window.location.origin}/admission/${institutionId}`
  }, [institutionId])

  const queryKey = ['admission-form-submissions', page, search, statusFilter, institutionId]

  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: () =>
      admissionFormService.list({
        page,
        per_page: 15,
        search: search || undefined,
        institution_id: institutionId,
        status: statusFilter,
      }),
    enabled: hasAccess && !!institutionId,
  })

  const { data: settingsRes } = useQuery({
    queryKey: ['admission-form-settings', institutionId],
    queryFn: () => admissionFormService.getSettings(),
    enabled: hasAccess && !!institutionId,
  })

  const formOpen = settingsRes?.data.admission_form_open ?? true

  const toggleFormOpen = useMutation({
    mutationFn: (open: boolean) => admissionFormService.updateSettings(open),
    onSuccess: (res) => {
      toast.success(res.message)
      queryClient.invalidateQueries({ queryKey: ['admission-form-settings', institutionId] })
    },
    onError: () => {
      toast.error('Could not update the admission form status.')
    },
  })

  const copyLink = async () => {
    if (!publicFormUrl) {
      toast.error('No institution context for this account.')
      return
    }
    try {
      await navigator.clipboard.writeText(publicFormUrl)
      toast.success('Admission form link copied.')
    } catch {
      toast.error('Could not copy link.')
    }
  }

  const openDetail = async (row: AdmissionFormSubmissionListItem) => {
    try {
      const res = await admissionFormService.getOne(row.id)
      if (res.success && res.data) setDetail(res.data)
    } catch {
      toast.error('Could not load submission.')
    }
  }

  const handleAccept = async (payload: AcceptPayload) => {
    if (!acceptTarget) return
    await admissionFormService.accept(acceptTarget.id, payload)
    toast.success('Student enrolled successfully.')
    setAcceptTarget(null)
    setDetail(null)
    queryClient.invalidateQueries({ queryKey })
  }

  const handleCreateStudent = async (payload: AcceptPayload) => {
    if (!createTarget) return
    await admissionFormService.createStudent(createTarget.id, {
      section_id: payload.section_id,
      first_name: payload.first_name ?? '',
      last_name: payload.last_name ?? '',
      middle_name: payload.middle_name,
      lrn: payload.lrn,
    })
    toast.success('Student record created.')
    setCreateTarget(null)
    setDetail(null)
    queryClient.invalidateQueries({ queryKey })
  }

  const handleReject = async () => {
    if (!rejectTarget) return
    setRejecting(true)
    try {
      await admissionFormService.reject(rejectTarget.id)
      toast.success('Submission rejected.')
      setRejectTarget(null)
      setDetail(null)
      queryClient.invalidateQueries({ queryKey })
    } catch {
      toast.error('Failed to reject submission.')
    } finally {
      setRejecting(false)
    }
  }

  if (!hasAccess) return null

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
              <ClipboardList className="w-8 h-8 text-indigo-600" />
              Admission forms
            </h1>
            <p className="mt-2 text-gray-600">
              Submissions from the public online admission form (not student records).
            </p>
          </div>
          {publicFormUrl ? (
            <div className="flex flex-col items-stretch gap-3 sm:items-end">
              <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-2.5 shadow-sm">
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-gray-900">
                    Form is {formOpen ? 'open' : 'closed'}
                  </span>
                  <span className="text-xs text-gray-500">
                    {formOpen
                      ? 'Applicants can access and submit the form.'
                      : 'Applicants cannot access or submit the form.'}
                  </span>
                </div>
                <Switch
                  color="indigo"
                  checked={formOpen}
                  disabled={toggleFormOpen.isPending}
                  onChange={(v) => toggleFormOpen.mutate(!!v)}
                  aria-label="Toggle admission form open or closed"
                />
              </div>
              <button
                type="button"
                onClick={copyLink}
                className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
              >
                Copy public form link
              </button>
            </div>
          ) : null}
        </div>

        {/* Status tabs */}
        <div className="flex gap-1 mb-4 border-b border-gray-200">
          {(['pending', 'accepted', 'rejected'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => { setStatusFilter(s); setPage(1) }}
              className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors ${
                statusFilter === s
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="bg-white rounded-lg shadow-sm ring-1 ring-gray-200 p-4 mb-6 flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="flex-1">
            <label htmlFor="adm-search" className="block text-sm font-medium text-gray-700 mb-1">
              Search name or LRN
            </label>
            <input
              id="adm-search"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setSearch(searchDraft)
                  setPage(1)
                }
              }}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              placeholder="Search…"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              setSearch(searchDraft)
              setPage(1)
            }}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Search
          </button>
        </div>

        {!institutionId ? (
          <p className="text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm">
            No institution is linked to this account, so admission submissions cannot be listed. Contact an administrator
            if you need access.
          </p>
        ) : isLoading ? (
          <p className="text-gray-600">Loading…</p>
        ) : error ? (
          <p className="text-red-600">Failed to load submissions.</p>
        ) : (
          <>
            <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Applicant
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Grade level
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Exists
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Previous section
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Submitted
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {(data?.data ?? []).map((row) => (
                    <tr key={row.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900">{applicantLabel(row.payload)}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{row.payload.grade_level}</td>
                      <td className="px-4 py-3 text-sm">
                        {row.student_match ? (
                          <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                            Exists
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">
                            New
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {row.student_match?.section
                          ? `${row.student_match.section.title} (${row.student_match.section.grade_level}) — ${row.student_match.section.academic_year}`
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <StatusBadge status={row.status ?? 'pending'} />
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {row.created_at ? new Date(row.created_at).toLocaleString() : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => openDetail(row)}
                            className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
                          >
                            View
                          </button>
                          {(row.status ?? 'pending') === 'pending' && (
                            <>
                              <button
                                type="button"
                                onClick={async () => {
                                  const res = await admissionFormService.getOne(row.id)
                                  if (res.success && res.data) setAcceptTarget(res.data)
                                }}
                                className="inline-flex items-center rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-green-500 transition-colors"
                              >
                                Accept
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  const res = await admissionFormService.getOne(row.id)
                                  if (res.success && res.data) setRejectTarget(res.data)
                                }}
                                className="inline-flex items-center rounded-md bg-red-50 border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 shadow-sm hover:bg-red-100 transition-colors"
                              >
                                Reject
                              </button>
                            </>
                          )}
                          {(row.status ?? 'pending') === 'accepted' && (
                            <button
                              type="button"
                              onClick={async () => {
                                const res = await admissionFormService.getOne(row.id)
                                if (res.success && res.data) setCreateTarget(res.data)
                              }}
                              className="inline-flex items-center rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 shadow-sm hover:bg-amber-100 transition-colors"
                            >
                              Create student
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {data?.pagination && data.pagination.total > 0 ? (
              <div className="mt-6 flex justify-center items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-2 text-sm border rounded-md disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="text-sm text-gray-600">
                  Page {data.pagination.current_page} of {data.pagination.last_page}
                </span>
                <button
                  type="button"
                  disabled={page >= data.pagination.last_page}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-3 py-2 text-sm border rounded-md disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            ) : (
              <p className="text-gray-600 mt-4">No submissions yet.</p>
            )}
          </>
        )}
      </div>

      {/* Detail modal */}
      {detail ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          role="dialog"
          aria-modal="true"
          aria-labelledby="adm-detail-title"
        >
          <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <h2 id="adm-detail-title" className="text-lg font-semibold text-gray-900">
                  Submission detail
                </h2>
                <StatusBadge status={detail.status ?? 'pending'} />
              </div>
              <button
                type="button"
                onClick={() => setDetail(null)}
                className="text-gray-500 hover:text-gray-700 text-sm font-medium"
              >
                Close
              </button>
            </div>
            <div className="px-6 py-4 overflow-y-auto text-sm flex-1">
              {detail.institution ? (
                <p className="text-gray-600 mb-4">
                  <span className="font-medium text-gray-800">Institution:</span> {detail.institution.title}
                </p>
              ) : null}
              {detail.created_at ? (
                <p className="text-gray-600 mb-4">
                  <span className="font-medium text-gray-800">Submitted:</span>{' '}
                  {new Date(detail.created_at).toLocaleString()}
                </p>
              ) : null}
              {detail.student_match?.section && (
                <p className="text-gray-600 mb-4">
                  <span className="font-medium text-gray-800">Previous section:</span>{' '}
                  {detail.student_match.section.title} ({detail.student_match.section.grade_level}) — {detail.student_match.section.academic_year}
                </p>
              )}
              <AdmissionSubmissionDetailView payload={detail.payload} />
            </div>
            <div className="px-6 py-3 border-t border-gray-200 flex justify-between items-center gap-2">
              <div className="flex gap-2">
                {(detail.status ?? 'pending') === 'pending' && (
                  <>
                    <button
                      type="button"
                      onClick={() => setAcceptTarget(detail)}
                      className="inline-flex items-center rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-green-500 transition-colors"
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      onClick={() => setRejectTarget(detail)}
                      className="inline-flex items-center rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 shadow-sm hover:bg-red-100 transition-colors"
                    >
                      Reject
                    </button>
                  </>
                )}
                {(detail.status ?? 'pending') === 'accepted' && (
                  <button
                    type="button"
                    onClick={() => setCreateTarget(detail)}
                    className="inline-flex items-center rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 shadow-sm hover:bg-amber-100 transition-colors"
                  >
                    Create student
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setDetail(null)}
                className="inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Accept modal */}
      {acceptTarget ? (
        <AcceptModal
          submission={acceptTarget}
          onConfirm={handleAccept}
          onClose={() => setAcceptTarget(null)}
        />
      ) : null}

      {/* Create-student recovery modal (Accepted tab) */}
      {createTarget ? (
        <AcceptModal
          submission={createTarget}
          variant="recreate"
          onConfirm={handleCreateStudent}
          onClose={() => setCreateTarget(null)}
        />
      ) : null}

      {/* Reject confirmation modal */}
      <ConfirmationModal
        isOpen={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        onConfirm={handleReject}
        title="Reject submission"
        message="Are you sure you want to reject this submission? This cannot be undone."
        confirmText="Reject"
        cancelText="Cancel"
        variant="danger"
        loading={rejecting}
      />
    </div>
  )
}
