import React, { useEffect, useState } from 'react'
import { ArrowLeftIcon, PencilSquareIcon, PrinterIcon } from '@heroicons/react/24/outline'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { Button } from '../../../components/button'
import { Input } from '../../../components/input'
import { payrollService } from '../../../services/payrollService'
import type { Payslip, PayslipDay, UpdatePayslipData } from '../../../types'
import { dayLabel, errorMessage, numberOrZero, peso, time12 } from './helpers'
import PayslipPrintModal from './PayslipPrintModal'

interface PayslipDetailProps {
  payslipId: string
  periodFinalized: boolean
  onBack: () => void
}

interface DeductionForm {
  designation: string
  daily_rate: string
  hourly_rate: string
  sss_employee: string
  pagibig_employee: string
  philhealth_employee: string
  advance: string
  other_deductions: string
  other_deductions_note: string
  sss_employer: string
  pagibig_employer: string
  philhealth_employer: string
}

const formFromPayslip = (payslip: Payslip): DeductionForm => ({
  designation: payslip.designation || '',
  daily_rate: String(payslip.daily_rate),
  hourly_rate: String(payslip.hourly_rate),
  sss_employee: String(payslip.sss_employee),
  pagibig_employee: String(payslip.pagibig_employee),
  philhealth_employee: String(payslip.philhealth_employee),
  advance: String(payslip.advance),
  other_deductions: String(payslip.other_deductions),
  other_deductions_note: payslip.other_deductions_note || '',
  sss_employer: String(payslip.sss_employer),
  pagibig_employer: String(payslip.pagibig_employer),
  philhealth_employer: String(payslip.philhealth_employer),
})

const PayslipDetail: React.FC<PayslipDetailProps> = ({ payslipId, periodFinalized, onBack }) => {
  const queryClient = useQueryClient()
  const [showPrint, setShowPrint] = useState(false)
  const [editingDay, setEditingDay] = useState<PayslipDay | null>(null)
  const [dayForm, setDayForm] = useState({ time_in: '', time_out: '' })
  const [form, setForm] = useState<DeductionForm | null>(null)

  const payslipQuery = useQuery({
    queryKey: ['payslip', payslipId],
    queryFn: () => payrollService.getPayslip(payslipId),
  })

  const payslip = payslipQuery.data?.data

  useEffect(() => {
    if (payslip) setForm(formFromPayslip(payslip))
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
  const setField = (key: keyof DeductionForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => (prev ? { ...prev, [key]: e.target.value } : prev))

  const saveDeductions = (e: React.FormEvent) => {
    e.preventDefault()
    updateMutation.mutate({
      designation: form.designation.trim() || null,
      daily_rate: numberOrZero(form.daily_rate),
      hourly_rate: numberOrZero(form.hourly_rate),
      sss_employee: numberOrZero(form.sss_employee),
      pagibig_employee: numberOrZero(form.pagibig_employee),
      philhealth_employee: numberOrZero(form.philhealth_employee),
      advance: numberOrZero(form.advance),
      other_deductions: numberOrZero(form.other_deductions),
      other_deductions_note: form.other_deductions_note.trim() || null,
      sss_employer: numberOrZero(form.sss_employer),
      pagibig_employer: numberOrZero(form.pagibig_employer),
      philhealth_employer: numberOrZero(form.philhealth_employer),
    })
  }

  const moneyField = (label: string, key: keyof DeductionForm) => (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-600">{label}</label>
      <Input
        type="number"
        min="0"
        step="0.01"
        value={form[key]}
        onChange={setField(key)}
        disabled={readOnly}
      />
    </div>
  )

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
                {moneyField('Daily rate', 'daily_rate')}
                {moneyField('Hourly rate', 'hourly_rate')}
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Deductions (employee's share)
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {moneyField('SSS', 'sss_employee')}
                  {moneyField('Pag-IBIG', 'pagibig_employee')}
                  {moneyField('PhilHealth', 'philhealth_employee')}
                  {moneyField('Advance', 'advance')}
                  {moneyField('Others', 'other_deductions')}
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">Others note</label>
                    <Input
                      type="text"
                      value={form.other_deductions_note}
                      onChange={setField('other_deductions_note')}
                      disabled={readOnly}
                      placeholder="e.g. Uniform"
                    />
                  </div>
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Other benefits (employer's share)
                </p>
                <div className="grid grid-cols-3 gap-3">
                  {moneyField('SSS', 'sss_employer')}
                  {moneyField('Pag-IBIG', 'pagibig_employer')}
                  {moneyField('PhilHealth', 'philhealth_employer')}
                </div>
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
              <div className="flex justify-between">
                <dt className="text-gray-500">Total deductions</dt>
                <dd className="font-medium tabular-nums text-red-600">
                  −{peso(payslip.total_deductions)}
                </dd>
              </div>
              <div className="flex justify-between border-t border-gray-100 pt-2 text-base">
                <dt className="font-semibold text-gray-900">Net cash earned</dt>
                <dd className="font-bold tabular-nums text-green-700">{peso(payslip.net_pay)}</dd>
              </div>
              <div className="flex justify-between pt-2">
                <dt className="text-gray-500">Employer's share (SSS + Pag-IBIG + PhilHealth)</dt>
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
