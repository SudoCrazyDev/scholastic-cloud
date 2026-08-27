import React, { useState } from 'react'
import { CheckCircleIcon, ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline'
import { Button } from './button'
import type { PaymentPlanOption, PaymentPlanOptionsResponse } from '../types'

export interface PaymentPlanComparisonProps {
  data?: PaymentPlanOptionsResponse
  loading?: boolean
  /**
   * Offered only where the viewer may actually commit — a family choosing or changing their
   * own plan, or staff setting one on their behalf. Left out and the comparison is purely
   * something to read, which is what the passive panel on the finance page shows.
   */
  onSelect?: (paymentPlanId: string) => void
  selecting?: boolean
  selectingPlanId?: string | null
}

const peso = (value: number) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value || 0)

const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

/**
 * The school's plans, each priced against one student's own account.
 *
 * The choice used to be made from plan names alone. Every figure here is what that family
 * would actually be billed — their charges, their discounts, their payments — with only the
 * plan swapped, which is what makes it the surface a plan is both chosen and changed from.
 */
export const PaymentPlanComparison: React.FC<PaymentPlanComparisonProps> = ({
  data,
  loading,
  onSelect,
  selecting = false,
  selectingPlanId,
}) => {
  const [expanded, setExpanded] = useState<string | null>(null)

  if (loading) {
    return <p className="text-sm text-gray-500">Working out what each plan would cost…</p>
  }

  const options = data?.options ?? []
  if (!options.length) {
    return (
      <p className="text-sm text-gray-600">
        No payment plans are available yet. Please contact your school registrar.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {options.map((option: PaymentPlanOption) => {
          const isOpen = expanded === option.payment_plan_id
          const recalculated = option.schedule_mode === 'reamortizing'
          const asking = option.current_period

          return (
            <div
              key={option.payment_plan_id}
              className={`rounded-xl border bg-white p-4 shadow-sm flex flex-col ${
                option.is_selected
                  ? 'border-primary-400 ring-1 ring-primary-200'
                  : 'border-gray-200'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h5 className="text-base font-semibold text-gray-900">{option.name}</h5>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {option.installment_count} installment
                    {option.installment_count === 1 ? '' : 's'}
                    {recalculated ? ' · amount changes each month' : ' · same amount each time'}
                  </p>
                </div>
                {option.is_selected && (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700">
                    <CheckCircleIcon className="w-3.5 h-3.5" />
                    Your plan
                  </span>
                )}
              </div>

              <div className="mt-3 rounded-lg bg-gray-50 px-3 py-2">
                <p className="text-xs text-gray-500">
                  {asking ? `Next payment · ${asking.label}` : 'Next payment'}
                </p>
                <p className="text-xl font-bold text-gray-900 tabular-nums">
                  {asking ? peso(asking.outstanding_amount) : '—'}
                </p>
                {asking && asking.outstanding_amount <= 0.01 && (
                  <p className="text-xs text-green-700 mt-0.5">
                    Already settled — nothing due for this period.
                  </p>
                )}
                {asking && asking.due_date && asking.outstanding_amount > 0.01 && (
                  <p className="text-xs text-gray-500 mt-0.5">due {shortDate(asking.due_date)}</p>
                )}
              </div>

              <div className="mt-2 flex justify-between text-sm text-gray-700">
                <span>Left to pay this year</span>
                <span className="font-medium tabular-nums">{peso(option.still_to_collect)}</span>
              </div>

              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : option.payment_plan_id)}
                className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary-700 hover:text-primary-800"
              >
                {isOpen ? (
                  <ChevronDownIcon className="w-4 h-4" />
                ) : (
                  <ChevronRightIcon className="w-4 h-4" />
                )}
                {isOpen ? 'Hide schedule' : 'See full schedule'}
              </button>

              {isOpen && (
                <div className="mt-2 rounded-lg border border-gray-100">
                  <div className="max-h-72 overflow-y-auto">
                    <table className="min-w-full text-sm">
                      <tbody className="divide-y divide-gray-100">
                        {option.installments.map((installment) => {
                          // What a month asks is fixed when it opens, so a month that has
                          // collected something still shows that figure. Saying what is left
                          // beside it is what lets these rows reconcile with the total below,
                          // rather than reading as money still to find.
                          const settled =
                            installment.status === 'paid' || installment.outstanding_amount <= 0.01
                          const partlyPaid = !settled && installment.paid_amount > 0.01

                          return (
                            <tr
                              key={installment.sequence}
                              className={settled ? 'bg-green-50/40' : undefined}
                            >
                              <td className="px-3 py-1.5 text-gray-700">
                                {installment.label}
                                {installment.is_current && (
                                  <span className="ml-1.5 text-xs text-gray-400">this month</span>
                                )}
                              </td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-gray-900">
                                {peso(installment.amount)}
                              </td>
                              <td className="px-3 py-1.5 text-right text-xs text-gray-500 whitespace-nowrap">
                                {installment.rolled_forward
                                  ? 'carried'
                                  : settled
                                    ? 'paid'
                                    : partlyPaid
                                      ? `${peso(installment.outstanding_amount)} left`
                                      : ''}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                      <tfoot className="border-t border-gray-200 bg-gray-50">
                        <tr>
                          <td className="px-3 py-1.5 font-medium text-gray-700">Left to pay</td>
                          <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-gray-900">
                            {peso(option.still_to_collect)}
                          </td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  {recalculated && (
                    <p className="border-t border-gray-100 px-3 py-2 text-xs text-gray-500">
                      A month keeps the amount it asked for when it opened, and anything paid
                      lowers the months after it instead. So these amounts add up to more than
                      what is left to pay — the months already collected are still listed at
                      what they asked.
                    </p>
                  )}
                </div>
              )}

              {onSelect && !option.is_selected && (
                <Button
                  type="button"
                  className="mt-4 w-full"
                  loading={selecting && selectingPlanId === option.payment_plan_id}
                  disabled={selecting}
                  onClick={() => onSelect(option.payment_plan_id)}
                >
                  Choose this plan
                </Button>
              )}
            </div>
          )
        })}
      </div>

      <p className="text-xs text-gray-500">
        Every figure above is worked out from your own fees, discounts and the payments already
        received, so it is what you would be billed rather than an example.
        {data && data.payments_total > 0 && (
          <> {peso(data.payments_total)} received so far is already taken off.</>
        )}
        {' '}
        Late fees are not included in these projections.
      </p>
    </div>
  )
}

export default PaymentPlanComparison
