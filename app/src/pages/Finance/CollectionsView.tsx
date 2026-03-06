import React, { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Select } from '../../components/select'
import { financeDashboardService } from '../../services/financeDashboardService'

interface CollectionsViewProps {
  academicYearOptions: { value: string; label: string }[]
  defaultAcademicYear: string
}

const CollectionsView: React.FC<CollectionsViewProps> = ({
  academicYearOptions,
  defaultAcademicYear,
}) => {
  const [collectionsYear, setCollectionsYear] = useState(defaultAcademicYear)
  const [viewMode, setViewMode] = useState<'monthly' | 'quarterly'>('monthly')

  const collectionsQuery = useQuery({
    queryKey: ['finance-collections', collectionsYear],
    queryFn: () => financeDashboardService.getCollections(collectionsYear),
    enabled: Boolean(collectionsYear),
  })

  const collectionsData = collectionsQuery.data?.data
  const monthly = useMemo(() => collectionsData?.monthly || [], [collectionsData?.monthly])
  const quarterly = useMemo(() => collectionsData?.quarterly || [], [collectionsData?.quarterly])
  const grandTotal = collectionsData?.grand_total ?? 0

  const allMethods = useMemo(() => {
    const methods = new Set<string>()
    const items = viewMode === 'monthly' ? monthly : quarterly
    for (const item of items) {
      for (const m of Object.keys(item.by_method)) {
        methods.add(m)
      }
    }
    return Array.from(methods).sort()
  }, [monthly, quarterly, viewMode])

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2,
    }).format(amount)

  const maxTotal = useMemo(() => {
    const items = viewMode === 'monthly' ? monthly : quarterly
    return Math.max(...items.map((i) => i.total), 1)
  }, [monthly, quarterly, viewMode])

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Payment Collections</h2>
          <p className="text-sm text-gray-600">
            View payment collections by month or quarter for the school year (June–March).
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            <button
              type="button"
              onClick={() => setViewMode('monthly')}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                viewMode === 'monthly'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setViewMode('quarterly')}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                viewMode === 'quarterly'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              Quarterly
            </button>
          </div>
          <div className="w-48">
            <Select
              value={collectionsYear}
              onChange={(e) => setCollectionsYear(e.target.value)}
              options={academicYearOptions}
              className="w-full"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-500">Grand Total Collections</p>
          <p className="text-2xl font-semibold text-gray-900 tabular-nums">{formatCurrency(grandTotal)}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-500">Total Transactions</p>
          <p className="text-2xl font-semibold text-gray-900 tabular-nums">
            {(viewMode === 'monthly' ? monthly : quarterly).reduce((sum, i) => sum + i.count, 0)}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-500">View Mode</p>
          <p className="text-2xl font-semibold text-indigo-600">{viewMode === 'monthly' ? '10 Months' : '4 Quarters'}</p>
        </div>
      </div>

      {collectionsQuery.isLoading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-indigo-600 mb-2" />
          <p className="text-gray-500">Loading collections...</p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {viewMode === 'monthly' ? 'Monthly' : 'Quarterly'} Collections Chart
            </h3>
            <div className="space-y-3">
              {(viewMode === 'monthly' ? monthly : quarterly).map((item, idx) => (
                <div key={idx} className="flex items-center gap-3">
                  <div className="w-32 text-sm text-gray-700 font-medium shrink-0 truncate">
                    {item.label}
                  </div>
                  <div className="flex-1 bg-gray-100 rounded-full h-8 relative overflow-hidden">
                    <div
                      className="bg-indigo-500 h-full rounded-full transition-all duration-500 flex items-center justify-end pr-2"
                      style={{ width: `${Math.max((item.total / maxTotal) * 100, item.total > 0 ? 2 : 0)}%` }}
                    >
                      {item.total > 0 && (
                        <span className="text-xs font-medium text-white whitespace-nowrap">
                          {formatCurrency(item.total)}
                        </span>
                      )}
                    </div>
                    {item.total === 0 && (
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                        No collections
                      </span>
                    )}
                  </div>
                  <div className="w-16 text-right text-xs text-gray-500">{item.count} txn</div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50/50">
              <h3 className="text-base font-semibold text-gray-900">Detailed Breakdown</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      {viewMode === 'monthly' ? 'Month' : 'Quarter'}
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Transactions</th>
                    {allMethods.map((m) => (
                      <th key={m} className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                        {m}
                      </th>
                    ))}
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {(viewMode === 'monthly' ? monthly : quarterly).map((item, idx) => (
                    <tr key={idx} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{item.label}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-600">{item.count}</td>
                      {allMethods.map((m) => (
                        <td key={m} className="px-4 py-3 text-sm text-right text-gray-900 tabular-nums">
                          {formatCurrency(item.by_method[m] ?? 0)}
                        </td>
                      ))}
                      <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900 tabular-nums">
                        {formatCurrency(item.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50">
                  <tr className="font-semibold">
                    <td className="px-4 py-3 text-sm text-gray-900">Total</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-900">
                      {(viewMode === 'monthly' ? monthly : quarterly).reduce((s, i) => s + i.count, 0)}
                    </td>
                    {allMethods.map((m) => (
                      <td key={m} className="px-4 py-3 text-sm text-right text-gray-900 tabular-nums">
                        {formatCurrency(
                          (viewMode === 'monthly' ? monthly : quarterly).reduce(
                            (s, i) => s + (i.by_method[m] ?? 0),
                            0
                          )
                        )}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-sm text-right text-gray-900 tabular-nums">
                      {formatCurrency(grandTotal)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default CollectionsView
