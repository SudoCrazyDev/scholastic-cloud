import React, { useEffect, useState } from 'react'
import { ArrowLeftIcon, PencilSquareIcon, PrinterIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { Button } from '../../../components/button'
import { Input } from '../../../components/input'
import { Select } from '../../../components/select'
import { payrollService } from '../../../services/payrollService'
import type { Payslip, PayslipDay, PayrollDeductionType, UpdatePayslipData } from '../../../types'
import { dayLabel, errorMessage, numberOrZero, peso, time12 } from './helpers'
import PayslipPrintModal from './PayslipPrintModal'

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
  name: string
  amount: string
  employer_amount: string
}

const ratesFromPayslip = (payslip: Payslip): RatesForm => ({
  designation: payslip.designation || '',
  daily_rate: String(payslip.daily_rate),
  hourly_rate: String(payslip.hourly_rate),
})

const deductionsFromPayslip = (payslip: Payslip): DeductionRow[] =>
  payslip.deductions.map((deduction, index) => ({
    key: deduction.id || `row-${index}`,
    deduction_type_id: deduction.deduction_type_id,
    name: deduction.name,
    amount: String(deduction.amount),
    employer_amount: String(deduction.employer_amount),
  }))

const PayslipDetail: React.FC<PayslipDetailProps> = ({ payslipId, periodFinalized, onBack }) => {
  const queryClient = useQueryClient()
  const [showPrint, setShowPrint] = useState(false)
  const [editingDay, setEditingDay] = useState<PayslipDay | null>(null)
  const [dayForm, setDayForm] = useState({ time_in: '', time_out: '' })
  const [form, setForm] = useState<RatesForm | null>(null)
  const [deductionRows, setDeductionRows] = useState<DeductionRow[]>([])
  const [addSelection, setAddSelection] = useState('')

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
    mutationFn: (payload: { dayId: string; time_in: string | null; time_out: string | null }) =>
      payrollService.updatePayslipDay(payslipId, payload.dayId, {
        time_in: payload.time_in,
        time_out: payload.time_out,
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
    setAddSelection('')
    if (!value) return
    if (value === 'custom') {
      setDeductionRows((prev) => [
        ...prev,
        {
          key: `new-${Date.now()}-${prev.length}`,
          deduction_type_id: null,
          name: '',
          amount: '',
          employer_amount: '',
        },
      ])
      return
    }
    const type = activeTypes.find((t) => t.id === value)
    if (!type) return
    setDeductionRows((prev) => [
      ...prev,
      {
        key: `new-${Date.now()}-${prev.length}`,
        deduction_type_id: type.id,
        name: type.name,
        amount: String(type.default_amount || ''),
        employer_amount: type.has_employer_share ? String(type.default_employer_amount || '') : '',
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
        .filter((row) => row.name.trim() !== '')
        .map((row) => ({
          deduction_type_id: row.deduction_type_id,
          name: row.name.trim(),
          amount: numberOrZero(row.amount),
          employer_amount: numberOrZero(row.employer_amount),
        })),
    })
  }

  const addOptions = [
    ...activeTypes.map((type) => ({
      value: type.id,
      label: type.default_amount > 0 ? `${type.name} (${peso(type.default_amount)})` : type.name,
    })),
    { value: 'custom', label: 'Custom deduction…' },
  ]

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
          <Button size="sm" onClick={() => setShowPrint(true)}>
            <PrinterIcon className="h-4 w-4" />
            Print record
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
          </div>
          <div className="max-h-[32rem] overflow-y-auto overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50">
                <tr className="text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-2.5">Date</th>
                  <th className="px-4 py-2.5">In</th>
                  <th className="px-4 py-2.5">Out</th>
                  <th className="px-4 py-2.5 text-right">Hours</th>
                  <th className="px-4 py-2.5 text-right">Earned</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {payslip.days.map((day) => {
                  const off = day.is_rest_day || day.is_holiday
                  return (
                    <tr
                      key={day.id}
                      className={`border-b border-gray-50 ${off ? 'bg-red-50/40' : ''} ${
                        !readOnly ? 'cursor-pointer hover:bg-indigo-50/40' : ''
                      }`}
                      onClick={() => {
                        if (readOnly) return
                        setDayForm({ time_in: day.time_in || '', time_out: day.time_out || '' })
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
                      </td>
                      <td className="px-4 py-2 tabular-nums">{time12(day.time_in) || '—'}</td>
                      <td className="px-4 py-2 tabular-nums">{time12(day.time_out) || '—'}</td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {day.hours_worked > 0 ? day.hours_worked : '—'}
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
                    const employerDisabled = readOnly || (rowType ? !rowType.has_employer_share : false)
                    return (
                      <div key={row.key} className="grid grid-cols-[1fr_5.5rem_5.5rem_1.75rem] items-center gap-2">
                        <Input
                          type="text"
                          size="sm"
                          value={row.name}
                          placeholder="Deduction name"
                          disabled={readOnly || row.deduction_type_id !== null}
                          onChange={(e) =>
                            setDeductionRows((prev) =>
                              prev.map((r, i) => (i === index ? { ...r, name: e.target.value } : r))
                            )
                          }
                        />
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          size="sm"
                          value={row.amount}
                          placeholder="0.00"
                          disabled={readOnly}
                          onChange={(e) =>
                            setDeductionRows((prev) =>
                              prev.map((r, i) => (i === index ? { ...r, amount: e.target.value } : r))
                            )
                          }
                        />
                        {employerDisabled && !readOnly ? (
                          <span className="text-center text-xs text-gray-400">—</span>
                        ) : (
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            size="sm"
                            value={row.employer_amount}
                            placeholder="0.00"
                            disabled={employerDisabled}
                            onChange={(e) =>
                              setDeductionRows((prev) =>
                                prev.map((r, i) =>
                                  i === index ? { ...r, employer_amount: e.target.value } : r
                                )
                              )
                            }
                          />
                        )}
                        {!readOnly ? (
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
                    )
                  })}
                </div>
                {!readOnly && (
                  <div className="mt-2">
                    <Select
                      inputSize="sm"
                      options={addOptions}
                      placeholder="+ Add deduction…"
                      value={addSelection}
                      onChange={(e) => addDeduction(e.target.value)}
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
                <dt className="text-gray-500">Total salary earned</dt>
                <dd className="font-medium tabular-nums">{peso(payslip.gross_pay)}</dd>
              </div>
              {payslip.deductions.map((deduction) => (
                <div key={deduction.id || deduction.name} className="flex justify-between">
                  <dt className="text-gray-500">{deduction.name}</dt>
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

      {showPrint && <PayslipPrintModal payslip={payslip} onClose={() => setShowPrint(false)} />}
    </div>
  )
}

export default PayslipDetail
