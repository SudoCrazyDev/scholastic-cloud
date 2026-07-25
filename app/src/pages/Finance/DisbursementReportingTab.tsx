import React from 'react'
import { BarChart3 } from 'lucide-react'
import { Input } from '../../components/input'
import { Button } from '../../components/button'
import { peso, formatDate } from './disbursementFormat'
import type { useDisbursements } from '../../hooks/useDisbursements'

type Dm = ReturnType<typeof useDisbursements>

export function DisbursementReportingTab({ dm }: { dm: Dm }) {
  const { disbursements } = dm
  const [from, setFrom] = React.useState('')
  const [to, setTo] = React.useState('')

  const filtered = React.useMemo(() => {
    return disbursements.filter((d) => {
      if (from && d.date_issued < from) return false
      if (to && d.date_issued > to) return false
      return true
    })
  }, [disbursements, from, to])

  const total = filtered.reduce((sum, d) => sum + (Number(d.amount) || 0), 0)

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="w-5 h-5 text-gray-700" />
        <h2 className="text-lg font-semibold text-gray-900">Reporting</h2>
      </div>

      <div className="flex flex-wrap items-end gap-3 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Start date</label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">End date</label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        {(from || to) && (
          <Button variant="outline" onClick={() => { setFrom(''); setTo('') }}>
            Clear
          </Button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="pb-3 font-medium text-gray-700">Date</th>
              <th className="pb-3 font-medium text-gray-700">Title</th>
              <th className="pb-3 font-medium text-gray-700">Type</th>
              <th className="pb-3 font-medium text-gray-700">In-Charge</th>
              <th className="pb-3 font-medium text-gray-700 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-gray-500">
                  No disbursements for the selected range.
                </td>
              </tr>
            ) : (
              filtered.map((d) => (
                <tr key={d.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                  <td className="py-3 whitespace-nowrap text-gray-700">{formatDate(d.date_issued)}</td>
                  <td className="py-3 font-medium text-gray-900">{d.title}</td>
                  <td className="py-3 text-gray-700">{d.type_name || <span className="text-gray-400">—</span>}</td>
                  <td className="py-3 text-gray-700">{d.in_charge_name || <span className="text-gray-400">—</span>}</td>
                  <td className="py-3 text-right font-medium text-gray-900 whitespace-nowrap">{peso(d.amount)}</td>
                </tr>
              ))
            )}
          </tbody>
          {filtered.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-gray-200">
                <td colSpan={4} className="py-3 font-semibold text-gray-900">
                  Total ({filtered.length} record{filtered.length === 1 ? '' : 's'})
                </td>
                <td className="py-3 text-right font-bold text-gray-900 whitespace-nowrap">{peso(total)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
