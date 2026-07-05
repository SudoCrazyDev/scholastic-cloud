import React, { useMemo, useState } from 'react'
import { MagnifyingGlassIcon, PencilSquareIcon } from '@heroicons/react/24/outline'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { Button } from '../../../components/button'
import { Input } from '../../../components/input'
import { payrollService } from '../../../services/payrollService'
import type { PayrollStaffCompensation, SavePayrollCompensationData } from '../../../types'
import { errorMessage, numberOrZero, peso } from './helpers'

interface CompensationForm {
  designation: string
  daily_rate: string
  hourly_rate: string
  hours_per_day: string
  sss_employee: string
  pagibig_employee: string
  philhealth_employee: string
  sss_employer: string
  pagibig_employer: string
  philhealth_employer: string
}

const emptyForm = (): CompensationForm => ({
  designation: '',
  daily_rate: '',
  hourly_rate: '',
  hours_per_day: '8',
  sss_employee: '',
  pagibig_employee: '',
  philhealth_employee: '',
  sss_employer: '',
  pagibig_employer: '',
  philhealth_employer: '',
})

const CompensationTab: React.FC = () => {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<PayrollStaffCompensation | null>(null)
  const [form, setForm] = useState<CompensationForm>(emptyForm())
  const [formError, setFormError] = useState<string | null>(null)

  const compensationsQuery = useQuery({
    queryKey: ['payroll-compensations'],
    queryFn: () => payrollService.getCompensations(),
  })

  const rows = useMemo<PayrollStaffCompensation[]>(
    () => compensationsQuery.data?.data || [],
    [compensationsQuery.data]
  )

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return rows
    return rows.filter(
      (row) =>
        row.staff_name.toLowerCase().includes(term) ||
        row.email.toLowerCase().includes(term) ||
        (row.role_title || '').toLowerCase().includes(term) ||
        (row.compensation?.designation || '').toLowerCase().includes(term)
    )
  }, [rows, search])

  const saveMutation = useMutation({
    mutationFn: (payload: { userId: string; data: SavePayrollCompensationData }) =>
      payrollService.saveCompensation(payload.userId, payload.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payroll-compensations'] })
      setEditing(null)
      toast.success('Compensation saved.')
    },
    onError: (err: unknown) => {
      const message = errorMessage(err, 'Failed to save compensation.')
      setFormError(message)
      toast.error(message)
    },
  })

  const openEditor = (row: PayrollStaffCompensation) => {
    const c = row.compensation
    setForm({
      designation: c?.designation || '',
      daily_rate: c ? String(c.daily_rate) : '',
      hourly_rate: c?.hourly_rate != null ? String(c.hourly_rate) : '',
      hours_per_day: c ? String(c.hours_per_day) : '8',
      sss_employee: c ? String(c.sss_employee) : '',
      pagibig_employee: c ? String(c.pagibig_employee) : '',
      philhealth_employee: c ? String(c.philhealth_employee) : '',
      sss_employer: c ? String(c.sss_employer) : '',
      pagibig_employer: c ? String(c.pagibig_employer) : '',
      philhealth_employer: c ? String(c.philhealth_employer) : '',
    })
    setFormError(null)
    setEditing(row)
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!editing) return
    saveMutation.mutate({
      userId: editing.user_id,
      data: {
        designation: form.designation.trim() || null,
        daily_rate: numberOrZero(form.daily_rate),
        hourly_rate: form.hourly_rate.trim() === '' ? null : numberOrZero(form.hourly_rate),
        hours_per_day: numberOrZero(form.hours_per_day) || 8,
        sss_employee: numberOrZero(form.sss_employee),
        pagibig_employee: numberOrZero(form.pagibig_employee),
        philhealth_employee: numberOrZero(form.philhealth_employee),
        sss_employer: numberOrZero(form.sss_employer),
        pagibig_employer: numberOrZero(form.pagibig_employer),
        philhealth_employer: numberOrZero(form.philhealth_employer),
      },
    })
  }

  const setField = (key: keyof CompensationForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }))

  const moneyField = (label: string, key: keyof CompensationForm, required = false) => (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-600">{label}</label>
      <Input
        type="number"
        min="0"
        step="0.01"
        required={required}
        value={form[key]}
        onChange={setField(key)}
        placeholder="0.00"
      />
    </div>
  )

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 p-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Employee Rates & Contributions</h2>
          <p className="text-sm text-gray-500">
            Set each staff member's daily/hourly rate and the default SSS, Pag-IBIG and PhilHealth
            amounts used when generating payslips.
          </p>
        </div>
        <div className="relative w-full max-w-xs">
          <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search staff…"
            className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
              <th className="px-4 py-3">Staff</th>
              <th className="px-4 py-3">Designation</th>
              <th className="px-4 py-3 text-right">Daily Rate</th>
              <th className="px-4 py-3 text-right">Hourly Rate</th>
              <th className="px-4 py-3 text-right">SSS</th>
              <th className="px-4 py-3 text-right">Pag-IBIG</th>
              <th className="px-4 py-3 text-right">PhilHealth</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {compensationsQuery.isLoading ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-gray-400">
                  Loading staff…
                </td>
              </tr>
            ) : filteredRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-gray-400">
                  No staff found.
                </td>
              </tr>
            ) : (
              filteredRows.map((row) => {
                const c = row.compensation
                return (
                  <tr key={row.user_id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{row.staff_name}</p>
                      <p className="text-xs text-gray-500">{row.role_title || row.email}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{c?.designation || '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {c ? peso(c.daily_rate) : <span className="text-gray-400">not set</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-600">
                      {c ? (
                        <>
                          {peso(c.effective_hourly_rate)}
                          {c.hourly_rate == null && (
                            <span className="ml-1 text-xs text-gray-400">(auto)</span>
                          )}
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-600">
                      {c ? peso(c.sss_employee) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-600">
                      {c ? peso(c.pagibig_employee) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-600">
                      {c ? peso(c.philhealth_employee) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="outline" size="sm" onClick={() => openEditor(row)}>
                        <PencilSquareIcon className="h-4 w-4" />
                        {c ? 'Edit' : 'Set rates'}
                      </Button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setEditing(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-gray-200 px-6 py-4">
              <h3 className="text-lg font-semibold text-gray-900">Compensation — {editing.staff_name}</h3>
              <p className="text-sm text-gray-500">{editing.role_title || editing.email}</p>
            </div>
            <form onSubmit={submit} className="space-y-5 p-6">
              {formError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="sm:col-span-3">
                  <label className="mb-1 block text-xs font-medium text-gray-600">Designation</label>
                  <Input
                    type="text"
                    value={form.designation}
                    onChange={setField('designation')}
                    placeholder="e.g. Classroom Teacher"
                  />
                </div>
                {moneyField('Daily rate (₱)', 'daily_rate', true)}
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Hourly rate (₱)</label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.hourly_rate}
                    onChange={setField('hourly_rate')}
                    placeholder="auto: daily ÷ hours"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Working hours per day</label>
                  <Input
                    type="number"
                    min="1"
                    max="24"
                    step="0.5"
                    required
                    value={form.hours_per_day}
                    onChange={setField('hours_per_day')}
                  />
                </div>
              </div>

              <div>
                <p className="mb-2 text-sm font-medium text-gray-700">
                  Deductions — employee's share (per payroll period)
                </p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  {moneyField('SSS', 'sss_employee')}
                  {moneyField('Pag-IBIG', 'pagibig_employee')}
                  {moneyField('PhilHealth', 'philhealth_employee')}
                </div>
              </div>

              <div>
                <p className="mb-2 text-sm font-medium text-gray-700">
                  Other benefits — employer's share (per payroll period)
                </p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  {moneyField('SSS', 'sss_employer')}
                  {moneyField('Pag-IBIG', 'pagibig_employer')}
                  {moneyField('PhilHealth', 'philhealth_employer')}
                </div>
              </div>

              <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
                <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? 'Saving…' : 'Save compensation'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default CompensationTab
