import React, { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { ChevronRightIcon } from '@heroicons/react/24/outline'
import { Button } from '../../components/button'
import { Select } from '../../components/select'
import { feeNamingService } from '../../services/feeNamingService'
import type { FeeNamingPlan, FeeNamingRun, FeeNamingScope } from '../../types'

const formatCurrency = (amount?: number | string | null) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount || 0))

const formatDateTime = (value?: string | null) => {
  if (!value) return '—'
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime())
    ? '—'
    : parsed.toLocaleString('en-PH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
}

const extractErrorMessage = (error: unknown, fallback: string) => {
  if (error && typeof error === 'object' && 'response' in error) {
    const response = (error as { response?: { data?: { message?: string } } }).response
    return response?.data?.message || fallback
  }
  return fallback
}

const personName = (person?: { first_name: string; last_name: string } | null) =>
  person ? `${person.first_name} ${person.last_name}` : '—'

const SCOPE_OPTIONS = [
  { value: 'receipts', label: 'Only receipts students uploaded' },
  { value: 'all', label: 'Also General / Other typed at the till' },
]

interface FeeNamingViewProps {
  academicYearOptions: { value: string; label: string }[]
  defaultAcademicYear: string
}

/**
 * Names the fees on collections posted as "General / Other".
 *
 * The screen is a preview and a button, in that order, and it will not run without the
 * preview having been fetched: every figure a run writes is one the ledger is already
 * reporting, so the operation moves no balance — but it does pin money that would
 * otherwise re-spread itself as new charges appear, and that is a decision somebody should
 * make with the list in front of them rather than from a description of it.
 */
const FeeNamingView: React.FC<FeeNamingViewProps> = ({
  academicYearOptions,
  defaultAcademicYear,
}) => {
  const queryClient = useQueryClient()
  const [academicYear, setAcademicYear] = useState(defaultAcademicYear)
  const [scope, setScope] = useState<FeeNamingScope>('receipts')
  const [plan, setPlan] = useState<FeeNamingPlan | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  const runsQuery = useQuery({
    queryKey: ['fee-naming-runs'],
    queryFn: () => feeNamingService.runs(),
  })
  const runs: FeeNamingRun[] = runsQuery.data?.data ?? []

  // A preview is only ever as fresh as the moment it was taken, so any change to what it
  // was taken for throws it away rather than leaving a stale list on screen next to a
  // button that would act on something else.
  const resetPlan = () => {
    setPlan(null)
    setExpanded(null)
    setConfirming(false)
  }

  const previewMutation = useMutation({
    mutationFn: () => feeNamingService.preview({ academic_year: academicYear, scope }),
    onSuccess: (response) => {
      setPlan(response.data)
      setConfirming(false)
    },
    onError: (error: unknown) => {
      toast.error(extractErrorMessage(error, 'Could not work out what would change.'))
    },
  })

  const runMutation = useMutation({
    mutationFn: () => feeNamingService.run({ academic_year: academicYear, scope }),
    onSuccess: (response) => {
      resetPlan()
      queryClient.invalidateQueries({ queryKey: ['fee-naming-runs'] })
      // Every screen that reads a collection's lines now reads different ones.
      queryClient.invalidateQueries({ queryKey: ['student-ledger'] })
      queryClient.invalidateQueries({ queryKey: ['cashier-ledger'] })
      queryClient.invalidateQueries({ queryKey: ['student-noa'] })
      queryClient.invalidateQueries({ queryKey: ['payment-receipt-submissions'] })
      queryClient.invalidateQueries({ queryKey: ['finance-dashboard'] })
      toast.success(response.message || 'Named the fees.')
    },
    onError: (error: unknown) => {
      toast.error(extractErrorMessage(error, 'Could not name the fees.'))
    },
  })

  const revertMutation = useMutation({
    mutationFn: (id: string) => feeNamingService.revert(id),
    onSuccess: (response) => {
      resetPlan()
      queryClient.invalidateQueries({ queryKey: ['fee-naming-runs'] })
      queryClient.invalidateQueries({ queryKey: ['student-ledger'] })
      queryClient.invalidateQueries({ queryKey: ['cashier-ledger'] })
      queryClient.invalidateQueries({ queryKey: ['student-noa'] })
      queryClient.invalidateQueries({ queryKey: ['payment-receipt-submissions'] })
      queryClient.invalidateQueries({ queryKey: ['finance-dashboard'] })
      toast.success(response.message || 'Run undone.')
    },
    onError: (error: unknown) => {
      toast.error(extractErrorMessage(error, 'Could not undo that run.'))
    },
  })

  const busy = previewMutation.isPending || runMutation.isPending || revertMutation.isPending
  const nothingToDo = Boolean(plan) && plan!.line_count === 0

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="border-b border-gray-100 px-5 py-4">
          <h3 className="text-sm font-semibold text-gray-900">What this does</h3>
          <div className="mt-2 space-y-2 text-sm text-gray-600">
            <p>
              A collection taken as <span className="font-medium">General / Other</span> names
              no fee, so the receipt it posted names none either — the till, a reprint and any
              fee-by-fee reconciliation all read &ldquo;General / Other&rdquo;.
            </p>
            <p>
              The balances were never wrong. The ledger already shares that money across the
              fees that still owe, every time it is read. This writes that same share down as
              real receipt lines, so{' '}
              <span className="font-medium">no balance changes and no total moves</span> — the
              receipt just starts saying what it paid for.
            </p>
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-800">
              <span className="font-medium">The one trade-off.</span> General money floats: add
              a charge later and it re-spreads itself to cover it. Named money stays put. That
              is the point of naming it, but it is a choice about the books — so every run is
              recorded below and can be undone.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 px-5 py-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Academic year</label>
            <Select
              value={academicYear}
              onChange={(event) => {
                setAcademicYear(event.target.value)
                resetPlan()
              }}
              disabled={busy}
              options={[{ value: '', label: 'Every year' }, ...academicYearOptions]}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Which collections
            </label>
            <Select
              value={scope}
              onChange={(event) => {
                setScope(event.target.value as FeeNamingScope)
                resetPlan()
              }}
              disabled={busy}
              options={SCOPE_OPTIONS}
            />
            <p className="mt-1 text-xs text-gray-500">
              {scope === 'receipts'
                ? 'An online receipt was approved without naming fees because the screen did not ask. That is the backlog this clears.'
                : 'A cashier who typed into General / Other chose not to name a fee. Including those overrides that choice.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 px-5 py-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => previewMutation.mutate()}
            loading={previewMutation.isPending}
            disabled={busy}
          >
            {plan ? 'Refresh preview' : 'Preview what would change'}
          </Button>

          {/* Deliberately unreachable until a preview has been fetched: this writes to
              posted collections, and the list is the whole safeguard. */}
          {plan && !nothingToDo && !confirming && (
            <Button type="button" onClick={() => setConfirming(true)} disabled={busy}>
              Name the fees on {plan.receipt_count}{' '}
              {plan.receipt_count === 1 ? 'collection' : 'collections'}
            </Button>
          )}

          {confirming && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-gray-600">
                Write {formatCurrency(plan?.total_amount)} across{' '}
                {plan?.students.length} {plan?.students.length === 1 ? 'student' : 'students'}?
              </span>
              <Button type="button" variant="outline" onClick={() => setConfirming(false)} disabled={busy}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => runMutation.mutate()}
                loading={runMutation.isPending}
                disabled={busy}
              >
                Yes, name them
              </Button>
            </div>
          )}
        </div>
      </div>

      {plan && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-5 py-3.5">
            <h3 className="text-sm font-semibold text-gray-900">
              Preview
              <span className="ml-2 font-normal text-gray-500">
                {plan.line_count} {plan.line_count === 1 ? 'line' : 'lines'} ·{' '}
                {formatCurrency(plan.total_amount)}
              </span>
            </h3>
            {plan.skipped.length > 0 && (
              <span className="text-xs text-gray-500">
                {plan.skipped.length} left alone
              </span>
            )}
          </div>

          {nothingToDo ? (
            <p className="px-5 py-8 text-center text-sm text-gray-500">
              Nothing to name — every collection in scope already says which fees it settled.
            </p>
          ) : (
            <div className="divide-y divide-gray-100">
              {plan.students.map((student) => {
                const key = `${student.student_id}|${student.academic_year}`
                const isOpen = expanded === key
                return (
                  <div key={key}>
                    <button
                      type="button"
                      onClick={() => setExpanded(isOpen ? null : key)}
                      aria-expanded={isOpen}
                      className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-gray-50/60"
                    >
                      <ChevronRightIcon
                        className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${
                          isOpen ? 'rotate-90' : ''
                        }`}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-gray-900">
                          {student.student_name}
                        </span>
                        <span className="block text-xs text-gray-500">
                          {student.academic_year} · {student.lines.length}{' '}
                          {student.lines.length === 1 ? 'collection' : 'collections'}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm font-medium tabular-nums text-gray-900">
                        {formatCurrency(student.general_total)}
                      </span>
                    </button>

                    {isOpen && (
                      <div className="space-y-3 bg-gray-50/60 px-5 py-3">
                        {student.lines.map((line) => (
                          <div key={line.payment_id} className="rounded-lg border border-gray-200 bg-white">
                            <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-3 py-2">
                              <span className="truncate text-xs font-medium text-gray-600">
                                {line.receipt_number || 'No receipt number'}
                              </span>
                              <span className="shrink-0 text-xs tabular-nums text-gray-500">
                                {formatCurrency(line.amount)} · General / Other
                              </span>
                            </div>
                            <div className="divide-y divide-gray-50">
                              {line.parts.map((part, index) => (
                                <div
                                  key={`${line.payment_id}-${part.fee_id}-${index}`}
                                  className="flex items-center justify-between gap-3 px-3 py-1.5"
                                >
                                  <span className="min-w-0 truncate text-sm text-gray-900">
                                    {part.fee_name}
                                    {part.is_additional && (
                                      <span className="ml-1.5 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-500">
                                        Additional
                                      </span>
                                    )}
                                  </span>
                                  <span className="shrink-0 text-sm tabular-nums text-gray-900">
                                    {formatCurrency(part.amount)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {plan.skipped.length > 0 && (
            <div className="border-t border-gray-100 px-5 py-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Left alone
              </h4>
              <ul className="mt-2 space-y-1.5">
                {plan.skipped.map((row) => (
                  <li
                    key={`${row.student_id}|${row.academic_year}`}
                    className="flex flex-wrap items-baseline justify-between gap-2 text-sm"
                  >
                    <span className="text-gray-900">
                      {row.student_name}{' '}
                      <span className="text-xs text-gray-500">{row.academic_year}</span>
                    </span>
                    <span className="text-xs text-gray-500">{row.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="border-b border-gray-100 px-5 py-3.5">
          <h3 className="text-sm font-semibold text-gray-900">Previous runs</h3>
        </div>

        {runsQuery.isLoading ? (
          <p className="px-5 py-8 text-center text-sm text-gray-500">Loading…</p>
        ) : runs.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-gray-500">
            No run yet. Nothing has been renamed.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-5 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                    When
                  </th>
                  <th className="px-5 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                    By
                  </th>
                  <th className="px-5 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                    Year
                  </th>
                  <th className="px-5 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-gray-500">
                    Collections
                  </th>
                  <th className="px-5 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-gray-500">
                    Amount
                  </th>
                  <th className="px-5 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-gray-500">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {runs.map((run) => (
                  <tr key={run.id}>
                    <td className="whitespace-nowrap px-5 py-3 text-sm text-gray-900">
                      {formatDateTime(run.created_at)}
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-600">{personName(run.creator)}</td>
                    <td className="whitespace-nowrap px-5 py-3 text-sm text-gray-600">
                      {run.academic_year || 'Every year'}
                    </td>
                    <td className="px-5 py-3 text-right text-sm tabular-nums text-gray-900">
                      {run.receipt_count}
                    </td>
                    <td className="px-5 py-3 text-right text-sm tabular-nums text-gray-900">
                      {formatCurrency(run.total_amount)}
                    </td>
                    <td className="px-5 py-3 text-right text-sm">
                      {run.reverted_at ? (
                        <span className="text-gray-500">
                          Undone by {personName(run.reverter)}
                        </span>
                      ) : run.can_revert ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => revertMutation.mutate(run.id)}
                          loading={revertMutation.isPending}
                          disabled={busy}
                        >
                          Undo
                        </Button>
                      ) : run.blocked_by_void ? (
                        <span
                          className="text-xs text-amber-700"
                          title="A line this run named has since been voided, so collapsing it here would undo that correction too."
                        >
                          Voided since — undo by hand
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">Nothing written</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

export default FeeNamingView
