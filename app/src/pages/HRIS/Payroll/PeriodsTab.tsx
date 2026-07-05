import React, { useMemo, useState } from 'react'
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  LockClosedIcon,
  LockOpenIcon,
  PencilSquareIcon,
  PlusIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { Button } from '../../../components/button'
import { Input } from '../../../components/input'
import { ConfirmationModal } from '../../../components'
import { payrollService } from '../../../services/payrollService'
import type { CreatePayrollPeriodData, PayrollPeriod, PayslipSummary } from '../../../types'
import { errorMessage, peso, shortDate } from './helpers'
import PayslipDetail from './PayslipDetail'

interface PeriodForm {
  name: string
  date_from: string
  date_to: string
}

const emptyForm = (): PeriodForm => ({ name: '', date_from: '', date_to: '' })

const statusBadge = (period: PayrollPeriod) =>
  period.status === 'finalized' ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
      <CheckCircleIcon className="h-3.5 w-3.5" />
      Finalized{period.paid_on ? ` · paid ${shortDate(period.paid_on)}` : ''}
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
      Draft
    </span>
  )

const PeriodsTab: React.FC = () => {
  const queryClient = useQueryClient()

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<PeriodForm>(emptyForm())
  const [formError, setFormError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<PayrollPeriod | null>(null)
  const [finalizing, setFinalizing] = useState<PayrollPeriod | null>(null)
  const [paidOn, setPaidOn] = useState('')

  // Drill-down: selected period → payslip list; selected payslip → detail sheet
  const [openPeriod, setOpenPeriod] = useState<PayrollPeriod | null>(null)
  const [openPayslipId, setOpenPayslipId] = useState<string | null>(null)

  const periodsQuery = useQuery({
    queryKey: ['payroll-periods'],
    queryFn: () => payrollService.getPeriods(),
  })

  const periods = useMemo<PayrollPeriod[]>(() => periodsQuery.data?.data || [], [periodsQuery.data])

  // Keep the open period fresh after mutations (generate/finalize/reopen).
  const currentPeriod = useMemo(
    () => (openPeriod ? periods.find((p) => p.id === openPeriod.id) ?? openPeriod : null),
    [openPeriod, periods]
  )

  const payslipsQuery = useQuery({
    queryKey: ['payroll-payslips', currentPeriod?.id],
    queryFn: () => payrollService.getPayslips(currentPeriod!.id),
    enabled: !!currentPeriod,
  })

  const payslips = useMemo<PayslipSummary[]>(
    () => payslipsQuery.data?.data || [],
    [payslipsQuery.data]
  )

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['payroll-periods'] })
    queryClient.invalidateQueries({ queryKey: ['payroll-payslips'] })
  }

  const saveMutation = useMutation({
    mutationFn: (payload: { id: string | null; data: CreatePayrollPeriodData }) =>
      payload.id
        ? payrollService.updatePeriod(payload.id, payload.data)
        : payrollService.createPeriod(payload.data),
    onSuccess: (_, payload) => {
      invalidate()
      setShowForm(false)
      toast.success(payload.id ? 'Period updated.' : 'Period created.')
    },
    onError: (err: unknown) => {
      const message = errorMessage(err, 'Failed to save period.')
      setFormError(message)
      toast.error(message)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => payrollService.deletePeriod(id),
    onSuccess: () => {
      invalidate()
      setDeleting(null)
      toast.success('Period deleted.')
    },
    onError: (err: unknown) => {
      setDeleting(null)
      toast.error(errorMessage(err, 'Failed to delete period.'))
    },
  })

  const generateMutation = useMutation({
    mutationFn: (id: string) => payrollService.generatePayslips(id),
    onSuccess: (result) => {
      invalidate()
      toast.success(result.message || 'Payslips generated.')
    },
    onError: (err: unknown) => {
      toast.error(errorMessage(err, 'Failed to generate payslips.'))
    },
  })

  const finalizeMutation = useMutation({
    mutationFn: (payload: { id: string; paidOn?: string }) =>
      payrollService.finalizePeriod(payload.id, payload.paidOn),
    onSuccess: () => {
      invalidate()
      setFinalizing(null)
      toast.success('Period finalized.')
    },
    onError: (err: unknown) => {
      setFinalizing(null)
      toast.error(errorMessage(err, 'Failed to finalize period.'))
    },
  })

  const reopenMutation = useMutation({
    mutationFn: (id: string) => payrollService.reopenPeriod(id),
    onSuccess: () => {
      invalidate()
      toast.success('Period reopened.')
    },
    onError: (err: unknown) => {
      toast.error(errorMessage(err, 'Failed to reopen period.'))
    },
  })

  const openCreate = () => {
    const now = new Date()
    const first = new Date(now.getFullYear(), now.getMonth(), 1)
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    const ymd = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    setForm({
      name: now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      date_from: ymd(first),
      date_to: ymd(last),
    })
    setEditingId(null)
    setFormError(null)
    setShowForm(true)
  }

  const openEdit = (period: PayrollPeriod) => {
    setForm({ name: period.name, date_from: period.date_from, date_to: period.date_to })
    setEditingId(period.id)
    setFormError(null)
    setShowForm(true)
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    saveMutation.mutate({ id: editingId, data: form })
  }

  // ---- Payslip detail view ----
  if (currentPeriod && openPayslipId) {
    return (
      <PayslipDetail
        payslipId={openPayslipId}
        periodFinalized={currentPeriod.status === 'finalized'}
        onBack={() => setOpenPayslipId(null)}
      />
    )
  }

  // ---- Payslip list of one period ----
  if (currentPeriod) {
    const totals = payslips.reduce(
      (acc, p) => ({
        gross: acc.gross + p.gross_pay,
        deductions: acc.deductions + p.total_deductions,
        net: acc.net + p.net_pay,
      }),
      { gross: 0, deductions: 0, net: 0 }
    )

    return (
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setOpenPeriod(null)}>
              <ArrowLeftIcon className="h-4 w-4" />
              Back
            </Button>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{currentPeriod.name}</h2>
              <p className="text-sm text-gray-500">
                {shortDate(currentPeriod.date_from)} – {shortDate(currentPeriod.date_to)}
                <span className="ml-2">{statusBadge(currentPeriod)}</span>
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {currentPeriod.status === 'draft' && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => generateMutation.mutate(currentPeriod.id)}
                  disabled={generateMutation.isPending}
                >
                  <ArrowPathIcon className="h-4 w-4" />
                  {generateMutation.isPending
                    ? 'Generating…'
                    : currentPeriod.payslip_count > 0
                      ? 'Regenerate from attendance'
                      : 'Generate from attendance'}
                </Button>
                <Button
                  size="sm"
                  color="success"
                  onClick={() => {
                    setPaidOn(new Date().toISOString().slice(0, 10))
                    setFinalizing(currentPeriod)
                  }}
                  disabled={currentPeriod.payslip_count === 0}
                >
                  <LockClosedIcon className="h-4 w-4" />
                  Finalize
                </Button>
              </>
            )}
            {currentPeriod.status === 'finalized' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => reopenMutation.mutate(currentPeriod.id)}
                disabled={reopenMutation.isPending}
              >
                <LockOpenIcon className="h-4 w-4" />
                Reopen
              </Button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Designation</th>
                <th className="px-4 py-3 text-right">Daily Rate</th>
                <th className="px-4 py-3 text-right">Days</th>
                <th className="px-4 py-3 text-right">Hours</th>
                <th className="px-4 py-3 text-right">Salary Earned</th>
                <th className="px-4 py-3 text-right">Deductions</th>
                <th className="px-4 py-3 text-right">Net Cash</th>
              </tr>
            </thead>
            <tbody>
              {payslipsQuery.isLoading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-gray-400">
                    Loading payslips…
                  </td>
                </tr>
              ) : payslips.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-gray-400">
                    No payslips yet. Click "Generate from attendance" to build them from the
                    attendance logs.
                  </td>
                </tr>
              ) : (
                payslips.map((payslip) => (
                  <tr
                    key={payslip.id}
                    className="cursor-pointer border-b border-gray-50 hover:bg-indigo-50/40"
                    onClick={() => setOpenPayslipId(payslip.id)}
                  >
                    <td className="px-4 py-3 font-medium text-indigo-700">{payslip.staff_name}</td>
                    <td className="px-4 py-3 text-gray-600">{payslip.designation || '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{peso(payslip.daily_rate)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{payslip.days_worked}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{payslip.hours_worked}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{peso(payslip.gross_pay)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-red-600">
                      {peso(payslip.total_deductions)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-900">
                      {peso(payslip.net_pay)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {payslips.length > 0 && (
              <tfoot>
                <tr className="border-t border-gray-200 bg-gray-50/50 font-semibold text-gray-900">
                  <td className="px-4 py-3" colSpan={5}>
                    Totals — {payslips.length} employee(s)
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{peso(totals.gross)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-red-600">
                    {peso(totals.deductions)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{peso(totals.net)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {renderFinalizeModal()}
      </div>
    )
  }

  // ---- Periods list ----
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 p-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Payroll Periods</h2>
          <p className="text-sm text-gray-500">
            Create a period, generate payslips from attendance logs, then finalize once paid.
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <PlusIcon className="h-4 w-4" />
          New Period
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Coverage</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Payslips</th>
              <th className="px-4 py-3 text-right">Salary Earned</th>
              <th className="px-4 py-3 text-right">Net Cash</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {periodsQuery.isLoading ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                  Loading periods…
                </td>
              </tr>
            ) : periods.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                  No payroll periods yet. Click "New Period" to start.
                </td>
              </tr>
            ) : (
              periods.map((period) => (
                <tr
                  key={period.id}
                  className="cursor-pointer border-b border-gray-50 hover:bg-indigo-50/40"
                  onClick={() => setOpenPeriod(period)}
                >
                  <td className="px-4 py-3 font-medium text-indigo-700">{period.name}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {shortDate(period.date_from)} – {shortDate(period.date_to)}
                  </td>
                  <td className="px-4 py-3">{statusBadge(period)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{period.payslip_count}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{peso(period.gross_total)}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">
                    {peso(period.net_total)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      {period.status === 'draft' && (
                        <>
                          <button
                            type="button"
                            title="Edit period"
                            onClick={() => openEdit(period)}
                            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                          >
                            <PencilSquareIcon className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            title="Delete period"
                            onClick={() => setDeleting(period)}
                            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setShowForm(false)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-gray-200 px-6 py-4">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingId ? 'Edit Payroll Period' : 'New Payroll Period'}
              </h3>
            </div>
            <form onSubmit={submit} className="space-y-4 p-6">
              {formError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
                  {formError}
                </div>
              )}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Name</label>
                <Input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. June 2026"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">From</label>
                  <Input
                    type="date"
                    required
                    value={form.date_from}
                    onChange={(e) => setForm((prev) => ({ ...prev, date_from: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">To</label>
                  <Input
                    type="date"
                    required
                    value={form.date_to}
                    onChange={(e) => setForm((prev) => ({ ...prev, date_to: e.target.value }))}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
                <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? 'Saving…' : editingId ? 'Save changes' : 'Create period'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmationModal
        isOpen={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
        title="Delete payroll period"
        message={`Delete "${deleting?.name}" and all of its payslips? This cannot be undone.`}
        confirmText="Delete"
        variant="danger"
        loading={deleteMutation.isPending}
      />

      {renderFinalizeModal()}
    </div>
  )

  function renderFinalizeModal() {
    if (!finalizing) return null
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        onClick={() => setFinalizing(null)}
      >
        <div
          className="w-full max-w-md rounded-xl bg-white shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="border-b border-gray-200 px-6 py-4">
            <h3 className="text-lg font-semibold text-gray-900">Finalize "{finalizing.name}"</h3>
          </div>
          <div className="space-y-4 p-6">
            <p className="text-sm text-gray-600">
              Finalizing locks all payslips in this period against edits and regeneration. You can
              reopen it later if a correction is needed.
            </p>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Paid on</label>
              <Input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
              <Button type="button" variant="ghost" onClick={() => setFinalizing(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                color="success"
                disabled={finalizeMutation.isPending}
                onClick={() =>
                  finalizeMutation.mutate({ id: finalizing.id, paidOn: paidOn || undefined })
                }
              >
                {finalizeMutation.isPending ? 'Finalizing…' : 'Finalize period'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }
}

export default PeriodsTab
