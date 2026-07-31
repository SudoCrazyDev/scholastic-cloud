import React, { useMemo, useState } from 'react'
import { Ban, CalendarClock, CheckCircle2, XCircle } from 'lucide-react'
import { PlusIcon } from '@heroicons/react/24/outline'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { Button } from '../../components/button'
import { Select } from '../../components/select'
import FileAttendanceRequestModal from '../../components/attendance/FileAttendanceRequestModal'
import { KIND_LABELS } from '../../components/attendance/attendanceRequestKinds'
import { useAuth } from '../../hooks/useAuth'
import { staffAttendanceRequestService } from '../../services/staffAttendanceRequestService'
import type { AttendanceRequestStatus, StaffAttendanceRequest } from '../../types'
import { errorMessage, shortDate } from './Payroll/helpers'

const APPROVER_ROLES = ['principal', 'institution-administrator', 'super-administrator']

type Tab = 'mine' | 'review'

const STATUS_STYLES: Record<AttendanceRequestStatus, string> = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  disapproved: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-500',
  voided: 'bg-gray-200 text-gray-600 line-through',
}

const dateRange = (request: StaffAttendanceRequest) =>
  request.date_from === request.date_to
    ? shortDate(request.date_from)
    : `${shortDate(request.date_from)} – ${shortDate(request.date_to)}`

/** Compact summary of what an approved request actually does to pay. */
const EffectChips: React.FC<{ request: StaffAttendanceRequest }> = ({ request }) => {
  // The waive flags survive a void, but payroll stops reading them — so say so
  // rather than showing chips that look like they are still in force.
  if (request.status === 'voided') {
    return <span className="text-xs text-gray-400">No longer applied</span>
  }

  const chips: string[] = []
  if (request.waive_late) chips.push('Late waived')
  if (request.waive_undertime) chips.push('Undertime waived')
  if (request.pay_full_day) chips.push('Full-day pay')

  if (chips.length === 0) return <span className="text-xs text-gray-400">No pay effect</span>

  return (
    <div className="flex flex-wrap gap-1">
      {chips.map((chip) => (
        <span
          key={chip}
          className="rounded-full bg-primary-50 px-2 py-0.5 text-[11px] font-medium text-primary-700"
        >
          {chip}
        </span>
      ))}
    </div>
  )
}

const AttendanceRequests: React.FC = () => {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const canApprove = APPROVER_ROLES.includes(user?.role?.slug || '')

  const [tab, setTab] = useState<Tab>(canApprove ? 'review' : 'mine')
  const [showForm, setShowForm] = useState(false)
  const [reviewing, setReviewing] = useState<StaffAttendanceRequest | null>(null)
  const [reviewNote, setReviewNote] = useState('')
  const [voiding, setVoiding] = useState<StaffAttendanceRequest | null>(null)
  const [voidNote, setVoidNote] = useState('')
  const [reviewFlags, setReviewFlags] = useState({
    waive_late: false,
    waive_undertime: false,
    pay_full_day: false,
  })
  const [statusFilter, setStatusFilter] = useState<AttendanceRequestStatus | ''>('')

  const requestsQuery = useQuery({
    queryKey: ['staff-attendance-requests', tab, statusFilter],
    queryFn: () =>
      staffAttendanceRequestService.list({
        scope: tab === 'mine' ? 'mine' : 'all',
        status: statusFilter || undefined,
      }),
  })

  const requests = useMemo(() => {
    const rows = requestsQuery.data?.data || []
    return tab === 'review' ? rows.filter((row) => row.status === 'pending' || statusFilter) : rows
  }, [requestsQuery.data, tab, statusFilter])

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['staff-attendance-requests'] })
  }

  const approveMutation = useMutation({
    mutationFn: (payload: { id: string }) =>
      staffAttendanceRequestService.approve(payload.id, {
        ...reviewFlags,
        review_note: reviewNote.trim() || null,
      }),
    onSuccess: (response) => {
      invalidate()
      setReviewing(null)
      toast.success(response.message || 'Request approved.')
    },
    onError: (err: unknown) => toast.error(errorMessage(err, 'Failed to approve the request.')),
  })

  const disapproveMutation = useMutation({
    mutationFn: (payload: { id: string; note: string }) =>
      staffAttendanceRequestService.disapprove(payload.id, payload.note),
    onSuccess: () => {
      invalidate()
      setReviewing(null)
      toast.success('Request disapproved.')
    },
    onError: (err: unknown) => toast.error(errorMessage(err, 'Failed to disapprove the request.')),
  })

  const cancelMutation = useMutation({
    mutationFn: (id: string) => staffAttendanceRequestService.cancel(id),
    onSuccess: () => {
      invalidate()
      toast.success('Request cancelled.')
    },
    onError: (err: unknown) => toast.error(errorMessage(err, 'Failed to cancel the request.')),
  })

  const voidMutation = useMutation({
    mutationFn: (payload: { id: string; note: string }) =>
      staffAttendanceRequestService.void(payload.id, payload.note),
    onSuccess: (response) => {
      invalidate()
      setVoiding(null)
      toast.success(response.message || 'Approval voided.')
    },
    onError: (err: unknown) => toast.error(errorMessage(err, 'Failed to void the approval.')),
  })

  const openVoid = (request: StaffAttendanceRequest) => {
    setVoidNote('')
    setVoiding(request)
  }

  const openReview = (request: StaffAttendanceRequest) => {
    setReviewFlags({
      waive_late: request.waive_late,
      waive_undertime: request.waive_undertime,
      pay_full_day: request.pay_full_day,
    })
    setReviewNote('')
    setReviewing(request)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-5 w-5 text-primary-600" />
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Attendance Requests</h1>
            <p className="text-sm text-gray-500">
              Excuse a late arrival, early out, or missed punch so payroll does not deduct for it.
            </p>
          </div>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <PlusIcon className="h-4 w-4" />
          File a request
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200">
        <div className="flex gap-1">
          {canApprove && (
            <button
              type="button"
              onClick={() => setTab('review')}
              className={`border-b-2 px-4 py-2 text-sm font-medium ${
                tab === 'review'
                  ? 'border-primary-600 text-primary-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              For Review
            </button>
          )}
          <button
            type="button"
            onClick={() => setTab('mine')}
            className={`border-b-2 px-4 py-2 text-sm font-medium ${
              tab === 'mine'
                ? 'border-primary-600 text-primary-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            My Requests
          </button>
        </div>
        <div className="pb-2">
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as AttendanceRequestStatus | '')}
            inputSize="sm"
            options={[
              { value: '', label: tab === 'review' ? 'Pending only' : 'All statuses' },
              { value: 'pending', label: 'Pending' },
              { value: 'approved', label: 'Approved' },
              { value: 'disapproved', label: 'Disapproved' },
              { value: 'cancelled', label: 'Cancelled' },
              { value: 'voided', label: 'Voided' },
            ]}
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="text-left text-xs font-medium uppercase tracking-wide text-gray-500">
              {tab === 'review' && <th className="px-4 py-2.5">Staff</th>}
              <th className="px-4 py-2.5">Date(s)</th>
              <th className="px-4 py-2.5">Type</th>
              <th className="px-4 py-2.5">Reason</th>
              <th className="px-4 py-2.5">Effect on pay</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {requestsQuery.isLoading && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                  Loading requests…
                </td>
              </tr>
            )}
            {!requestsQuery.isLoading && requests.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                  {tab === 'review' ? 'Nothing waiting for review.' : 'You have not filed any requests.'}
                </td>
              </tr>
            )}
            {requests.map((request) => (
              <tr key={request.id} className="border-t border-gray-100 align-top">
                {tab === 'review' && (
                  <td className="px-4 py-3 font-medium text-gray-900">{request.staff_name || '—'}</td>
                )}
                <td className="px-4 py-3 whitespace-nowrap text-gray-700">{dateRange(request)}</td>
                <td className="px-4 py-3 text-gray-700">
                  {KIND_LABELS[request.kind]}
                  {(request.credited_time_in || request.credited_time_out) && (
                    <div className="text-xs text-gray-400">
                      Credited {request.credited_time_in || '—'} → {request.credited_time_out || '—'}
                    </div>
                  )}
                </td>
                <td className="max-w-xs px-4 py-3 text-gray-600">
                  {request.reason}
                  {request.review_note && (
                    <div className="mt-1 text-xs italic text-gray-400">
                      Reviewer: {request.review_note}
                    </div>
                  )}
                  {request.void_note && (
                    <div className="mt-1 text-xs italic text-red-400">
                      Voided: {request.void_note}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <EffectChips request={request} />
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[request.status]}`}
                  >
                    {request.status}
                  </span>
                  {request.status === 'voided' && request.voided_by_name ? (
                    <div className="mt-1 text-[11px] text-gray-400">by {request.voided_by_name}</div>
                  ) : (
                    request.reviewed_by_name && (
                      <div className="mt-1 text-[11px] text-gray-400">by {request.reviewed_by_name}</div>
                    )
                  )}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {request.status === 'pending' && canApprove && tab === 'review' && (
                    <Button size="sm" variant="outline" onClick={() => openReview(request)}>
                      Review
                    </Button>
                  )}
                  {request.status === 'approved' && canApprove && (
                    <Button size="sm" variant="ghost" onClick={() => openVoid(request)}>
                      Void
                    </Button>
                  )}
                  {request.status === 'pending' && tab === 'mine' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={cancelMutation.isPending}
                      onClick={() => cancelMutation.mutate(request.id)}
                    >
                      Cancel
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <FileAttendanceRequestModal
          allowOtherStaff={canApprove}
          onClose={() => setShowForm(false)}
        />
      )}

      {reviewing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setReviewing(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-gray-200 px-6 py-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Review — {reviewing.staff_name || 'Staff'}
              </h3>
              <p className="text-sm text-gray-500">
                {KIND_LABELS[reviewing.kind]} · {dateRange(reviewing)}
              </p>
            </div>
            <div className="space-y-4 p-6">
              <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-700">{reviewing.reason}</div>

              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
                  Effect on pay
                </p>
                <div className="space-y-2">
                  {(
                    [
                      ['waive_late', 'Do not deduct for arriving late'],
                      ['waive_undertime', 'Do not deduct for leaving early'],
                      ['pay_full_day', 'Pay the full day even with no punches'],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={reviewFlags[key]}
                        onChange={(e) =>
                          setReviewFlags((prev) => ({ ...prev, [key]: e.target.checked }))
                        }
                        className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Note {`(required to disapprove)`}
                </label>
                <textarea
                  rows={2}
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>

              <p className="text-xs text-gray-400">
                Approving does not change an existing payslip on its own — regenerate the payroll
                period to apply it.
              </p>

              <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
                <Button type="button" variant="ghost" onClick={() => setReviewing(null)}>
                  Close
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={disapproveMutation.isPending || !reviewNote.trim()}
                  onClick={() =>
                    disapproveMutation.mutate({ id: reviewing.id, note: reviewNote.trim() })
                  }
                >
                  <XCircle className="h-4 w-4" />
                  Disapprove
                </Button>
                <Button
                  type="button"
                  disabled={approveMutation.isPending}
                  onClick={() => approveMutation.mutate({ id: reviewing.id })}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {approveMutation.isPending ? 'Approving…' : 'Approve'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {voiding && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setVoiding(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-gray-200 px-6 py-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Void approval — {voiding.staff_name || 'Staff'}
              </h3>
              <p className="text-sm text-gray-500">
                {KIND_LABELS[voiding.kind]} · {dateRange(voiding)}
              </p>
            </div>
            <div className="space-y-4 p-6">
              <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-700">{voiding.reason}</div>

              <p className="text-sm text-gray-600">
                The request stays on record but stops counting towards pay, so this day is charged
                normally again. {voiding.staff_name || 'The staff member'} may file a corrected
                request for these dates.
              </p>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Reason for voiding (required)
                </label>
                <textarea
                  rows={3}
                  value={voidNote}
                  onChange={(e) => setVoidNote(e.target.value)}
                  placeholder="Why this approval is being taken back"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>

              <p className="text-xs text-gray-400">
                Voiding does not change an existing payslip on its own — regenerate the payroll
                period to apply it.
              </p>

              <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
                <Button type="button" variant="ghost" onClick={() => setVoiding(null)}>
                  Close
                </Button>
                <Button
                  type="button"
                  color="danger"
                  disabled={voidMutation.isPending || !voidNote.trim()}
                  onClick={() => voidMutation.mutate({ id: voiding.id, note: voidNote.trim() })}
                >
                  <Ban className="h-4 w-4" />
                  {voidMutation.isPending ? 'Voiding…' : 'Void approval'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AttendanceRequests
