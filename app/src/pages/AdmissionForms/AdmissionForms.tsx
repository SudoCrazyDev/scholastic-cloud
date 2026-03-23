import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ClipboardList } from 'lucide-react'
import { admissionFormService } from '../../services/admissionFormService'
import { useAuth } from '../../hooks/useAuth'
import { useRoleAccess } from '../../hooks/useRoleAccess'
import type { AdmissionFormPayload, AdmissionFormSubmissionListItem } from '../../types'
import { AdmissionSubmissionDetailView } from './AdmissionSubmissionDetailView'

function applicantLabel(payload: AdmissionFormPayload): string {
  const g = payload.general_information
  if (g.full_name?.trim()) return g.full_name.trim()
  const parts = [g.first_name, g.middle_name, g.surname].filter(Boolean).join(' ')
  return parts || '—'
}

const ADMISSION_FORMS_ROLES = ['principal', 'institution-administrator']

export default function AdmissionForms() {
  const navigate = useNavigate()
  const { hasAccess } = useRoleAccess(ADMISSION_FORMS_ROLES)
  const { user } = useAuth()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [searchDraft, setSearchDraft] = useState('')
  const [detail, setDetail] = useState<AdmissionFormSubmissionListItem | null>(null)

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

  const { data, isLoading, error } = useQuery({
    queryKey: ['admission-form-submissions', page, search, institutionId],
    queryFn: () =>
      admissionFormService.list({
        page,
        per_page: 15,
        search: search || undefined,
        institution_id: institutionId,
      }),
    enabled: hasAccess && !!institutionId,
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
            <button
              type="button"
              onClick={copyLink}
              className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
            >
              Copy public form link
            </button>
          ) : null}
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
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {row.created_at ? new Date(row.created_at).toLocaleString() : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => openDetail(row)}
                          className="text-indigo-600 text-sm font-medium hover:text-indigo-500"
                        >
                          View
                        </button>
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

      {detail ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          role="dialog"
          aria-modal="true"
          aria-labelledby="adm-detail-title"
        >
          <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h2 id="adm-detail-title" className="text-lg font-semibold text-gray-900">
                Submission detail
              </h2>
              <button
                type="button"
                onClick={() => setDetail(null)}
                className="text-gray-500 hover:text-gray-700 text-sm font-medium"
              >
                Close
              </button>
            </div>
            <div className="px-6 py-4 overflow-y-auto text-sm">
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
              <AdmissionSubmissionDetailView payload={detail.payload} />
            </div>
            <div className="px-6 py-3 border-t border-gray-200 flex justify-end">
              <button
                type="button"
                onClick={() => setDetail(null)}
                className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
