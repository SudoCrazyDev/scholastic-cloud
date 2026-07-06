import React, { useMemo, useState } from 'react'
import { MagnifyingGlassIcon, PencilSquareIcon } from '@heroicons/react/24/outline'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { Button } from '../../../components/button'
import { Input } from '../../../components/input'
import { payrollService } from '../../../services/payrollService'
import type {
  PayrollDeductionType,
  PayrollStaffCompensation,
  SavePayrollCompensationData,
} from '../../../types'
import { errorMessage, numberOrZero, peso } from './helpers'

interface CompensationForm {
  designation: string
  daily_rate: string
  hourly_rate: string
  hours_per_day: string
  // deduction_type_id -> amount (as entered)
  deductions: Record<string, string>
  employerDeductions: Record<string, string>
}

const emptyForm = (): CompensationForm => ({
  designation: '',
  daily_rate: '',
  hourly_rate: '',
  hours_per_day: '8',
  deductions: {},
  employerDeductions: {},
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

  const typesQuery = useQuery({
    queryKey: ['payroll-deduction-types'],
    queryFn: () => payrollService.getDeductionTypes(),
  })

  const rows = useMemo<PayrollStaffCompensation[]>(
    () => compensationsQuery.data?.data || [],
    [compensationsQuery.data]
  )

  const activeTypes = useMemo<PayrollDeductionType[]>(
    () => (typesQuery.data?.data || []).filter((type) => type.is_active),
    [typesQuery.data]
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
    const deductionAmounts: Record<string, string> = {}
    const employerAmounts: Record<string, string> = {}
    for (const type of activeTypes) {
      const existing = c?.deductions.find((d) => d.deduction_type_id === type.id)
      // Existing staff amounts win; otherwise pre-fill the type's defaults.
      deductionAmounts[type.id] = existing
        ? String(existing.amount)
        : c
          ? '0'
          : String(type.default_amount)
      employerAmounts[type.id] = existing
        ? String(existing.employer_amount)
        : c
          ? '0'
          : String(type.default_employer_amount)
    }
    setForm({
      designation: c?.designation || '',
      daily_rate: c ? String(c.daily_rate) : '',
      hourly_rate: c?.hourly_rate != null ? String(c.hourly_rate) : '',
      hours_per_day: c ? String(c.hours_per_day) : '8',
      deductions: deductionAmounts,
      employerDeductions: employerAmounts,
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
        deductions: activeTypes.map((type) => ({
          deduction_type_id: type.id,
          amount: numberOrZero(form.deductions[type.id] ?? ''),
          employer_amount: type.has_employer_share
            ? numberOrZero(form.employerDeductions[type.id] ?? '')
            : 0,
        })),
      },
    })
  }

  const setField = (key: Exclude<keyof CompensationForm, 'deductions' | 'employerDeductions'>) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }))

  const setDeduction = (typeId: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, deductions: { ...prev.deductions, [typeId]: e.target.value } }))

  const setEmployerDeduction = (typeId: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({
      ...prev,
      employerDeductions: { ...prev.employerDeductions, [typeId]: e.target.value },
    }))

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 p-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Employee Rates & Contributions</h2>
          <p className="text-sm text-gray-500">
            Set each staff member's daily/hourly rate and default deduction amounts used when
            generating payslips. Manage the deduction list in the Deduction Types tab.
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
              <th className="px-4 py-3">Deductions / period</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {compensationsQuery.isLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                  Loading staff…
                </td>
              </tr>
            ) : filteredRows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                  No staff found.
                </td>
              </tr>
            ) : (
              filteredRows.map((row) => {
                const c = row.compensation
                const appliedDeductions = (c?.deductions || []).filter((d) => d.amount > 0)
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
                    <td className="px-4 py-3 text-gray-600">
                      {c ? (
                        appliedDeductions.length > 0 ? (
                          <span title={appliedDeductions.map((d) => `${d.name}: ${peso(d.amount)}`).join(', ')}>
                            <span className="tabular-nums font-medium">{peso(c.deductions_total)}</span>
                            <span className="ml-1 text-xs text-gray-400">
                              ({appliedDeductions.map((d) => d.name).join(', ')})
                            </span>
                          </span>
                        ) : (
                          'none'
                        )
                      ) : (
                        '—'
                      )}
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
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Daily rate (₱)</label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={form.daily_rate}
                    onChange={setField('daily_rate')}
                    placeholder="0.00"
                  />
                </div>
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
                  Deductions (per payroll period)
                </p>
                {activeTypes.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-gray-300 px-4 py-3 text-sm text-gray-400">
                    No deduction types yet — add them in the Deduction Types tab (e.g. SSS,
                    Pag-IBIG, PhilHealth, Cash Advance).
                  </p>
                ) : (
                  <div className="overflow-hidden rounded-lg border border-gray-200">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50/50 text-left text-xs font-medium text-gray-500">
                          <th className="px-3 py-2">Deduction</th>
                          <th className="px-3 py-2">Employee's share</th>
                          <th className="px-3 py-2">Employer's share</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeTypes.map((type) => (
                          <tr key={type.id} className="border-b border-gray-50 last:border-0">
                            <td className="px-3 py-2 font-medium text-gray-700">{type.name}</td>
                            <td className="px-3 py-2">
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                size="sm"
                                value={form.deductions[type.id] ?? ''}
                                onChange={setDeduction(type.id)}
                                placeholder="0.00"
                              />
                            </td>
                            <td className="px-3 py-2">
                              {type.has_employer_share ? (
                                <Input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  size="sm"
                                  value={form.employerDeductions[type.id] ?? ''}
                                  onChange={setEmployerDeduction(type.id)}
                                  placeholder="0.00"
                                />
                              ) : (
                                <span className="text-xs text-gray-400">not shared</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <p className="mt-1.5 text-xs text-gray-400">
                  Rows where both amounts are 0 are not applied when generating payslips.
                  Employer shares appear under Other Benefits on the printed record.
                </p>
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
