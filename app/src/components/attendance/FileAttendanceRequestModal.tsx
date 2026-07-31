import React, { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { Button } from '../button'
import { Input } from '../input'
import { Select } from '../select'
import { staffAttendanceRequestService } from '../../services/staffAttendanceRequestService'
import { staffService } from '../../services/staffService'
import { errorMessage } from '../../pages/HRIS/Payroll/helpers'
import { KIND_HELP, KIND_LABELS } from './attendanceRequestKinds'
import type { AttendanceRequestKind, CreateAttendanceRequestData } from '../../types'

const todayYmd = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

interface RequestForm {
  user_id: string
  date_from: string
  date_to: string
  kind: AttendanceRequestKind
  reason: string
  credited_time_in: string
  credited_time_out: string
}

/** What the caller may pre-fill — everything but the reason, which is theirs to write. */
export interface AttendanceRequestPrefill {
  date_from?: string
  date_to?: string
  kind?: AttendanceRequestKind
  credited_time_in?: string | null
  credited_time_out?: string | null
}

const buildForm = (prefill?: AttendanceRequestPrefill): RequestForm => {
  const from = prefill?.date_from || todayYmd()

  return {
    user_id: '',
    date_from: from,
    date_to: prefill?.date_to || from,
    kind: prefill?.kind || 'early_out',
    reason: '',
    credited_time_in: prefill?.credited_time_in || '',
    credited_time_out: prefill?.credited_time_out || '',
  }
}

interface FileAttendanceRequestModalProps {
  /** Re-mount the modal (a fresh `key`) to pick up a different prefill. */
  prefill?: AttendanceRequestPrefill
  /** Approvers only: let the request be filed on another staff member's behalf. */
  allowOtherStaff?: boolean
  onClose: () => void
  onSubmitted?: () => void
}

/**
 * The one form for filing an attendance exception, shared by the HRIS
 * Attendance Requests page and the dashboard timesheet — so a day flagged on
 * the dashboard is filed exactly the way the HRIS page would file it.
 */
const FileAttendanceRequestModal: React.FC<FileAttendanceRequestModalProps> = ({
  prefill,
  allowOtherStaff = false,
  onClose,
  onSubmitted,
}) => {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<RequestForm>(() => buildForm(prefill))
  const [formError, setFormError] = useState<string | null>(null)

  const staffQuery = useQuery({
    queryKey: ['staffs', 'for-attendance-requests'],
    queryFn: () => staffService.getStaffs({ limit: 200 }),
    enabled: allowOtherStaff,
  })

  const createMutation = useMutation({
    mutationFn: (data: CreateAttendanceRequestData) => staffAttendanceRequestService.create(data),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['staff-attendance-requests'] })
      queryClient.invalidateQueries({ queryKey: ['my-timesheet'] })
      toast.success(response.message || 'Request submitted.')
      onSubmitted?.()
      onClose()
    },
    onError: (err: unknown) => setFormError(errorMessage(err, 'Failed to submit the request.')),
  })

  const submitForm = (event: React.FormEvent) => {
    event.preventDefault()
    setFormError(null)

    if (!form.reason.trim()) {
      setFormError('A reason is required.')
      return
    }
    if (form.date_to < form.date_from) {
      setFormError('The end date cannot be before the start date.')
      return
    }

    createMutation.mutate({
      user_id: allowOtherStaff && form.user_id ? form.user_id : null,
      date_from: form.date_from,
      date_to: form.date_to,
      kind: form.kind,
      reason: form.reason.trim(),
      credited_time_in: form.credited_time_in || null,
      credited_time_out: form.credited_time_out || null,
    })
  }

  const showCreditedTimes = form.kind === 'forgot_punch' || form.kind === 'official_business'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-gray-200 px-6 py-4">
          <h3 className="text-lg font-semibold text-gray-900">File an attendance request</h3>
          <p className="text-sm text-gray-500">
            Approved requests stop payroll from deducting for the day.
          </p>
        </div>
        <form onSubmit={submitForm} className="space-y-4 p-6">
          {allowOtherStaff && (
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Staff member</label>
              <Select
                value={form.user_id}
                onChange={(e) => setForm((prev) => ({ ...prev, user_id: e.target.value }))}
                className="w-full"
                options={[
                  { value: '', label: 'Myself' },
                  ...(staffQuery.data?.data || []).map((staff) => ({
                    value: staff.id,
                    label: [staff.first_name, staff.last_name].filter(Boolean).join(' ') || staff.email,
                  })),
                ]}
              />
              <p className="mt-1 text-xs text-gray-400">
                Filing as an approver records the request already approved.
              </p>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Type</label>
            <Select
              value={form.kind}
              onChange={(e) => setForm((prev) => ({ ...prev, kind: e.target.value as AttendanceRequestKind }))}
              className="w-full"
              options={(Object.keys(KIND_LABELS) as AttendanceRequestKind[]).map((kind) => ({
                value: kind,
                label: KIND_LABELS[kind],
              }))}
            />
            <p className="mt-1 text-xs text-gray-500">{KIND_HELP[form.kind]}</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">From</label>
              <Input
                type="date"
                value={form.date_from}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    date_from: e.target.value,
                    // Keep a single-day request single-day as the user types.
                    date_to: prev.date_to < e.target.value ? e.target.value : prev.date_to,
                  }))
                }
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">To</label>
              <Input
                type="date"
                value={form.date_to}
                min={form.date_from}
                onChange={(e) => setForm((prev) => ({ ...prev, date_to: e.target.value }))}
              />
            </div>
          </div>

          {showCreditedTimes && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Actual time in (optional)
                </label>
                <Input
                  type="time"
                  value={form.credited_time_in}
                  onChange={(e) => setForm((prev) => ({ ...prev, credited_time_in: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Actual time out (optional)
                </label>
                <Input
                  type="time"
                  value={form.credited_time_out}
                  onChange={(e) => setForm((prev) => ({ ...prev, credited_time_out: e.target.value }))}
                />
              </div>
              <p className="col-span-2 -mt-2 text-xs text-gray-400">
                Used only where the biometric has no punch. A real punch is never overwritten.
              </p>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Reason</label>
            <textarea
              rows={3}
              value={form.reason}
              onChange={(e) => setForm((prev) => ({ ...prev, reason: e.target.value }))}
              placeholder="e.g. Family emergency — left at 2:00 PM with the principal's permission."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>

          {formError && <p className="text-sm text-red-600">{formError}</p>}

          <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Submitting…' : 'Submit request'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default FileAttendanceRequestModal
