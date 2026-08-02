import React, { useMemo, useState } from 'react'
import {
  ChevronRightIcon,
  PencilSquareIcon,
  PlusIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { Button } from '../../../components/button'
import { Input } from '../../../components/input'
import { Select } from '../../../components/select'
import { ConfirmationModal } from '../../../components'
import { payrollService } from '../../../services/payrollService'
import type {
  PayrollBracketAmountType,
  PayrollDeductionBracket,
  PayrollDeductionCalculationType,
  PayrollDeductionPercentBasis,
  PayrollDeductionType,
  SavePayrollDeductionTypeData,
} from '../../../types'
import {
  BASIS_LABELS,
  BASIS_OPTIONS,
  bracketShareLabel,
  bracketSpanLabel,
  errorMessage,
  numberOrZero,
  peso,
  rangeLabel,
  rateLabel,
} from './helpers'

const CALCULATION_OPTIONS = [
  { value: 'fixed', label: 'Fixed amount (₱) — the same every period' },
  { value: 'percentage', label: 'Percentage of salary (%)' },
  { value: 'bracket', label: 'Salary ranges — a table of brackets (SSS, PhilHealth)' },
]

const AMOUNT_TYPE_OPTIONS = [
  { value: 'fixed', label: '₱' },
  { value: 'percentage', label: '%' },
]

// One range as it is being typed. Blank is meaningful on the ceiling — it is
// the open-ended top range — so the fields stay strings until they are saved.
interface BracketRow {
  key: string
  min_salary: string
  max_salary: string
  amount_type: PayrollBracketAmountType
  employee: string
  employer: string
}

interface FormState {
  name: string
  calculation_type: PayrollDeductionCalculationType
  default_amount: string
  rate_percent: string
  has_employer_share: boolean
  default_employer_amount: string
  employer_rate_percent: string
  percent_basis: PayrollDeductionPercentBasis
  is_active: boolean
  apply_to_all_staff: boolean
  brackets: BracketRow[]
}

let bracketKeySeq = 0
const newBracketRow = (min = ''): BracketRow => ({
  key: `bracket-${bracketKeySeq++}`,
  min_salary: min,
  max_salary: '',
  amount_type: 'fixed',
  employee: '',
  employer: '',
})

const bracketRowsFrom = (brackets: PayrollDeductionBracket[]): BracketRow[] =>
  brackets.map((bracket) => ({
    key: `bracket-${bracketKeySeq++}`,
    min_salary: String(bracket.min_salary),
    max_salary: bracket.max_salary === null ? '' : String(bracket.max_salary),
    amount_type: bracket.amount_type,
    employee: String(
      bracket.amount_type === 'percentage' ? bracket.employee_rate_percent : bracket.employee_amount
    ),
    employer: String(
      bracket.amount_type === 'percentage' ? bracket.employer_rate_percent : bracket.employer_amount
    ),
  }))

const emptyForm = (): FormState => ({
  name: '',
  calculation_type: 'fixed',
  default_amount: '',
  rate_percent: '',
  has_employer_share: false,
  default_employer_amount: '',
  employer_rate_percent: '',
  percent_basis: 'basic_pay',
  is_active: true,
  apply_to_all_staff: false,
  brackets: [newBracketRow('0')],
})

// How a type's employee/employer figure reads in the list. A bracket type has
// no single figure — the salary picks one — so the column spans the table
// instead, and the table itself folds out underneath the name.
const figureLabel = (type: PayrollDeductionType, employer: boolean): React.ReactNode => {
  if (employer && !type.has_employer_share) return '—'

  if (type.calculation_type === 'bracket') {
    const span = bracketSpanLabel(type.brackets, employer)
    if (span === null) {
      return <span className="text-xs text-gray-400">no ranges yet</span>
    }
    return span
  }

  if (type.calculation_type === 'percentage') {
    const rate = employer ? type.employer_rate_percent : type.rate_percent
    if (rate > 0) return rateLabel(rate, type.percent_basis)
    return employer ? <span className="text-xs text-gray-400">shared, no rate</span> : '—'
  }

  const amount = employer ? type.default_employer_amount : type.default_amount
  if (amount > 0) return peso(amount)
  return employer ? <span className="text-xs text-gray-400">shared, no default</span> : '—'
}

// The range table under a bracket type's row, so the schedule can be read
// without opening the editor.
//
// Folded away by default: a real contribution schedule runs to twenty-odd
// rows, and spilling every one of them into the list would bury the other
// deductions under a single type's table.
const BracketSummary: React.FC<{ type: PayrollDeductionType }> = ({ type }) => {
  const [open, setOpen] = useState(false)
  const count = type.brackets.length

  return (
    <div className="mt-1.5">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="-ml-1 flex items-center gap-1 rounded px-1 py-0.5 text-xs font-normal text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
      >
        <ChevronRightIcon
          className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-90' : ''}`}
        />
        {count} {count === 1 ? 'range' : 'ranges'}
      </button>
      {open && (
        <table className="mt-1.5 w-full max-w-lg text-xs">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wide text-gray-400">
              <th className="py-1 pr-3 font-medium">
                Salary range ({BASIS_LABELS[type.percent_basis]})
              </th>
              <th className="py-1 pr-3 text-right font-medium">Employee</th>
              {type.has_employer_share && <th className="py-1 text-right font-medium">Employer</th>}
            </tr>
          </thead>
          <tbody>
            {type.brackets.map((bracket, index) => (
              <tr key={bracket.id || index} className="text-gray-600">
                <td className="py-0.5 pr-3 tabular-nums">
                  {rangeLabel(bracket.min_salary, bracket.max_salary)}
                </td>
                <td className="py-0.5 pr-3 text-right tabular-nums">
                  {bracketShareLabel(bracket, false)}
                </td>
                {type.has_employer_share && (
                  <td className="py-0.5 text-right tabular-nums">
                    {bracketShareLabel(bracket, true)}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

const DeductionTypesTab: React.FC = () => {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [formError, setFormError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<PayrollDeductionType | null>(null)

  const isPercentage = form.calculation_type === 'percentage'
  const isBracket = form.calculation_type === 'bracket'
  // Both of these read a salary — one to take a percentage of, one to look up
  // in the table — so they share the "percentage of what?" question.
  const readsSalary = isPercentage || isBracket

  const typesQuery = useQuery({
    queryKey: ['payroll-deduction-types'],
    queryFn: () => payrollService.getDeductionTypes(),
  })

  const types = useMemo<PayrollDeductionType[]>(() => typesQuery.data?.data || [], [typesQuery.data])

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['payroll-deduction-types'] })
    queryClient.invalidateQueries({ queryKey: ['payroll-compensations'] })
  }

  const saveMutation = useMutation({
    mutationFn: (payload: { id: string | null; data: SavePayrollDeductionTypeData }) =>
      payload.id
        ? payrollService.updateDeductionType(payload.id, payload.data)
        : payrollService.createDeductionType(payload.data),
    // The server message reports how many employees the amounts reached.
    onSuccess: (response, payload) => {
      invalidate()
      setShowForm(false)
      toast.success(
        response?.message || (payload.id ? 'Deduction type updated.' : 'Deduction type added.')
      )
    },
    onError: (err: unknown) => {
      const message = errorMessage(err, 'Failed to save deduction type.')
      setFormError(message)
      toast.error(message)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => payrollService.deleteDeductionType(id),
    onSuccess: () => {
      invalidate()
      setDeleting(null)
      toast.success('Deduction type deleted.')
    },
    onError: (err: unknown) => {
      setDeleting(null)
      toast.error(errorMessage(err, 'Failed to delete deduction type.'))
    },
  })

  const openCreate = () => {
    setForm(emptyForm())
    setEditingId(null)
    setFormError(null)
    setShowForm(true)
  }

  const openEdit = (type: PayrollDeductionType) => {
    setForm({
      name: type.name,
      calculation_type: type.calculation_type,
      default_amount: String(type.default_amount),
      rate_percent: String(type.rate_percent),
      has_employer_share: type.has_employer_share,
      default_employer_amount: String(type.default_employer_amount),
      employer_rate_percent: String(type.employer_rate_percent),
      percent_basis: type.percent_basis,
      is_active: type.is_active,
      apply_to_all_staff: false,
      brackets: type.brackets.length > 0 ? bracketRowsFrom(type.brackets) : [newBracketRow('0')],
    })
    setEditingId(type.id)
    setFormError(null)
    setShowForm(true)
  }

  const setBracket = (index: number, patch: Partial<BracketRow>) =>
    setForm((prev) => ({
      ...prev,
      brackets: prev.brackets.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    }))

  // A new range starts where the last one left off, which is the way the
  // schedules are read off a table and saves retyping the boundary.
  //
  // The row — and with it the key — is minted out here rather than inside the
  // updater: an updater has to be pure, and one that bumps a counter every
  // time React replays it hands two rows the same key.
  const addBracket = () => {
    const row = newBracketRow()
    setForm((prev) => {
      const last = prev.brackets[prev.brackets.length - 1]
      const nextMin =
        last && last.max_salary.trim() !== '' ? String(numberOrZero(last.max_salary) + 0.01) : ''
      return { ...prev, brackets: [...prev.brackets, { ...row, min_salary: nextMin }] }
    })
  }

  const removeBracket = (index: number) =>
    setForm((prev) => ({ ...prev, brackets: prev.brackets.filter((_, i) => i !== index) }))

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (isBracket && form.brackets.length === 0) {
      setFormError('Add at least one salary range.')
      return
    }
    // The server ignores everything that does not apply, but sending zeroes
    // keeps the payload honest about what was actually filled in.
    saveMutation.mutate({
      id: editingId,
      data: {
        name: form.name.trim(),
        calculation_type: form.calculation_type,
        default_amount: isPercentage || isBracket ? 0 : numberOrZero(form.default_amount),
        rate_percent: isPercentage ? numberOrZero(form.rate_percent) : 0,
        has_employer_share: form.has_employer_share,
        default_employer_amount:
          !isPercentage && !isBracket && form.has_employer_share
            ? numberOrZero(form.default_employer_amount)
            : 0,
        employer_rate_percent:
          isPercentage && form.has_employer_share
            ? numberOrZero(form.employer_rate_percent)
            : 0,
        percent_basis: form.percent_basis,
        is_active: form.is_active,
        apply_to_all_staff: editingId ? form.apply_to_all_staff : undefined,
        brackets: isBracket
          ? form.brackets.map((row) => {
              const percentage = row.amount_type === 'percentage'
              return {
                min_salary: numberOrZero(row.min_salary),
                // Blank is the open-ended top range, not zero.
                max_salary: row.max_salary.trim() === '' ? null : numberOrZero(row.max_salary),
                amount_type: row.amount_type,
                employee_amount: percentage ? 0 : numberOrZero(row.employee),
                employee_rate_percent: percentage ? numberOrZero(row.employee) : 0,
                employer_amount:
                  !percentage && form.has_employer_share ? numberOrZero(row.employer) : 0,
                employer_rate_percent:
                  percentage && form.has_employer_share ? numberOrZero(row.employer) : 0,
              }
            })
          : undefined,
      },
    })
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 p-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Deduction Types</h2>
          <p className="text-sm text-gray-500">
            The deductions your institution uses — e.g. SSS, Pag-IBIG, PhilHealth, Cash Advance.
            Each one is a fixed peso amount, a percentage of salary (5% of basic pay), or a table of
            salary ranges where the salary picks the bracket and the bracket says what the employee
            and the employer each pay. A type saved with a default is applied to every employee's
            rates right away, so you never add it one by one. Individual figures can still be
            adjusted in Employee Rates.
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <PlusIcon className="h-4 w-4" />
          Add Deduction Type
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3 text-right">Default (Employee)</th>
              <th className="px-4 py-3 text-right">Default (Employer)</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {typesQuery.isLoading ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-gray-400">
                  Loading deduction types…
                </td>
              </tr>
            ) : types.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-gray-400">
                  No deduction types yet. Add the ones your school uses — e.g. SSS, Pag-IBIG,
                  PhilHealth, Cash Advance.
                </td>
              </tr>
            ) : (
              types.map((type) => (
                <tr key={type.id} className="border-b border-gray-50 align-top hover:bg-gray-50/50">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {type.name}
                    {type.calculation_type === 'percentage' && (
                      <span className="ml-2 rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                        % of salary
                      </span>
                    )}
                    {type.calculation_type === 'bracket' && (
                      <span className="ml-2 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                        salary ranges
                      </span>
                    )}
                    {type.calculation_type === 'bracket' && type.brackets.length > 0 && (
                      <BracketSummary type={type} />
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{figureLabel(type, false)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{figureLabel(type, true)}</td>
                  <td className="px-4 py-3">
                    {type.is_active ? (
                      <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        title="Edit"
                        onClick={() => openEdit(type)}
                        className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                      >
                        <PencilSquareIcon className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        title="Delete"
                        onClick={() => setDeleting(type)}
                        className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
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
            className={`max-h-[90vh] w-full overflow-y-auto rounded-xl bg-white shadow-xl ${
              isBracket ? 'max-w-3xl' : 'max-w-md'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-gray-200 px-6 py-4">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingId ? 'Edit Deduction Type' : 'Add Deduction Type'}
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
                  placeholder="e.g. Cash Advance"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  How is it computed?
                </label>
                <Select
                  options={CALCULATION_OPTIONS}
                  value={form.calculation_type}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      calculation_type: e.target.value as PayrollDeductionCalculationType,
                    }))
                  }
                />
              </div>
              {isPercentage && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    Rate — employee's share (%)
                  </label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="0.001"
                    value={form.rate_percent}
                    onChange={(e) => setForm((prev) => ({ ...prev, rate_percent: e.target.value }))}
                    placeholder="e.g. 5"
                  />
                </div>
              )}
              {readsSalary && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    {isBracket ? 'Which salary picks the range?' : 'Percentage of what?'}
                  </label>
                  <Select
                    options={BASIS_OPTIONS}
                    value={form.percent_basis}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        percent_basis: e.target.value as PayrollDeductionPercentBasis,
                      }))
                    }
                  />
                  <p className="mt-1 text-xs text-gray-400">
                    Basic pay is the daily rate for every scheduled working day, whether or not it
                    was worked — so the contribution doesn't shrink because somebody was late or
                    absent. Pick salary earned only if the deduction should follow what was
                    actually paid out.
                  </p>
                </div>
              )}
              {!isPercentage && !isBracket && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    Default amount — employee's share (₱)
                  </label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.default_amount}
                    onChange={(e) => setForm((prev) => ({ ...prev, default_amount: e.target.value }))}
                    placeholder="0.00"
                  />
                </div>
              )}
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.has_employer_share}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, has_employer_share: e.target.checked }))
                  }
                  className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                Shared by employer (adds an employer counterpart, shown under Other Benefits)
              </label>
              {form.has_employer_share && isBracket && (
                <p className="rounded-lg bg-gray-50 px-3 py-2.5 text-xs text-gray-500">
                  The employer's share is set per range in the table below — that is the whole point
                  of a schedule, since the two sides rarely pay the same figure in the same bracket.
                </p>
              )}
              {form.has_employer_share &&
                !isBracket &&
                (isPercentage ? (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">
                      Rate — employer's share (%)
                    </label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="0.001"
                      value={form.employer_rate_percent}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, employer_rate_percent: e.target.value }))
                      }
                      placeholder="e.g. 10"
                    />
                    <p className="mt-1 text-xs text-gray-400">
                      Taken from the same salary as the employee's share.
                    </p>
                  </div>
                ) : (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">
                      Default amount — employer's share (₱)
                    </label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.default_employer_amount}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, default_employer_amount: e.target.value }))
                      }
                      placeholder="0.00"
                    />
                  </div>
                ))}
              {isBracket && (
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-700">Salary ranges</p>
                    <Button type="button" variant="outline" size="sm" onClick={addBracket}>
                      <PlusIcon className="h-4 w-4" />
                      Add range
                    </Button>
                  </div>
                  <div className="overflow-hidden rounded-lg border border-gray-200">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50/50 text-left text-xs font-medium text-gray-500">
                          <th className="px-3 py-2">Salary from (₱)</th>
                          <th className="px-3 py-2">Salary to (₱)</th>
                          <th className="w-28 px-3 py-2">₱ / %</th>
                          <th className="px-3 py-2">Employee</th>
                          <th className="px-3 py-2">Employer</th>
                          <th className="px-3 py-2 w-8" />
                        </tr>
                      </thead>
                      <tbody>
                        {form.brackets.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="px-3 py-6 text-center text-xs text-gray-400">
                              No ranges yet — add the first one.
                            </td>
                          </tr>
                        ) : (
                          form.brackets.map((row, index) => {
                            const percentage = row.amount_type === 'percentage'
                            const shareProps = percentage
                              ? { max: '100', step: '0.001', placeholder: '0' }
                              : { step: '0.01', placeholder: '0.00' }
                            return (
                              <tr key={row.key} className="border-b border-gray-50 last:border-0">
                                <td className="px-3 py-2">
                                  <Input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    size="sm"
                                    required
                                    value={row.min_salary}
                                    onChange={(e) => setBracket(index, { min_salary: e.target.value })}
                                    placeholder="0.00"
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <Input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    size="sm"
                                    value={row.max_salary}
                                    onChange={(e) => setBracket(index, { max_salary: e.target.value })}
                                    placeholder="no limit"
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <Select
                                    inputSize="sm"
                                    options={AMOUNT_TYPE_OPTIONS}
                                    value={row.amount_type}
                                    onChange={(e) =>
                                      setBracket(index, {
                                        amount_type: e.target.value as PayrollBracketAmountType,
                                      })
                                    }
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <Input
                                    type="number"
                                    min="0"
                                    size="sm"
                                    value={row.employee}
                                    onChange={(e) => setBracket(index, { employee: e.target.value })}
                                    {...shareProps}
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  {form.has_employer_share ? (
                                    <Input
                                      type="number"
                                      min="0"
                                      size="sm"
                                      value={row.employer}
                                      onChange={(e) => setBracket(index, { employer: e.target.value })}
                                      {...shareProps}
                                    />
                                  ) : (
                                    <span className="text-xs text-gray-400">not shared</span>
                                  )}
                                </td>
                                <td className="px-3 py-2">
                                  <button
                                    type="button"
                                    title="Remove range"
                                    onClick={() => removeBracket(index)}
                                    className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                                  >
                                    <XMarkIcon className="h-4 w-4" />
                                  </button>
                                </td>
                              </tr>
                            )
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-1.5 text-xs text-gray-400">
                    The staff member's {BASIS_LABELS[form.percent_basis]} for the period picks one
                    range, and that range says what each side pays. Leave the last "salary to" blank
                    for an open-ended top range. Ranges must not overlap; a salary below the first
                    range contributes at the first one, and one above the last at the last. Pick %
                    on a range to charge a percentage of the salary instead of a peso figure.
                  </p>
                </div>
              )}
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))}
                  className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                Active (available on rates and payslips)
              </label>
              {isBracket ? (
                <p className="rounded-lg bg-gray-50 px-3 py-2.5 text-xs text-gray-500">
                  The table applies to every employee as it stands — there is no per-employee figure
                  to hand out, since each salary picks its own range. Employee Rates can still take
                  an individual off this deduction. Already-generated payslips keep the figures they
                  were generated with until they are regenerated.
                </p>
              ) : editingId ? (
                <label className="flex items-start gap-2 rounded-lg bg-gray-50 px-3 py-2.5 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={form.apply_to_all_staff}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, apply_to_all_staff: e.target.checked }))
                    }
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span>
                    Apply {isPercentage ? 'these rates' : 'these amounts'} to all employees
                    <span className="block text-xs text-gray-500">
                      Replaces every employee's own {isPercentage ? 'rate' : 'amount'} for this
                      deduction — use it for a rate change everyone is on. Leave it off to only
                      reach employees who don't have this deduction yet. Already-generated payslips
                      keep their {isPercentage ? 'rates' : 'amounts'}.
                    </span>
                  </span>
                </label>
              ) : (
                <p className="rounded-lg bg-gray-50 px-3 py-2.5 text-xs text-gray-500">
                  Saving with a {isPercentage ? 'rate' : 'default amount'} above applies it to every
                  employee's rates right away.
                </p>
              )}
              <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
                <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? 'Saving…' : editingId ? 'Save changes' : 'Add type'}
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
        title="Delete deduction type"
        message={`Delete "${deleting?.name}"? It will be removed from every employee's default deductions. Existing payslips keep their recorded amounts.`}
        confirmText="Delete"
        variant="danger"
        loading={deleteMutation.isPending}
      />
    </div>
  )
}

export default DeductionTypesTab
