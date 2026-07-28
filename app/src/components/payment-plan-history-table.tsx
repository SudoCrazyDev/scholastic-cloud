import React from 'react'
import type { PaymentPlanChange } from '../types'

export interface PaymentPlanHistoryTableProps {
  changes: PaymentPlanChange[]
  loading?: boolean
  emptyMessage?: string
}

const formatChangedAt = (value?: string | null) =>
  value
    ? new Date(value).toLocaleString('en-PH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—'

/**
 * Audit trail of who moved a student between payment plans. Shared so the
 * ledger and the student's finance tab report the same thing.
 */
export const PaymentPlanHistoryTable: React.FC<PaymentPlanHistoryTableProps> = ({
  changes,
  loading = false,
  emptyMessage = 'No payment plan changes recorded yet.',
}) => {
  if (loading) {
    return <p className="text-gray-500">Loading history...</p>
  }

  if (!changes.length) {
    return <p className="text-sm text-gray-500">{emptyMessage}</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Plan</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Changed From</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">By</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Note</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {changes.map((change) => (
            <tr key={change.id}>
              <td className="px-4 py-2 text-sm text-gray-600 whitespace-nowrap">
                {formatChangedAt(change.changed_at)}
              </td>
              <td className="px-4 py-2 text-sm font-medium text-gray-900">
                {change.plan_name || '—'}
              </td>
              <td className="px-4 py-2 text-sm text-gray-600">
                {change.previous_plan_name || <span className="text-gray-400">First selection</span>}
              </td>
              <td className="px-4 py-2 text-sm text-gray-600">
                {change.changed_by_name || (change.changed_by_student ? 'Student' : '—')}
                {change.changed_by_student && (
                  <span className="ml-2 inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                    self-selected
                  </span>
                )}
              </td>
              <td className="px-4 py-2 text-sm text-gray-600">{change.note || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default PaymentPlanHistoryTable
