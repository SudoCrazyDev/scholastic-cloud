import React, { useMemo, useState } from 'react'
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  LockClosedIcon,
  LockOpenIcon,
  PencilSquareIcon,
  PlusIcon,
  PrinterIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'
import { pdf } from '@react-pdf/renderer'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { Button } from '../../../components/button'
import { Input } from '../../../components/input'
import { Select } from '../../../components/select'
import { ConfirmationModal } from '../../../components'
import { payrollService } from '../../../services/payrollService'
import { staffScheduleService } from '../../../services/staffScheduleService'
import type {
  CreatePayrollPeriodData,
  PayrollPeriod,
  PayrollPeriodScheduleScope,
  PayslipSummary,
  StaffSchedule,
} from '../../../types'
import { errorMessage, parseYmd, peso, shortDate } from './helpers'
import PayrollSheetPDF from './PayrollSheetPDF'
import PayslipDetail from './PayslipDetail'

interface PeriodForm {
  name: string
  date_from: string
  date_to: string
  schedule_scope: PayrollPeriodScheduleScope
  staff_schedule_ids: string[]
}

const emptyForm = (): PeriodForm => ({
  name: '',
  date_from: '',
  date_to: '',
  schedule_scope: 'all',
  staff_schedule_ids: [],
})

const SCOPE_OPTIONS = [
  { value: 'all', label: 'All staff schedules' },
  { value: 'schedules', label: 'Only the selected staff schedules' },
]

const DAY_MS = 24 * 60 * 60 * 1000

const ymd = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

const addDays = (date: Date, days: number) => {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

const lastDayOfMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate()

// Same day of the month, N months on, clamped so Jan 31 lands on Feb 28
// rather than rolling into March.
const addMonthsClamped = (date: Date, months: number) => {
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1)
  target.setDate(Math.min(date.getDate(), lastDayOfMonth(target.getFullYear(), target.getMonth())))
  return target
}

// The 1st through the last day of one month.
const isWholeMonth = (from: Date, to: Date) =>
  from.getDate() === 1
  && from.getFullYear() === to.getFullYear()
  && from.getMonth() === to.getMonth()
  && to.getDate() === lastDayOfMonth(to.getFullYear(), to.getMonth())

/**
 * The dates a new period should open with: the day after the latest existing
 * period ended, running roughly as long.
 *
 * A cut-off shifted off the calendar (Jun 26 – Jul 25, so finance can process
 * before month end) has to be retyped every month if the form keeps defaulting
 * to the current calendar month — and a mistyped start date leaves days that no
 * period covers and nobody is paid for. Starting from the previous end date
 * makes a gap impossible by construction.
 *
 * The end date follows the shape of the period being continued: whole calendar
 * months roll to the next whole month (so February keeps its own length),
 * month-anchored cut-offs keep their day of the month, and anything shorter
 * (semi-monthly, weekly) keeps its exact length.
 */
const nextPeriodDates = (periods: PayrollPeriod[]): { from: Date; to: Date } => {
  const previous = periods.reduce<PayrollPeriod | null>(
    (latest, period) => (!latest || period.date_to > latest.date_to ? period : latest),
    null
  )

  if (!previous) {
    const now = new Date()
    return {
      from: new Date(now.getFullYear(), now.getMonth(), 1),
      to: new Date(now.getFullYear(), now.getMonth() + 1, 0),
    }
  }

  const previousFrom = parseYmd(previous.date_from)
  const previousTo = parseYmd(previous.date_to)

  if (isWholeMonth(previousFrom, previousTo)) {
    return {
      from: new Date(previousTo.getFullYear(), previousTo.getMonth() + 1, 1),
      to: new Date(previousTo.getFullYear(), previousTo.getMonth() + 2, 0),
    }
  }

  const from = addDays(previousTo, 1)
  const spanDays = Math.round((previousTo.getTime() - previousFrom.getTime()) / DAY_MS) + 1

  return {
    from,
    to: spanDays >= 26 && spanDays <= 32
      ? addMonthsClamped(previousTo, 1)
      : addDays(from, spanDays - 1),
  }
}

// Periods are named for the month they are released in, which is the month
// they end in. Semi-monthly runs put two in the same month and the name is
// unique per institution, so a taken name falls back to the range.
const suggestPeriodName = (from: Date, to: Date, taken: string[]) => {
  const monthly = to.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  return taken.includes(monthly) ? `${shortDate(ymd(from))} – ${shortDate(ymd(to))}` : monthly
}

// What the list row shows under "Covers".
const scopeSummary = (period: PayrollPeriod) => {
  if (period.schedule_scope !== 'schedules') return 'All staff schedules'
  const names = period.staff_schedules?.map((s) => s.name) ?? []
  if (names.length === 0) return 'No schedule selected'
  if (names.length <= 2) return names.join(', ')
  return `${names.slice(0, 2).join(', ')} +${names.length - 2} more`
}

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

  // Only fetched once the form is open — the list itself renders the names the
  // API already serialized onto each period.
  const schedulesQuery = useQuery({
    queryKey: ['staff-schedules', 'active'],
    queryFn: () => staffScheduleService.getSchedules({ is_active: true }),
    enabled: showForm,
  })

  const schedules = useMemo<StaffSchedule[]>(
    () => schedulesQuery.data?.data || [],
    [schedulesQuery.data]
  )

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

  // Payslips priced from punches that had not been made when payroll ran.
  // Finalizing pays those out, so the confirm dialog names them.
  const assumed = useMemo(() => {
    const dates = payslipsQuery.data?.assumed_dates ?? []
    return {
      dates,
      payslipCount: payslips.filter((payslip) => payslip.assumed_days > 0).length,
    }
  }, [payslipsQuery.data, payslips])

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['payroll-periods'] })
    queryClient.invalidateQueries({ queryKey: ['payroll-payslips'] })
    // Finalising a period collects loan installments and reopening it gives
    // them back, so the balances on the Loans tab moved with this.
    queryClient.invalidateQueries({ queryKey: ['staff-loans'] })
    queryClient.invalidateQueries({ queryKey: ['staff-loan'] })
  }

  const saveMutation = useMutation({
    mutationFn: (payload: { id: string | null; data: CreatePayrollPeriodData }) =>
      payload.id
        ? payrollService.updatePeriod(payload.id, payload.data)
        : payrollService.createPeriod(payload.data),
    onSuccess: (result, payload) => {
      invalidate()
      setShowForm(false)
      toast.success(payload.id ? 'Period updated.' : 'Period created.')
      // Saving still succeeded — but days that no period covers are paid to
      // nobody, and nothing downstream would ever report it.
      if (result.warning) {
        toast(result.warning, { icon: '⚠️', duration: 12000 })
      }
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
      // Attendance that stopped arriving mid-period looks exactly like a month
      // of absences, and would otherwise be paid as one.
      if (result.warning) {
        toast(result.warning, { icon: '⚠️', duration: 14000 })
      }
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

  // The sheet is fetched (and the PDF rendered) only when asked for — it is a
  // much heavier payload than the payslip list this screen already shows.
  const printSheetMutation = useMutation({
    mutationFn: async (period: PayrollPeriod) => {
      const response = await payrollService.getPeriodSheet(period.id)
      const blob = await pdf(<PayrollSheetPDF sheet={response.data} />).toBlob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `Payroll - ${period.name}.pdf`
      document.body.appendChild(link)
      link.click()
      link.remove()
      // Revoking in the same tick can cancel the download in some browsers.
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    },
    onError: (err: unknown) => {
      // A request that never reached the API carries no server message, and
      // blaming the PDF for that sends you looking in the wrong place.
      const unreachable = (err as { request?: unknown; response?: unknown })?.request
        && !(err as { response?: unknown })?.response
      toast.error(
        errorMessage(
          err,
          unreachable
            ? 'Could not reach the server to load the payroll.'
            : 'Failed to build the payroll PDF.'
        )
      )
      console.error('Print Payroll failed', err)
    },
  })

  const openCreate = () => {
    const { from, to } = nextPeriodDates(periods)
    setForm({
      ...emptyForm(),
      name: suggestPeriodName(from, to, periods.map((period) => period.name)),
      date_from: ymd(from),
      date_to: ymd(to),
    })
    setEditingId(null)
    setFormError(null)
    setShowForm(true)
  }

  const openEdit = (period: PayrollPeriod) => {
    setForm({
      name: period.name,
      date_from: period.date_from,
      date_to: period.date_to,
      schedule_scope: period.schedule_scope ?? 'all',
      staff_schedule_ids: period.staff_schedule_ids ?? [],
    })
    setEditingId(period.id)
    setFormError(null)
    setShowForm(true)
  }

  const toggleSchedule = (scheduleId: string) => {
    setForm((prev) => ({
      ...prev,
      staff_schedule_ids: prev.staff_schedule_ids.includes(scheduleId)
        ? prev.staff_schedule_ids.filter((id) => id !== scheduleId)
        : [...prev.staff_schedule_ids, scheduleId],
    }))
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (form.schedule_scope === 'schedules' && form.staff_schedule_ids.length === 0) {
      setFormError('Select at least one staff schedule for this payroll period.')
      return
    }
    setFormError(null)
    saveMutation.mutate({
      id: editingId,
      data:
        form.schedule_scope === 'schedules'
          ? form
          : { ...form, staff_schedule_ids: [] },
    })
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
                <span className="mx-1.5 text-gray-300">·</span>
                {scopeSummary(currentPeriod)}
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => printSheetMutation.mutate(currentPeriod)}
              disabled={currentPeriod.payslip_count === 0 || printSheetMutation.isPending}
              title={
                currentPeriod.payslip_count === 0
                  ? 'Generate payslips before printing the payroll'
                  : undefined
              }
            >
              <PrinterIcon className="h-4 w-4" />
              {printSheetMutation.isPending ? 'Preparing…' : 'Print Payroll'}
            </Button>
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
                    className="cursor-pointer border-b border-gray-50 hover:bg-primary-50/40"
                    onClick={() => setOpenPayslipId(payslip.id)}
                  >
                    <td className="px-4 py-3 font-medium text-primary-700">{payslip.staff_name}</td>
                    <td className="px-4 py-3 text-gray-600">{payslip.designation || '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{peso(payslip.daily_rate)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {payslip.days_worked}
                      {payslip.assumed_days > 0 && (
                        <span
                          className="ml-1.5 text-[10px] font-medium uppercase tracking-wide text-amber-600"
                          title={`${payslip.assumed_days} day(s) priced from the staff schedule — those punches had not been made when payroll was generated`}
                        >
                          {payslip.assumed_days} est
                        </span>
                      )}
                    </td>
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
              <th className="px-4 py-3">Covers</th>
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
                <td colSpan={8} className="px-4 py-10 text-center text-gray-400">
                  Loading periods…
                </td>
              </tr>
            ) : periods.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-gray-400">
                  No payroll periods yet. Click "New Period" to start.
                </td>
              </tr>
            ) : (
              periods.map((period) => (
                <tr
                  key={period.id}
                  className="cursor-pointer border-b border-gray-50 hover:bg-primary-50/40"
                  onClick={() => setOpenPeriod(period)}
                >
                  <td className="px-4 py-3 font-medium text-primary-700">{period.name}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {shortDate(period.date_from)} – {shortDate(period.date_to)}
                  </td>
                  <td className="px-4 py-3 text-gray-600" title={
                    period.schedule_scope === 'schedules'
                      ? period.staff_schedules?.map((s) => s.name).join(', ')
                      : undefined
                  }>
                    {scopeSummary(period)}
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
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Covers</label>
                <Select
                  options={SCOPE_OPTIONS}
                  value={form.schedule_scope}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      schedule_scope: e.target.value as PayrollPeriodScheduleScope,
                    }))
                  }
                />
                <p className="mt-1 text-xs text-gray-500">
                  {form.schedule_scope === 'schedules'
                    ? 'Only staff assigned to the schedules you tick below get a payslip in this period.'
                    : 'Every employee with a compensation rate gets a payslip in this period.'}
                </p>
              </div>
              {form.schedule_scope === 'schedules' && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    Staff schedules
                  </label>
                  {schedulesQuery.isLoading ? (
                    <p className="rounded-lg border border-gray-200 px-3 py-6 text-center text-sm text-gray-400">
                      Loading schedules…
                    </p>
                  ) : schedules.length === 0 ? (
                    <p className="rounded-lg border border-gray-200 px-3 py-6 text-center text-sm text-gray-400">
                      No active staff schedules yet. Create one in HRIS → Staff Schedules.
                    </p>
                  ) : (
                    <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-gray-200 p-2">
                      {schedules.map((schedule) => (
                        <label
                          key={schedule.id}
                          className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-gray-50"
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                            checked={form.staff_schedule_ids.includes(schedule.id)}
                            onChange={() => toggleSchedule(schedule.id)}
                          />
                          <span className="text-gray-700">{schedule.name}</span>
                          <span className="ml-auto text-xs text-gray-400">
                            {schedule.assigned_count ?? 0} staff
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}
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
            {assumed.payslipCount > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
                <p className="font-medium">
                  {assumed.payslipCount} payslip{assumed.payslipCount === 1 ? '' : 's'} rest on
                  assumed punches
                </p>
                <p className="mt-1 text-xs">
                  {assumed.dates.map((date) => shortDate(date)).join(', ')}{' '}
                  {assumed.dates.length === 1 ? 'was' : 'were'} priced from the staff schedules
                  because those punches had not been made when payroll was generated. Regenerate
                  first if the real attendance has since arrived.
                </p>
              </div>
            )}
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
