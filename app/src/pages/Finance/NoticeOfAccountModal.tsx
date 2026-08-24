import React, { useMemo, useState } from 'react'
import { PDFDownloadLink } from '@react-pdf/renderer'
import { Button } from '../../components/button'
import { Select } from '../../components/select'
import { StudentNOAPDF } from '../../components/StudentNOAPDF'
import { summarizeMonthlyNOA } from '../../components/studentNOAStatement'
import type { NOAScopeMode } from '../../components/studentNOAStatement'
import type { Student, StudentNOAResponse } from '../../types'

interface NoticeOfAccountModalProps {
  data: StudentNOAResponse
  student: Student
  academicYear: string
  institutionName?: string
  logoUrl?: string | null
  onClose: () => void
}

const formatCurrency = (amount?: number | null) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(Number(amount || 0))

const sanitizeFileName = (value: string) => value.replace(/[^a-zA-Z0-9-_]/g, '-')

export const NoticeOfAccountModal: React.FC<NoticeOfAccountModalProps> = ({
  data,
  student,
  academicYear,
  institutionName,
  logoUrl,
  onClose,
}) => {
  const installments = useMemo(() => data.installments ?? [], [data.installments])

  // The period the cashier most likely means: the one falling in the current month,
  // otherwise the oldest that still owes money, otherwise the last of the schedule.
  const defaultSequence = useMemo(() => {
    if (!installments.length) return null
    const now = new Date()
    const nowKey = now.getFullYear() * 12 + now.getMonth()
    const thisMonth = installments.find((installment) => {
      const due = new Date(`${installment.due_date}T00:00:00`)
      if (Number.isNaN(due.getTime())) return false
      return due.getFullYear() * 12 + due.getMonth() === nowKey
    })
    if (thisMonth) return thisMonth.sequence
    const firstUnpaid = installments.find(
      (installment) => Number(installment.outstanding_amount || 0) > 0
    )
    return (firstUnpaid ?? installments[installments.length - 1]).sequence
  }, [installments])

  const [scope, setScope] = useState<NOAScopeMode>('total')
  const [sequence, setSequence] = useState<number | null>(defaultSequence)

  const monthOptions = useMemo(
    () =>
      installments.map((installment) => ({
        value: String(installment.sequence),
        label: installment.label,
      })),
    [installments]
  )

  const preview = scope === 'month' ? summarizeMonthlyNOA(data, sequence) : null
  const canPrintMonth = installments.length > 0

  const fileName = sanitizeFileName(
    preview
      ? `NOA-${student.last_name}-${student.first_name}-${academicYear}-${preview.selected.label}`
      : `NOA-${student.last_name}-${student.first_name}-${academicYear}`
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-900">Download Notice of Account</h3>
          <p className="text-sm text-gray-500 mt-1">
            Choose what the notice should bill: the whole academic year, or a single month.
          </p>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="grid gap-2">
            <button
              type="button"
              onClick={() => setScope('total')}
              className={`text-left rounded-lg border px-4 py-3 transition ${
                scope === 'total'
                  ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-500'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <span className="block text-sm font-medium text-gray-900">Total balance</span>
              <span className="block text-xs text-gray-500 mt-0.5">
                Full statement for {academicYear} — all assessed fees, discounts, payments, and the
                outstanding balance.
              </span>
            </button>

            <button
              type="button"
              disabled={!canPrintMonth}
              onClick={() => setScope('month')}
              className={`text-left rounded-lg border px-4 py-3 transition disabled:opacity-60 disabled:cursor-not-allowed ${
                scope === 'month'
                  ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-500'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <span className="block text-sm font-medium text-gray-900">Specific month</span>
              <span className="block text-xs text-gray-500 mt-0.5">
                {canPrintMonth
                  ? 'Bills one period together with every earlier month still unpaid.'
                  : 'Unavailable — this student has no payment plan for this academic year.'}
              </span>
            </button>
          </div>

          {scope === 'month' && canPrintMonth && (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Month</label>
                <Select
                  value={sequence != null ? String(sequence) : ''}
                  onChange={(e) => setSequence(Number(e.target.value))}
                  options={monthOptions}
                />
              </div>

              {preview && (
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 space-y-1.5 text-sm">
                  {preview.balanceForward > 0 && (
                    <div className="flex justify-between text-red-700">
                      <span>Balance forward (previous academic year)</span>
                      <span className="tabular-nums">
                        {formatCurrency(preview.balanceForward)}
                      </span>
                    </div>
                  )}
                  {preview.arrears.map((installment) => (
                    <div
                      key={installment.sequence}
                      className="flex justify-between text-red-700"
                    >
                      <span>{installment.label} — unpaid</span>
                      <span className="tabular-nums">
                        {formatCurrency(installment.outstanding_amount)}
                      </span>
                    </div>
                  ))}
                  <div className="flex justify-between text-gray-700">
                    <span>{preview.selected.label} — this period</span>
                    <span className="tabular-nums">
                      {formatCurrency(preview.selected.outstanding_amount)}
                    </span>
                  </div>
                  <div className="flex justify-between font-semibold text-gray-900 border-t border-gray-200 pt-1.5">
                    <span>Total amount due</span>
                    <span className="tabular-nums">{formatCurrency(preview.totalDue)}</span>
                  </div>
                  {preview.otherFees.length > 0 && (
                    <div className="flex justify-between text-xs text-gray-500 pt-1">
                      <span>
                        Other fees ({preview.otherFees.length}) — listed separately, not in the
                        total
                      </span>
                      <span className="tabular-nums">
                        {formatCurrency(preview.otherFeesOutstanding)}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
          {/* Remounted per selection so the blob is rebuilt for the scope being printed.
              The modal stays open on click: unmounting it mid-click would cancel the
              anchor's download before the browser acts on it. */}
          <PDFDownloadLink
            key={`${scope}-${sequence ?? 'all'}-${logoUrl ? 'logo' : 'nologo'}`}
            document={
              <StudentNOAPDF
                data={data}
                institutionName={institutionName}
                logoUrl={logoUrl}
                scope={scope}
                installmentSequence={sequence}
              />
            }
            fileName={fileName}
          >
            {({ loading }) => (
              <Button type="button" disabled={loading}>
                {loading ? 'Preparing...' : 'Download PDF'}
              </Button>
            )}
          </PDFDownloadLink>
        </div>
      </div>
    </div>
  )
}

export default NoticeOfAccountModal
