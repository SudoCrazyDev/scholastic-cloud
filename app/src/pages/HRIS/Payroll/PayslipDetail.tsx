import React, { useEffect, useState } from 'react'
import { ArrowLeftIcon, PencilSquareIcon, PrinterIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { Button } from '../../../components/button'
import { Input } from '../../../components/input'
import { Autocomplete } from '../../../components/autocomplete'
import { payrollService } from '../../../services/payrollService'
import type {
  Payslip,
  PayslipDay,
  PayrollDeductionCalculationType,
  PayrollDeductionPercentBasis,
  PayrollDeductionType,
  UpdatePayslipData,
} from '../../../types'
import {
  BASIS_LABELS,
  dayLabel,
  errorMessage,
  numberOrZero,
  percent,
  peso,
  rangeLabel,
  rateLabel,
  time12,
} from './helpers'
import PayslipPrintModal from './PayslipPrintModal'
import PayslipSlipPrintModal from './PayslipSlipPrintModal'

/**
 * A punch time, dimmed and marked when it was assumed from the schedule rather
 * than read off a device — payroll generated before the period ended has to
 * fill in punches that had not been made yet, and the sheet must never let one
 * of those pass for a biometric reading.
 */
const assumedTime = (label: string, assumed: boolean) => {
  if (!assumed) return label || '—'

  return (
    <span
      className="text-amber-700"
      title="Assumed from the staff schedule — this punch had not been made when payroll was generated"
    >
      {label || '—'}
      <span className="ml-1 text-[10px] font-medium uppercase tracking-wide text-amber-600">
        est
      </span>
    </span>
  )
}

interface PayslipDetailProps {
  payslipId: string
  periodFinalized: boolean
  onBack: () => void
}

interface RatesForm {
  designation: string
  daily_rate: string
  hourly_rate: string
}

interface DeductionRow {
  key: string
  deduction_type_id: string | null
  // Set on a loan collection. The row is read-only and never sent back: the
  // figure came off an approved schedule, not off this payslip.
  staff_loan_id: string | null
  name: string
  calculation_type: PayrollDeductionCalculationType
  // Pesos on a fixed row, percent on a percentage one — the input swaps with
  // calculation_type, and the server recomputes a percentage row's pesos.
  amount: string
  employer_amount: string
  percent_basis: PayrollDeductionPercentBasis | null
  // What the percentage was last taken from, for the "5% of ₱15,000" hint.
  basis_amount: number
  // Which salary range a bracket row landed in, for the same kind of hint.
  bracket_min: number | null
  bracket_max: number | null
}

const ratesFromPayslip = (payslip: Payslip): RatesForm => ({
  designation: payslip.designation || '',
  daily_rate: String(payslip.daily_rate),
  hourly_rate: String(payslip.hourly_rate),
})

const deductionsFromPayslip = (payslip: Payslip): DeductionRow[] =>
  payslip.deductions.map((deduction, index) => {
    const percentage = deduction.calculation_type === 'percentage'
    return {
      key: deduction.id || `row-${index}`,
      deduction_type_id: deduction.deduction_type_id,
      staff_loan_id: deduction.staff_loan_id ?? null,
      name: deduction.name,
      calculation_type: deduction.calculation_type,
      // A bracket row shows the peso the table produced, but does not let it
      // be typed over — the schedule is what decides it.
      amount: String(percentage ? deduction.rate_percent : deduction.amount),
      employer_amount: String(percentage ? deduction.employer_rate_percent : deduction.employer_amount),
      percent_basis: deduction.percent_basis,
      basis_amount: deduction.basis_amount,
      bracket_min: deduction.bracket_min,
      bracket_max: deduction.bracket_max,
    }
  })

const PayslipDetail: React.FC<PayslipDetailProps> = ({ payslipId, periodFinalized, onBack }) => {
  const queryClient = useQueryClient()
  const [showPrint, setShowPrint] = useState<'slip' | 'record' | null>(null)
  const [editingDay, setEditingDay] = useState<PayslipDay | null>(null)
  const [dayForm, setDayForm] = useState({ time_in: '', time_out: '', overtime: '' })
  const [form, setForm] = useState<RatesForm | null>(null)
  const [deductionRows, setDeductionRows] = useState<DeductionRow[]>([])
  // Bumped after every pick so the autocomplete remounts and clears its typed query.
  const [addPickerKey, setAddPickerKey] = useState(0)

  const payslipQuery = useQuery({
    queryKey: ['payslip', payslipId],
    queryFn: () => payrollService.getPayslip(payslipId),
  })

  const typesQuery = useQuery({
    queryKey: ['payroll-deduction-types'],
    queryFn: () => payrollService.getDeductionTypes(),
  })

  const payslip = payslipQuery.data?.data
  const activeTypes: PayrollDeductionType[] = (typesQuery.data?.data || []).filter((t) => t.is_active)

  useEffect(() => {
    if (payslip) {
      setForm(ratesFromPayslip(payslip))
      setDeductionRows(deductionsFromPayslip(payslip))
    }
  }, [payslip])

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['payslip', payslipId] })
    queryClient.invalidateQueries({ queryKey: ['payroll-payslips'] })
    queryClient.invalidateQueries({ queryKey: ['payroll-periods'] })
  }

  const updateMutation = useMutation({
    mutationFn: (data: UpdatePayslipData) => payrollService.updatePayslip(payslipId, data),
    onSuccess: () => {
      invalidate()
      toast.success('Payslip updated.')
    },
    onError: (err: unknown) => {
      toast.error(errorMessage(err, 'Failed to update payslip.'))
    },
  })

  const dayMutation = useMutation({
    mutationFn: (payload: {
      dayId: string
      time_in: string | null
      time_out: string | null
      overtime_minutes: number
    }) =>
      payrollService.updatePayslipDay(payslipId, payload.dayId, {
        time_in: payload.time_in,
        time_out: payload.time_out,
        overtime_minutes: payload.overtime_minutes,
      }),
    onSuccess: () => {
      invalidate()
      setEditingDay(null)
      toast.success('Day updated.')
    },
    onError: (err: unknown) => {
      toast.error(errorMessage(err, 'Failed to update day.'))
    },
  })

  if (payslipQuery.isLoading || !payslip || !form) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-gray-400 shadow-sm">
        Loading payslip…
      </div>
    )
  }

  const readOnly = periodFinalized
  const setField = (key: keyof RatesForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => (prev ? { ...prev, [key]: e.target.value } : prev))

  const addDeduction = (value: string) => {
    setAddPickerKey((k) => k + 1)
    if (!value) return
    if (value === 'custom') {
      setDeductionRows((prev) => [
        ...prev,
        {
          key: `new-${Date.now()}-${prev.length}`,
          deduction_type_id: null,
          staff_loan_id: null,
          name: '',
          calculation_type: 'fixed',
          amount: '',
          employer_amount: '',
          percent_basis: null,
          basis_amount: 0,
          bracket_min: null,
          bracket_max: null,
        },
      ])
      return
    }
    const type = activeTypes.find((t) => t.id === value)
    if (!type) return
    const percentage = type.calculation_type === 'percentage'
    const bracket = type.calculation_type === 'bracket'
    setDeductionRows((prev) => [
      ...prev,
      {
        key: `new-${Date.now()}-${prev.length}`,
        deduction_type_id: type.id,
        staff_loan_id: null,
        name: type.name,
        calculation_type: type.calculation_type,
        // A bracket row has nothing to prefill — the server looks the salary
        // up in the table on save.
        amount: bracket ? '' : String((percentage ? type.rate_percent : type.default_amount) || ''),
        employer_amount:
          type.has_employer_share && !bracket
            ? String((percentage ? type.employer_rate_percent : type.default_employer_amount) || '')
            : '',
        percent_basis: percentage || bracket ? type.percent_basis : null,
        // Filled in by the server on save, once it knows the salary.
        basis_amount: 0,
        bracket_min: null,
        bracket_max: null,
      },
    ])
  }

  const saveDeductions = (e: React.FormEvent) => {
    e.preventDefault()
    updateMutation.mutate({
      designation: form.designation.trim() || null,
      daily_rate: numberOrZero(form.daily_rate),
      hourly_rate: numberOrZero(form.hourly_rate),
      deductions: deductionRows
        // Loan collections are left out entirely. They belong to an approved
        // schedule, and the server keeps them on the payslip regardless of what
        // this save sends — sending them back would only invite a mismatch.
        .filter((row) => row.staff_loan_id === null && row.name.trim() !== '')
        .map((row) => {
          const percentage = row.calculation_type === 'percentage'
          const bracket = row.calculation_type === 'bracket'
          return {
            deduction_type_id: row.deduction_type_id,
            name: row.name.trim(),
            calculation_type: row.calculation_type,
            // The server recomputes a percentage row's pesos from these rates,
            // and a bracket row's from its table.
            amount: percentage || bracket ? 0 : numberOrZero(row.amount),
            employer_amount: percentage || bracket ? 0 : numberOrZero(row.employer_amount),
            rate_percent: percentage ? numberOrZero(row.amount) : 0,
            employer_rate_percent: percentage ? numberOrZero(row.employer_amount) : 0,
            percent_basis: percentage || bracket ? row.percent_basis || 'basic_pay' : undefined,
          }
        }),
    })
  }

  const usedTypeIds = new Set(deductionRows.map((row) => row.deduction_type_id).filter(Boolean))
  const usedNames = new Set(
    deductionRows.map((row) => row.name.trim().toLowerCase()).filter((name) => name !== '')
  )
  const addOptions = [
    ...activeTypes
      .filter((type) => !usedTypeIds.has(type.id) && !usedNames.has(type.name.trim().toLowerCase()))
      .map((type) => ({
        id: type.id,
        label: type.name,
        description:
          type.calculation_type === 'bracket'
            ? `${type.brackets.length} salary ranges`
            : type.calculation_type === 'percentage'
              ? type.rate_percent > 0
                ? rateLabel(type.rate_percent, type.percent_basis)
                : undefined
              : type.default_amount > 0
                ? peso(type.default_amount)
                : undefined,
      })),
    { id: 'custom', label: 'Custom deduction…' },
  ]

  // Late and undertime are only charged against a scheduled start and end, so a
  // staff member with no schedule assigned is quietly exempt from both however
  // they punch. That is invisible on a slip whose penalty column is all dashes,
  // which reads as "never late" rather than "never checked".
  const penaltiesConfigured =
    payslip.late_penalty_per_minute > 0 || payslip.undertime_penalty_per_minute > 0
  const unscheduledDays = payslip.days.filter(
    (day) => !day.is_rest_day && !day.is_holiday && (!day.schedule_start || !day.schedule_end)
  ).length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeftIcon className="h-4 w-4" />
            Back
          </Button>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{payslip.staff_name}</h2>
            <p className="text-sm text-gray-500">
              {payslip.designation || 'No designation'} · {payslip.period?.name} · Daily rate{' '}
              {peso(payslip.daily_rate)} · Hourly {peso(payslip.hourly_rate)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {readOnly && (
            <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700">
              Finalized — read only
            </span>
          )}
          <Button size="sm" onClick={() => setShowPrint('slip')}>
            <PrinterIcon className="h-4 w-4" />
            Print Pay Slip
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowPrint('record')}>
            <PrinterIcon className="h-4 w-4" />
            Time Record
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Daily working time */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm lg:col-span-2">
          <div className="border-b border-gray-200 p-4">
            <h3 className="font-semibold text-gray-900">Working Time</h3>
            <p className="text-sm text-gray-500">
              From the biometric attendance logs. {!readOnly && 'Click a row to correct a day.'}
            </p>
            {payslip.assumed_days > 0 && (
              <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <span className="font-medium">
                  {payslip.assumed_days} day{payslip.assumed_days === 1 ? '' : 's'} marked{' '}
                  <span className="uppercase tracking-wide">est</span>
                </span>{' '}
                {payslip.assumed_days === 1 ? 'was' : 'were'} priced from the staff schedule because
                payroll was generated before {payslip.assumed_days === 1 ? 'that punch' : 'those punches'}{' '}
                could be made. Regenerate once the real punches arrive, or correct the day by hand.
              </p>
            )}
            {penaltiesConfigured && unscheduledDays > 0 && (
              <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <span className="font-medium">
                  {unscheduledDays} working day{unscheduledDays === 1 ? '' : 's'} had no schedule
                </span>{' '}
                — late and undertime cannot be charged without a scheduled start and end, so{' '}
                {unscheduledDays === 1 ? 'that day was' : 'those days were'} paid on hours worked
                alone. Assign this staff member a schedule and regenerate to price{' '}
                {unscheduledDays === 1 ? 'it' : 'them'} against it.
              </p>
            )}
          </div>
          <div className="max-h-[32rem] overflow-y-auto overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50">
                <tr className="text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-2.5">Date</th>
                  <th className="px-4 py-2.5">In</th>
                  <th className="px-4 py-2.5">Out</th>
                  <th className="px-4 py-2.5 text-right">Hours</th>
                  <th
                    className="px-4 py-2.5 text-right"
                    title="Peso deducted from the daily rate for late arrival + undertime"
                  >
                    Penalty
                  </th>
                  <th
                    className="px-4 py-2.5 text-right"
                    title="Late — minutes punched in after the scheduled start, past the grace period"
                  >
                    Late
                  </th>
                  <th
                    className="px-4 py-2.5 text-right"
                    title="Undertime — minutes punched out before the scheduled end"
                  >
                    UT
                  </th>
                  <th
                    className="px-4 py-2.5 text-right"
                    title="Overtime — only manager-approved minutes are paid"
                  >
                    OT
                  </th>
                  <th className="px-4 py-2.5 text-right">Earned</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {payslip.days.map((day) => {
                  const off = day.is_rest_day || day.is_holiday
                  // The stored penalty bundles late + undertime; split out each
                  // share so the Late and UT columns can show what they cost.
                  const latePenalty = day.late_minutes * payslip.late_penalty_per_minute
                  const undertimePenalty =
                    day.undertime_minutes * payslip.undertime_penalty_per_minute
                  return (
                    <tr
                      key={day.id}
                      className={`border-b border-gray-50 ${off ? 'bg-red-50/40' : ''} ${
                        !readOnly ? 'cursor-pointer hover:bg-primary-50/40' : ''
                      }`}
                      onClick={() => {
                        if (readOnly) return
                        setDayForm({
                          time_in: day.time_in || '',
                          time_out: day.time_out || '',
                          overtime: day.overtime_minutes > 0 ? String(day.overtime_minutes) : '',
                        })
                        setEditingDay(day)
                      }}
                    >
                      <td className={`px-4 py-2 font-medium ${off ? 'text-red-600' : 'text-gray-900'}`}>
                        {dayLabel(day.work_date)}
                        {day.is_holiday && (
                          <span className="ml-2 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-600">
                            Holiday
                          </span>
                        )}
                        {day.pay_policy === 'full_day' && (
                          <span
                            className="ml-2 rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700"
                            title="Paid a full day regardless of hours worked"
                          >
                            Full-day pay
                          </span>
                        )}
                        {day.pay_policy === 'no_pay' && (
                          <span className="ml-2 rounded-full bg-gray-200 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                            Unpaid
                          </span>
                        )}
                        {day.exception_label && (
                          <div className="mt-0.5 text-[11px] font-normal text-amber-700">
                            {day.exception_label}
                            {(day.waive_late || day.waive_undertime) && (
                              <span className="text-gray-400">
                                {' '}
                                ·{' '}
                                {[day.waive_late ? 'late' : null, day.waive_undertime ? 'undertime' : null]
                                  .filter(Boolean)
                                  .join(' + ')}{' '}
                                waived
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2 tabular-nums">
                        {assumedTime(time12(day.time_in), day.assumed_time_in)}
                      </td>
                      <td className="px-4 py-2 tabular-nums">
                        {assumedTime(time12(day.time_out), day.assumed_time_out)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {day.hours_worked > 0 ? day.hours_worked : '—'}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {day.penalty_amount > 0 ? (
                          <span
                            className="text-red-600"
                            title={[
                              day.late_minutes > 0 ? `${day.late_minutes} min late` : null,
                              day.undertime_minutes > 0 ? `${day.undertime_minutes} min undertime` : null,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          >
                            −{peso(day.penalty_amount)}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {day.late_minutes > 0 ? (
                          <span
                            className="text-red-600"
                            title={
                              latePenalty > 0
                                ? `${day.late_minutes} min late · −${peso(latePenalty)}`
                                : `${day.late_minutes} min late`
                            }
                          >
                            {day.late_minutes}m
                          </span>
                        ) : day.waive_late ? (
                          <span
                            className="text-xs italic text-gray-400"
                            title="Late waived by an approved exception"
                          >
                            waived
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {day.undertime_minutes > 0 ? (
                          <span
                            className="text-red-600"
                            title={
                              undertimePenalty > 0
                                ? `${day.undertime_minutes} min undertime · −${peso(undertimePenalty)}`
                                : `${day.undertime_minutes} min undertime`
                            }
                          >
                            {day.undertime_minutes}m
                          </span>
                        ) : day.waive_undertime ? (
                          <span
                            className="text-xs italic text-gray-400"
                            title="Undertime waived by an approved exception"
                          >
                            waived
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {day.overtime_minutes > 0 ? (
                          <span className="text-green-700" title={`${day.overtime_minutes} min approved`}>
                            +{peso(day.overtime_amount)}
                          </span>
                        ) : day.detected_overtime_minutes > 0 ? (
                          <span
                            className="text-xs italic text-gray-400"
                            title="Punched out past the scheduled end — unpaid until approved"
                          >
                            {day.detected_overtime_minutes}m detected
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {day.amount_earned > 0 ? peso(day.amount_earned) : '—'}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {!readOnly && <PencilSquareIcon className="ml-auto h-4 w-4 text-gray-300" />}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-200 bg-gray-50/50 font-semibold text-gray-900">
                  <td className="px-4 py-2.5" colSpan={3}>
                    {payslip.days_worked} day(s) worked
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{payslip.hours_worked}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-red-600">
                    {payslip.penalty_total > 0 ? `−${peso(payslip.penalty_total)}` : '—'}
                  </td>
                  <td
                    className="px-4 py-2.5 text-right tabular-nums text-red-600"
                    title={`${payslip.late_minutes} min late this period`}
                  >
                    {payslip.late_minutes > 0 ? `${payslip.late_minutes}m` : '—'}
                  </td>
                  <td
                    className="px-4 py-2.5 text-right tabular-nums text-red-600"
                    title={`${payslip.undertime_minutes} min undertime this period`}
                  >
                    {payslip.undertime_minutes > 0 ? `${payslip.undertime_minutes}m` : '—'}
                  </td>
                  <td
                    className="px-4 py-2.5 text-right tabular-nums text-green-700"
                    title={`${payslip.overtime_minutes} min approved overtime this period`}
                  >
                    {payslip.overtime_total > 0 ? `+${peso(payslip.overtime_total)}` : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{peso(payslip.gross_pay)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Deductions & totals */}
        <div className="space-y-4">
          <form onSubmit={saveDeductions} className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 p-4">
              <h3 className="font-semibold text-gray-900">Rates & Deductions</h3>
            </div>
            <div className="space-y-4 p-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Daily rate</label>
                  <Input type="number" min="0" step="0.01" value={form.daily_rate} onChange={setField('daily_rate')} disabled={readOnly} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Hourly rate</label>
                  <Input type="number" min="0" step="0.01" value={form.hourly_rate} onChange={setField('hourly_rate')} disabled={readOnly} />
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Deductions
                </p>
                {deductionRows.length === 0 ? (
                  <p className="mb-2 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-xs text-gray-400">
                    No deductions on this payslip.
                  </p>
                ) : (
                  <div className="mb-1 grid grid-cols-[1fr_5.5rem_5.5rem_1.75rem] gap-2 px-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-400">
                    <span>Deduction</span>
                    <span>Employee</span>
                    <span>Employer</span>
                    <span />
                  </div>
                )}
                <div className="space-y-2">
                  {deductionRows.map((row, index) => {
                    const rowType = row.deduction_type_id
                      ? activeTypes.find((t) => t.id === row.deduction_type_id)
                      : null
                    const percentage = row.calculation_type === 'percentage'
                    // The table decides a bracket row, so neither figure on it
                    // is typed here — remove the line to override it.
                    const bracket = row.calculation_type === 'bracket'
                    // A loan installment is off an approved schedule. It cannot
                    // be edited, renamed or removed here: the way to stop it is
                    // to cancel the loan under Staff Loans, which is somebody
                    // else's decision and leaves a record.
                    const loan = row.staff_loan_id !== null
                    // A dash means the school pays no counterpart at all. A
                    // bracket row does have one — it just isn't typed here —
                    // so it keeps the input and shows the figure, greyed.
                    const employerShared = rowType ? rowType.has_employer_share : !loan
                    const employerDisabled = readOnly || bracket || loan || !employerShared
                    // Percent and peso share the two inputs; only the step and
                    // placeholder differ.
                    const figureProps = percentage
                      ? { max: '100', step: '0.001', placeholder: '0' }
                      : { step: '0.01', placeholder: '0.00' }
                    return (
                      <div key={row.key}>
                        <div className="grid grid-cols-[1fr_5.5rem_5.5rem_1.75rem] items-center gap-2">
                          <Input
                            type="text"
                            size="sm"
                            value={row.name}
                            placeholder="Deduction name"
                            disabled={readOnly || loan || row.deduction_type_id !== null}
                            onChange={(e) =>
                              setDeductionRows((prev) =>
                                prev.map((r, i) => (i === index ? { ...r, name: e.target.value } : r))
                              )
                            }
                          />
                          <Input
                            type="number"
                            min="0"
                            size="sm"
                            value={row.amount}
                            disabled={readOnly || bracket || loan}
                            onChange={(e) =>
                              setDeductionRows((prev) =>
                                prev.map((r, i) => (i === index ? { ...r, amount: e.target.value } : r))
                              )
                            }
                            {...figureProps}
                          />
                          {!employerShared && !readOnly ? (
                            <span className="text-center text-xs text-gray-400">—</span>
                          ) : (
                            <Input
                              type="number"
                              min="0"
                              size="sm"
                              value={row.employer_amount}
                              disabled={employerDisabled}
                              onChange={(e) =>
                                setDeductionRows((prev) =>
                                  prev.map((r, i) =>
                                    i === index ? { ...r, employer_amount: e.target.value } : r
                                  )
                                )
                              }
                              {...figureProps}
                            />
                          )}
                          {!readOnly && !loan ? (
                            <button
                              type="button"
                              title="Remove deduction"
                              onClick={() =>
                                setDeductionRows((prev) => prev.filter((_, i) => i !== index))
                              }
                              className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                            >
                              <XMarkIcon className="h-4 w-4" />
                            </button>
                          ) : (
                            <span />
                          )}
                        </div>
                        {loan && (
                          <p className="mt-0.5 px-0.5 text-[11px] text-gray-400">
                            One installment of an approved staff loan — cancel the loan under Staff
                            Loans to stop it.
                          </p>
                        )}
                        {percentage && (
                          <p className="mt-0.5 px-0.5 text-[11px] text-gray-400">
                            {percent(numberOrZero(row.amount))} of{' '}
                            {row.percent_basis === 'gross_pay' ? 'salary earned' : 'basic pay'} (
                            {peso(row.basis_amount)}) — recomputed on save
                          </p>
                        )}
                        {bracket && (
                          <p className="mt-0.5 px-0.5 text-[11px] text-gray-400">
                            {row.bracket_min === null
                              ? 'From the salary-range table'
                              : `Salary range ${rangeLabel(row.bracket_min, row.bracket_max)}`}{' '}
                            — matched on {BASIS_LABELS[row.percent_basis || 'basic_pay']} of{' '}
                            {peso(row.basis_amount)}, recomputed on save
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
                {!readOnly && (
                  <div
                    className="mt-2"
                    // Enter picks an option; an unhandled Enter must not submit the payslip form.
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.defaultPrevented) e.preventDefault()
                    }}
                  >
                    <Autocomplete
                      key={addPickerKey}
                      value={null}
                      immediate
                      options={addOptions}
                      placeholder="+ Add deduction…"
                      onChange={(option) => addDeduction(option?.id || '')}
                    />
                  </div>
                )}
                <p className="mt-1.5 text-xs text-gray-400">
                  Employer amounts are benefits paid by the school — they are not deducted from the
                  employee's pay.
                </p>
              </div>
              {!readOnly && (
                <Button type="submit" className="w-full" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? 'Saving…' : 'Save & recompute'}
                </Button>
              )}
            </div>
          </form>

          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 font-semibold text-gray-900">Summary</h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500" title="Daily rate × scheduled working days, before lates, undertime and absences">
                  Basic pay (before deductions)
                </dt>
                <dd className="tabular-nums text-gray-600">{peso(payslip.basic_pay)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Total salary earned</dt>
                <dd className="font-medium tabular-nums">{peso(payslip.gross_pay)}</dd>
              </div>
              {payslip.penalty_total > 0 && (
                <p className="text-xs text-gray-400">
                  Already includes −{peso(payslip.penalty_total)} in late/undertime penalties (
                  {payslip.late_minutes} min late, {payslip.undertime_minutes} min undertime at{' '}
                  {peso(payslip.late_penalty_per_minute)}/{peso(payslip.undertime_penalty_per_minute)}{' '}
                  per minute).
                </p>
              )}
              {payslip.overtime_total > 0 && (
                <p className="text-xs text-gray-400">
                  Already includes +{peso(payslip.overtime_total)} approved overtime (
                  {payslip.overtime_minutes} min at {peso(payslip.overtime_rate_per_minute)} per
                  minute).
                </p>
              )}
              {payslip.deductions.map((deduction) => (
                <div key={deduction.id || deduction.name} className="flex justify-between">
                  <dt className="text-gray-500">
                    {deduction.name}
                    {deduction.calculation_type === 'percentage' && (
                      <span
                        className="ml-1 text-xs text-gray-400"
                        title={`${rateLabel(deduction.rate_percent, deduction.percent_basis)} (${peso(deduction.basis_amount)})`}
                      >
                        ({percent(deduction.rate_percent)})
                      </span>
                    )}
                    {deduction.calculation_type === 'bracket' && deduction.bracket_min !== null && (
                      <span
                        className="ml-1 text-xs text-gray-400"
                        title={`Salary range ${rangeLabel(deduction.bracket_min, deduction.bracket_max)}, matched on ${BASIS_LABELS[deduction.percent_basis || 'basic_pay']} of ${peso(deduction.basis_amount)}`}
                      >
                        (bracket)
                      </span>
                    )}
                  </dt>
                  <dd className="tabular-nums text-red-600">−{peso(deduction.amount)}</dd>
                </div>
              ))}
              <div className="flex justify-between border-t border-gray-100 pt-2">
                <dt className="text-gray-500">Total deductions</dt>
                <dd className="font-medium tabular-nums text-red-600">
                  −{peso(payslip.total_deductions)}
                </dd>
              </div>
              <div className="flex justify-between text-base">
                <dt className="font-semibold text-gray-900">Net cash earned</dt>
                <dd className="font-bold tabular-nums text-green-700">{peso(payslip.net_pay)}</dd>
              </div>
              <div className="flex justify-between pt-2">
                <dt className="text-gray-500">Employer's share (other benefits)</dt>
                <dd className="tabular-nums text-gray-600">{peso(payslip.employer_share_total)}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      {editingDay && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setEditingDay(null)}
        >
          <div
            className="w-full max-w-sm rounded-xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-gray-200 px-6 py-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Correct {dayLabel(editingDay.work_date)}
              </h3>
              <p className="text-sm text-gray-500">Leave both blank to mark the day as absent.</p>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                dayMutation.mutate({
                  dayId: editingDay.id,
                  time_in: dayForm.time_in || null,
                  time_out: dayForm.time_out || null,
                  overtime_minutes: Math.max(0, Math.round(numberOrZero(dayForm.overtime))),
                })
              }}
              className="space-y-4 p-6"
            >
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Time in</label>
                  <Input
                    type="time"
                    value={dayForm.time_in}
                    onChange={(e) => setDayForm((prev) => ({ ...prev, time_in: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Time out</label>
                  <Input
                    type="time"
                    value={dayForm.time_out}
                    onChange={(e) => setDayForm((prev) => ({ ...prev, time_out: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Approved overtime (minutes)
                </label>
                <Input
                  type="number"
                  min="0"
                  max="1440"
                  step="1"
                  value={dayForm.overtime}
                  placeholder="0"
                  onChange={(e) => setDayForm((prev) => ({ ...prev, overtime: e.target.value }))}
                />
                <p className="mt-1 text-xs text-gray-400">
                  {editingDay.detected_overtime_minutes > 0
                    ? `Punched out ${editingDay.detected_overtime_minutes} min past the scheduled end. `
                    : ''}
                  Paid at {peso(payslip.overtime_rate_per_minute)} per minute
                  {payslip.overtime_rate_per_minute <= 0 && ' (rate is 0 — set it in Payroll Settings)'}.
                </p>
              </div>
              <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
                <Button type="button" variant="ghost" onClick={() => setEditingDay(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={dayMutation.isPending}>
                  {dayMutation.isPending ? 'Saving…' : 'Save day'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showPrint === 'record' && (
        <PayslipPrintModal payslip={payslip} onClose={() => setShowPrint(null)} />
      )}
      {showPrint === 'slip' && (
        <PayslipSlipPrintModal payslip={payslip} onClose={() => setShowPrint(null)} />
      )}
    </div>
  )
}

export default PayslipDetail
