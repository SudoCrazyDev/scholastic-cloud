import React, { useMemo, useState } from 'react'
import {
  CheckCircleIcon,
  ChevronRightIcon,
  NoSymbolIcon,
  PencilSquareIcon,
  PlusIcon,
  TrashIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { Autocomplete, ConfirmationModal } from '../../../components'
import { Button } from '../../../components/button'
import { Input } from '../../../components/input'
import { Select } from '../../../components/select'
import { Textarea } from '../../../components/textarea'
import { usePermissions } from '../../../hooks'
import { payrollService } from '../../../services/payrollService'
import type {
  SaveStaffLoanData,
  StaffLoan,
  StaffLoanInterestMethod,
  StaffLoanRatePeriod,
  StaffLoanStatus,
} from '../../../types'
import { errorMessage, numberOrZero, peso, shortDate } from './helpers'
import {
  INTEREST_METHOD_OPTIONS,
  LOAN_STATUS_CLASSES,
  LOAN_STATUS_LABELS,
  RATE_PERIOD_OPTIONS,
  interestLabel,
  quoteLoan,
} from './loanMath'

const STATUS_FILTERS = [
  { value: '', label: 'All statuses' },
  { value: 'pending', label: 'For approval' },
  { value: 'approved', label: 'Collecting' },
  { value: 'completed', label: 'Fully paid' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'cancelled', label: 'Cancelled' },
]

interface FormState {
  user_id: string
  purpose: string
  principal_amount: string
  interest_method: StaffLoanInterestMethod
  interest_rate_percent: string
  rate_period: StaffLoanRatePeriod
  term_months: string
  first_deduction_date: string
}

/**
 * The first of next month. A loan agreed today is almost never collected out of
 * the payroll period already half-run — it starts on the next one.
 */
const firstOfNextMonth = (): string => {
  const now = new Date()
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-01`
}

const emptyForm = (): FormState => ({
  user_id: '',
  purpose: '',
  principal_amount: '',
  interest_method: 'none',
  interest_rate_percent: '',
  rate_period: 'monthly',
  term_months: '12',
  first_deduction_date: firstOfNextMonth(),
})

const formFromLoan = (loan: StaffLoan): FormState => ({
  user_id: loan.user_id,
  purpose: loan.purpose || '',
  principal_amount: String(loan.principal_amount),
  interest_method: loan.interest_method,
  interest_rate_percent: String(loan.interest_rate_percent),
  rate_period: loan.rate_period,
  term_months: String(loan.term_months),
  first_deduction_date: loan.first_deduction_date,
})

const StatusBadge: React.FC<{ status: StaffLoanStatus }> = ({ status }) => (
  <span
    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${LOAN_STATUS_CLASSES[status]}`}
  >
    {LOAN_STATUS_LABELS[status]}
  </span>
)

/**
 * How far through the schedule a loan is. The bar is the honest answer to "when
 * does this stop coming off my pay?" — the whole reason a loan is not just a
 * deduction type.
 */
const Progress: React.FC<{ loan: StaffLoan }> = ({ loan }) => {
  const paid = loan.total_payable > 0 ? (loan.amount_paid / loan.total_payable) * 100 : 0

  return (
    <div className="min-w-[7rem]">
      <div className="flex items-baseline justify-between text-xs">
        <span className="tabular-nums text-gray-600">
          {loan.installments_paid}/{loan.term_months}
        </span>
        <span className="tabular-nums text-gray-400">{peso(loan.balance)} left</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-full rounded-full bg-primary-500"
          style={{ width: `${Math.min(100, Math.max(0, paid))}%` }}
        />
      </div>
    </div>
  )
}

const LoansTab: React.FC = () => {
  const queryClient = useQueryClient()
  const { can } = usePermissions()
  const canManage = can('payroll', 'manage')
  const canApprove = can('payroll', 'approve-loan')

  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [formError, setFormError] = useState<string | null>(null)
  const [showSchedule, setShowSchedule] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<StaffLoan | null>(null)
  // Rejecting and cancelling both need a reason on the record, so they open a
  // note prompt rather than firing straight away.
  const [noteFor, setNoteFor] = useState<{ loan: StaffLoan; action: 'reject' | 'cancel' } | null>(
    null
  )
  const [note, setNote] = useState('')

  const loansQuery = useQuery({
    queryKey: ['staff-loans', status, search],
    queryFn: () => payrollService.getStaffLoans({ status: status || undefined, search: search || undefined }),
  })

  const borrowersQuery = useQuery({
    queryKey: ['staff-loan-borrowers'],
    queryFn: () => payrollService.getStaffLoanBorrowers(),
    enabled: showForm,
  })

  const detailQuery = useQuery({
    queryKey: ['staff-loan', detailId],
    queryFn: () => payrollService.getStaffLoan(detailId as string),
    enabled: detailId !== null,
  })

  const loans = useMemo<StaffLoan[]>(() => loansQuery.data?.data || [], [loansQuery.data])
  const borrowers = borrowersQuery.data?.data || []
  const detail = detailQuery.data?.data

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['staff-loans'] })
    queryClient.invalidateQueries({ queryKey: ['staff-loan'] })
    queryClient.invalidateQueries({ queryKey: ['staff-loan-borrowers'] })
  }

  // What the terms on screen come to. Priced locally so the schedule redraws as
  // the principal is typed; the server re-prices on save and on approval.
  const preview = useMemo(
    () =>
      quoteLoan({
        principal_amount: numberOrZero(form.principal_amount),
        interest_method: form.interest_method,
        interest_rate_percent: numberOrZero(form.interest_rate_percent),
        rate_period: form.rate_period,
        term_months: Math.max(1, Math.trunc(numberOrZero(form.term_months))),
        first_deduction_date: form.first_deduction_date || firstOfNextMonth(),
      }),
    [form]
  )

  const saveMutation = useMutation({
    mutationFn: (payload: { id: string | null; data: SaveStaffLoanData }) =>
      payload.id
        ? payrollService.updateStaffLoan(payload.id, payload.data)
        : payrollService.createStaffLoan(payload.data),
    onSuccess: (response) => {
      invalidate()
      setShowForm(false)
      toast.success(response?.message || 'Loan saved.')
    },
    onError: (err: unknown) => {
      const message = errorMessage(err, 'Failed to save loan.')
      setFormError(message)
      toast.error(message)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => payrollService.deleteStaffLoan(id),
    onSuccess: () => {
      invalidate()
      setDeleting(null)
      toast.success('Loan deleted.')
    },
    onError: (err: unknown) => {
      setDeleting(null)
      toast.error(errorMessage(err, 'Failed to delete loan.'))
    },
  })

  const reviewMutation = useMutation({
    mutationFn: (payload: { id: string; action: 'approve' | 'reject' | 'cancel'; note: string }) => {
      if (payload.action === 'approve') return payrollService.approveStaffLoan(payload.id, payload.note)
      if (payload.action === 'reject') return payrollService.rejectStaffLoan(payload.id, payload.note)
      return payrollService.cancelStaffLoan(payload.id, payload.note)
    },
    onSuccess: (response) => {
      invalidate()
      setNoteFor(null)
      setNote('')
      toast.success(response?.message || 'Loan updated.')
    },
    onError: (err: unknown) => {
      toast.error(errorMessage(err, 'Failed to update the loan.'))
    },
  })

  const openCreate = () => {
    setForm(emptyForm())
    setEditingId(null)
    setFormError(null)
    setShowSchedule(false)
    setShowForm(true)
  }

  const openEdit = (loan: StaffLoan) => {
    setForm(formFromLoan(loan))
    setEditingId(loan.id)
    setFormError(null)
    setShowSchedule(false)
    setShowForm(true)
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.user_id) {
      setFormError('Pick the staff member the loan is for.')
      return
    }
    saveMutation.mutate({
      id: editingId,
      data: {
        user_id: form.user_id,
        purpose: form.purpose.trim() || null,
        principal_amount: numberOrZero(form.principal_amount),
        interest_method: form.interest_method,
        // An interest-free loan sends no rate — the server drops it anyway, and
        // sending one would make the payload read as if it charged something.
        interest_rate_percent:
          form.interest_method === 'none' ? 0 : numberOrZero(form.interest_rate_percent),
        rate_period: form.rate_period,
        term_months: Math.max(1, Math.trunc(numberOrZero(form.term_months))),
        first_deduction_date: form.first_deduction_date,
      },
    })
  }

  const chargesInterest = form.interest_method !== 'none'
  const selectedBorrower = borrowers.find((b) => b.user_id === form.user_id) || null

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 p-4">
        <div className="max-w-3xl">
          <h2 className="text-lg font-semibold text-gray-900">Staff Loans</h2>
          <p className="text-sm text-gray-500">
            Money the school lent a staff member, collected back over a fixed number of months. A
            loan is priced before anyone commits to it, waits for approval, and then comes off
            payroll one installment at a time — after the last one it stops on its own. Every loan
            records who encoded it and who signed it off.
          </p>
        </div>
        {canManage && (
          <Button size="sm" onClick={openCreate}>
            <PlusIcon className="h-4 w-4" />
            Record Loan
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 p-3">
        <Input
          type="search"
          size="sm"
          className="max-w-xs"
          placeholder="Search staff or reference…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          inputSize="sm"
          className="max-w-[12rem]"
          options={STATUS_FILTERS}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
              <th className="px-4 py-3">Staff</th>
              <th className="px-4 py-3">Terms</th>
              <th className="px-4 py-3 text-right">Per month</th>
              <th className="px-4 py-3">Progress</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Added by</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loansQuery.isLoading ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                  Loading loans…
                </td>
              </tr>
            ) : loans.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                  No loans yet. Record one when a staff member borrows against their salary.
                </td>
              </tr>
            ) : (
              loans.map((loan) => (
                <tr key={loan.id} className="border-b border-gray-50 align-top hover:bg-gray-50/50">
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setDetailId(loan.id)}
                      className="text-left font-medium text-gray-900 hover:text-primary-600"
                    >
                      {loan.staff_name || '—'}
                    </button>
                    <p className="text-xs text-gray-400">
                      {loan.reference_no}
                      {loan.purpose ? ` · ${loan.purpose}` : ''}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="tabular-nums text-gray-900">{peso(loan.principal_amount)}</span>
                    <span className="text-gray-400"> over {loan.term_months} mo</span>
                    <p className="text-xs text-gray-400">
                      {interestLabel(loan.interest_method, loan.interest_rate_percent, loan.rate_period)}
                      {loan.interest_amount > 0 ? ` · +${peso(loan.interest_amount)} interest` : ''}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {peso(loan.installment_amount)}
                    <p className="text-xs text-gray-400">of {peso(loan.total_payable)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <Progress loan={loan} />
                    {loan.status === 'approved' && loan.next_due_date && (
                      <p className="mt-1 text-xs text-gray-400">
                        Next {shortDate(loan.next_due_date)}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={loan.status} />
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {loan.requested_by_name || '—'}
                    {loan.reviewed_by_name && (
                      <p className="text-gray-400">
                        {loan.status === 'rejected' ? 'Rejected' : loan.status === 'cancelled' ? 'Cancelled' : 'Approved'}{' '}
                        by {loan.reviewed_by_name}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      {canApprove && loan.status === 'pending' && (
                        <>
                          <button
                            type="button"
                            title="Approve"
                            onClick={() => reviewMutation.mutate({ id: loan.id, action: 'approve', note: '' })}
                            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-green-50 hover:text-green-600"
                          >
                            <CheckCircleIcon className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            title="Reject"
                            onClick={() => {
                              setNote('')
                              setNoteFor({ loan, action: 'reject' })
                            }}
                            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                          >
                            <XCircleIcon className="h-4 w-4" />
                          </button>
                        </>
                      )}
                      {canApprove && loan.status === 'approved' && (
                        <button
                          type="button"
                          title="Stop collecting this loan"
                          onClick={() => {
                            setNote('')
                            setNoteFor({ loan, action: 'cancel' })
                          }}
                          className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                        >
                          <NoSymbolIcon className="h-4 w-4" />
                        </button>
                      )}
                      {canManage && loan.status === 'pending' && (
                        <>
                          <button
                            type="button"
                            title="Edit"
                            onClick={() => openEdit(loan)}
                            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                          >
                            <PencilSquareIcon className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            title="Delete"
                            onClick={() => setDeleting(loan)}
                            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        title="View schedule"
                        onClick={() => setDetailId(loan.id)}
                        className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                      >
                        <ChevronRightIcon className="h-4 w-4" />
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
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-gray-200 px-6 py-4">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingId ? 'Edit Loan' : 'Record Loan'}
              </h3>
              <p className="text-xs text-gray-500">
                Nothing is deducted until an approver signs this off.
              </p>
            </div>
            <form onSubmit={submit} className="space-y-4 p-6">
              {formError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
                  {formError}
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Staff member</label>
                <Autocomplete
                  value={
                    selectedBorrower
                      ? { id: selectedBorrower.user_id, label: selectedBorrower.staff_name || selectedBorrower.email }
                      : null
                  }
                  loading={borrowersQuery.isLoading}
                  options={borrowers.map((borrower) => ({
                    id: borrower.user_id,
                    label: borrower.staff_name || borrower.email,
                    description:
                      borrower.outstanding_balance > 0
                        ? `${peso(borrower.outstanding_balance)} still owing`
                        : `Daily rate ${peso(borrower.daily_rate)}`,
                  }))}
                  placeholder="Search staff…"
                  onChange={(option) => setForm((prev) => ({ ...prev, user_id: option?.id || '' }))}
                />
                {selectedBorrower && selectedBorrower.outstanding_balance > 0 && (
                  <p className="mt-1 text-xs text-amber-600">
                    This employee already owes {peso(selectedBorrower.outstanding_balance)} on an
                    open loan. A second one is collected on top of the first.
                  </p>
                )}
                <p className="mt-1 text-xs text-gray-400">
                  Only staff with a rate set in Employee Rates are listed — a loan is collected off
                  a payslip, and without a rate there is none.
                </p>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  What it is for (optional)
                </label>
                <Input
                  type="text"
                  value={form.purpose}
                  onChange={(e) => setForm((prev) => ({ ...prev, purpose: e.target.value }))}
                  placeholder="e.g. Emergency medical assistance"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    Amount lent (₱)
                  </label>
                  <Input
                    type="number"
                    min="1"
                    step="0.01"
                    required
                    value={form.principal_amount}
                    onChange={(e) => setForm((prev) => ({ ...prev, principal_amount: e.target.value }))}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    Collect over (months)
                  </label>
                  <Input
                    type="number"
                    min="1"
                    max="60"
                    step="1"
                    required
                    value={form.term_months}
                    onChange={(e) => setForm((prev) => ({ ...prev, term_months: e.target.value }))}
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Interest</label>
                <Select
                  options={INTEREST_METHOD_OPTIONS}
                  value={form.interest_method}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      interest_method: e.target.value as StaffLoanInterestMethod,
                    }))
                  }
                />
              </div>

              {chargesInterest && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">Rate</label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="0.001"
                      value={form.interest_rate_percent}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, interest_rate_percent: e.target.value }))
                      }
                      placeholder="e.g. 1"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">Quoted</label>
                    <Select
                      options={RATE_PERIOD_OPTIONS}
                      value={form.rate_period}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          rate_period: e.target.value as StaffLoanRatePeriod,
                        }))
                      }
                    />
                  </div>
                  <p className="col-span-2 -mt-1 text-xs text-gray-400">
                    {form.interest_method === 'add_on'
                      ? 'Add-on: the interest is worked out once on the whole amount lent and split evenly, so every month is the same figure.'
                      : 'Diminishing: interest is charged each month on what is still owed, so the same monthly payment pays off more principal as it goes.'}
                  </p>
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  First deduction
                </label>
                <Input
                  type="date"
                  required
                  value={form.first_deduction_date}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, first_deduction_date: e.target.value }))
                  }
                />
                <p className="mt-1 text-xs text-gray-400">
                  The payroll period this date falls in collects the first installment; the rest
                  follow a month apart.
                </p>
              </div>

              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-gray-400">Lent</p>
                    <p className="tabular-nums text-sm font-medium text-gray-900">
                      {peso(preview.principal)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-gray-400">Interest</p>
                    <p className="tabular-nums text-sm font-medium text-gray-900">
                      {peso(preview.interest)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-gray-400">Total payable</p>
                    <p className="tabular-nums text-sm font-medium text-gray-900">
                      {peso(preview.total)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-gray-400">Per month</p>
                    <p className="tabular-nums text-sm font-semibold text-primary-600">
                      {peso(preview.installment)}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  aria-expanded={showSchedule}
                  onClick={() => setShowSchedule((prev) => !prev)}
                  className="mt-2 flex items-center gap-1 rounded px-1 py-0.5 text-xs text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
                >
                  <ChevronRightIcon
                    className={`h-3.5 w-3.5 transition-transform ${showSchedule ? 'rotate-90' : ''}`}
                  />
                  {showSchedule ? 'Hide' : 'Show'} the {preview.installments.length}-month schedule
                </button>
                {showSchedule && (
                  <div className="mt-2 max-h-56 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-gray-50">
                        <tr className="text-left text-[10px] uppercase tracking-wide text-gray-400">
                          <th className="py-1 pr-2 font-medium">#</th>
                          <th className="py-1 pr-2 font-medium">Due</th>
                          <th className="py-1 pr-2 text-right font-medium">Payment</th>
                          <th className="py-1 pr-2 text-right font-medium">Principal</th>
                          <th className="py-1 pr-2 text-right font-medium">Interest</th>
                          <th className="py-1 text-right font-medium">Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.installments.map((row) => (
                          <tr key={row.sequence} className="text-gray-600">
                            <td className="py-0.5 pr-2 tabular-nums">{row.sequence}</td>
                            <td className="py-0.5 pr-2">{shortDate(row.due_date)}</td>
                            <td className="py-0.5 pr-2 text-right tabular-nums">{peso(row.amount)}</td>
                            <td className="py-0.5 pr-2 text-right tabular-nums">
                              {peso(row.principal_component)}
                            </td>
                            <td className="py-0.5 pr-2 text-right tabular-nums">
                              {peso(row.interest_component)}
                            </td>
                            <td className="py-0.5 text-right tabular-nums">
                              {peso(row.closing_balance)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
                <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? 'Saving…' : editingId ? 'Save changes' : 'Submit for approval'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {detailId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setDetailId(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {detailQuery.isLoading || !detail ? (
              <div className="p-10 text-center text-gray-400">Loading loan…</div>
            ) : (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 px-6 py-4">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      {detail.staff_name} · {detail.reference_no}
                    </h3>
                    <p className="text-sm text-gray-500">
                      {peso(detail.principal_amount)} over {detail.term_months} months ·{' '}
                      {interestLabel(detail.interest_method, detail.interest_rate_percent, detail.rate_period)}
                      {detail.purpose ? ` · ${detail.purpose}` : ''}
                    </p>
                  </div>
                  <StatusBadge status={detail.status} />
                </div>

                <div className="grid grid-cols-2 gap-4 border-b border-gray-100 px-6 py-4 sm:grid-cols-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-gray-400">Total payable</p>
                    <p className="tabular-nums text-sm font-medium">{peso(detail.total_payable)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-gray-400">Collected</p>
                    <p className="tabular-nums text-sm font-medium">{peso(detail.amount_paid)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-gray-400">Balance</p>
                    <p className="tabular-nums text-sm font-medium">{peso(detail.balance)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-gray-400">Per month</p>
                    <p className="tabular-nums text-sm font-medium">{peso(detail.installment_amount)}</p>
                  </div>
                </div>

                <div className="px-6 py-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Schedule
                  </p>
                  <div className="overflow-hidden rounded-lg border border-gray-200">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50/50 text-left text-[10px] uppercase tracking-wide text-gray-400">
                          <th className="px-3 py-2 font-medium">#</th>
                          <th className="px-3 py-2 font-medium">Due</th>
                          <th className="px-3 py-2 text-right font-medium">Payment</th>
                          <th className="px-3 py-2 text-right font-medium">Principal</th>
                          <th className="px-3 py-2 text-right font-medium">Interest</th>
                          <th className="px-3 py-2 text-right font-medium">Balance after</th>
                          <th className="px-3 py-2 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(detail.installments || []).map((row) => (
                          <tr
                            key={row.id}
                            className={`border-b border-gray-50 last:border-0 ${
                              row.status === 'cancelled' ? 'text-gray-300 line-through' : 'text-gray-600'
                            }`}
                          >
                            <td className="px-3 py-1.5 tabular-nums">{row.sequence}</td>
                            <td className="px-3 py-1.5">{shortDate(row.due_date)}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{peso(row.amount)}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">
                              {peso(row.principal_component)}
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums">
                              {peso(row.interest_component)}
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums">
                              {peso(row.closing_balance)}
                            </td>
                            <td className="px-3 py-1.5">
                              {row.status === 'collected' ? (
                                <span className="text-green-600">
                                  Collected{' '}
                                  {row.collected_amount !== row.amount
                                    ? `(${peso(row.collected_amount)})`
                                    : ''}
                                </span>
                              ) : row.status === 'cancelled' ? (
                                'Cancelled'
                              ) : (
                                <span className="text-gray-400">Scheduled</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="border-t border-gray-100 px-6 py-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    History
                  </p>
                  <ul className="space-y-1.5 text-xs text-gray-600">
                    {(detail.events || []).map((event) => (
                      <li key={event.id} className="flex flex-wrap gap-x-2">
                        <span className="tabular-nums text-gray-400">
                          {shortDate(event.created_at.slice(0, 10))}
                        </span>
                        <span className="font-medium capitalize text-gray-800">{event.action}</span>
                        <span className="text-gray-500">by {event.actor_name || 'system'}</span>
                        {event.amount !== null && (
                          <span className="tabular-nums text-gray-500">{peso(event.amount)}</span>
                        )}
                        {event.note && <span className="w-full text-gray-400">“{event.note}”</span>}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 px-6 py-4">
                  <Button variant="ghost" onClick={() => setDetailId(null)}>
                    Close
                  </Button>
                  {canApprove && detail.status === 'pending' && (
                    <>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setNote('')
                          setNoteFor({ loan: detail, action: 'reject' })
                        }}
                      >
                        Reject
                      </Button>
                      <Button
                        disabled={reviewMutation.isPending}
                        onClick={() =>
                          reviewMutation.mutate({ id: detail.id, action: 'approve', note: '' })
                        }
                      >
                        {reviewMutation.isPending ? 'Approving…' : 'Approve loan'}
                      </Button>
                    </>
                  )}
                  {canApprove && detail.status === 'approved' && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setNote('')
                        setNoteFor({ loan: detail, action: 'cancel' })
                      }}
                    >
                      Stop collecting
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {noteFor && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
          onClick={() => setNoteFor(null)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-gray-900">
              {noteFor.action === 'reject' ? 'Reject loan' : 'Stop collecting this loan'}
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              {noteFor.action === 'reject'
                ? `${noteFor.loan.reference_no} for ${noteFor.loan.staff_name} will not be collected at all.`
                : `${peso(noteFor.loan.balance)} of ${noteFor.loan.reference_no} is still outstanding. Cancelling stops future deductions — what has already come off payslips stays off.`}
            </p>
            <label className="mt-3 mb-1 block text-xs font-medium text-gray-600">Reason</label>
            <Textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Kept on the loan's history."
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setNoteFor(null)}>
                Cancel
              </Button>
              <Button
                disabled={note.trim() === '' || reviewMutation.isPending}
                onClick={() =>
                  reviewMutation.mutate({
                    id: noteFor.loan.id,
                    action: noteFor.action,
                    note: note.trim(),
                  })
                }
              >
                {reviewMutation.isPending
                  ? 'Saving…'
                  : noteFor.action === 'reject'
                    ? 'Reject loan'
                    : 'Stop collecting'}
              </Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmationModal
        isOpen={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
        title="Delete loan"
        message={`Delete ${deleting?.reference_no} for ${deleting?.staff_name}? Nothing has been deducted yet, so it is removed outright.`}
        confirmText="Delete"
        variant="danger"
        loading={deleteMutation.isPending}
      />
    </div>
  )
}

export default LoansTab
