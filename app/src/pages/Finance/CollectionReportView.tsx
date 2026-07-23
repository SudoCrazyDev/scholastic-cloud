import React, { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '../../components/button'
import { financeDashboardService } from '../../services/financeDashboardService'
import type { CollectionReportResponse } from '../../types'

const todayStr = () => {
  const d = new Date()
  const tz = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - tz).toISOString().slice(0, 10)
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(amount)

const formatNumber = (n: number) => new Intl.NumberFormat('en-PH').format(n)

const formatDate = (iso: string) => {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

const formatDateShort = (iso: string) => {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

function buildPrintHtml(report: CollectionReportResponse): string {
  const { summary } = report
  const rangeLabel =
    report.start_date === report.end_date
      ? formatDate(report.start_date)
      : `${formatDate(report.start_date)} — ${formatDate(report.end_date)}`
  const generatedAt = new Date().toLocaleString('en-PH')

  const summaryCards = [
    ['Total Collected', formatCurrency(summary.total_collected)],
    ['Transactions', formatNumber(summary.transaction_count)],
    ['Entries', formatNumber(summary.entry_count)],
    ['Students Paid', formatNumber(summary.student_count)],
    ['Payment Methods', formatNumber(summary.method_count)],
    ['Avg / Transaction', formatCurrency(summary.average_per_transaction)],
  ]
    .map(
      ([label, value]) =>
        `<div class="card"><div class="card-label">${escapeHtml(label)}</div><div class="card-value">${escapeHtml(
          value
        )}</div></div>`
    )
    .join('')

  const voidedNote =
    summary.voided_count > 0
      ? `<p class="note">Excludes ${formatNumber(summary.voided_count)} voided entr${
          summary.voided_count === 1 ? 'y' : 'ies'
        } totalling ${formatCurrency(summary.voided_amount)}.</p>`
      : ''

  const breakdownTable = (
    title: string,
    rows: { label: string; entries: number; transactions?: number; amount: number }[],
    showTxns: boolean
  ) => {
    if (!rows.length) return ''
    const total = rows.reduce((s, r) => s + r.amount, 0)
    const body = rows
      .map(
        (r) => `<tr>
          <td>${escapeHtml(r.label)}</td>
          ${showTxns ? `<td class="num">${formatNumber(r.transactions ?? 0)}</td>` : ''}
          <td class="num">${formatNumber(r.entries)}</td>
          <td class="num">${formatCurrency(r.amount)}</td>
        </tr>`
      )
      .join('')
    return `<h2>${escapeHtml(title)}</h2>
      <table>
        <thead><tr>
          <th>${escapeHtml(title.replace(/^By /, ''))}</th>
          ${showTxns ? '<th class="num">Txns</th>' : ''}
          <th class="num">Entries</th>
          <th class="num">Amount</th>
        </tr></thead>
        <tbody>${body}</tbody>
        <tfoot><tr>
          <td>Total</td>
          ${showTxns ? '<td></td>' : ''}
          <td></td>
          <td class="num">${formatCurrency(total)}</td>
        </tr></tfoot>
      </table>`
  }

  const dailyTable = report.by_day.length
    ? `<h2>By Day</h2>
      <table>
        <thead><tr><th>Date</th><th class="num">Transactions</th><th class="num">Entries</th><th class="num">Amount</th></tr></thead>
        <tbody>${report.by_day
          .map(
            (r) => `<tr>
              <td>${escapeHtml(formatDateShort(r.label))}</td>
              <td class="num">${formatNumber(r.transactions)}</td>
              <td class="num">${formatNumber(r.entries)}</td>
              <td class="num">${formatCurrency(r.amount)}</td>
            </tr>`
          )
          .join('')}</tbody>
      </table>`
    : ''

  const txnTable = report.transactions.length
    ? `<h2>Transactions (${formatNumber(report.transactions.length)})</h2>
      <table>
        <thead><tr>
          <th>Date</th><th>OR / Receipt</th><th>Student</th><th>Method</th><th>Cashier</th>
          <th class="num">Entries</th><th class="num">Amount</th>
        </tr></thead>
        <tbody>${report.transactions
          .map(
            (t) => `<tr>
              <td>${escapeHtml(formatDateShort(t.date))}</td>
              <td>${escapeHtml(t.or_number || t.receipt_number || '—')}</td>
              <td>${escapeHtml(t.student)}</td>
              <td>${escapeHtml(t.method)}</td>
              <td>${escapeHtml(t.cashier)}</td>
              <td class="num">${formatNumber(t.entries)}</td>
              <td class="num">${formatCurrency(t.amount)}</td>
            </tr>`
          )
          .join('')}</tbody>
        <tfoot><tr>
          <td colspan="5">Total</td>
          <td class="num">${formatNumber(summary.entry_count)}</td>
          <td class="num">${formatCurrency(summary.total_collected)}</td>
        </tr></tfoot>
      </table>`
    : '<p class="note">No transactions found for the selected period.</p>'

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Collection Report — ${escapeHtml(rangeLabel)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color: #111827; margin: 24px; font-size: 12px; }
    header { text-align: center; border-bottom: 2px solid #111827; padding-bottom: 10px; margin-bottom: 16px; }
    header .inst { font-size: 18px; font-weight: 700; }
    header .addr { font-size: 11px; color: #4b5563; }
    header .title { font-size: 14px; font-weight: 600; margin-top: 8px; }
    header .range { font-size: 12px; color: #374151; }
    .cards { display: flex; flex-wrap: wrap; gap: 8px; margin: 14px 0; }
    .card { border: 1px solid #d1d5db; border-radius: 6px; padding: 8px 12px; min-width: 130px; flex: 1; }
    .card-label { font-size: 10px; text-transform: uppercase; color: #6b7280; letter-spacing: .03em; }
    .card-value { font-size: 16px; font-weight: 700; margin-top: 2px; }
    h2 { font-size: 13px; margin: 18px 0 6px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
    th, td { border: 1px solid #e5e7eb; padding: 5px 8px; text-align: left; }
    th { background: #f3f4f6; font-size: 10px; text-transform: uppercase; letter-spacing: .03em; }
    td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
    tfoot td { font-weight: 700; background: #f9fafb; }
    .note { color: #6b7280; font-style: italic; margin: 6px 0; }
    footer { margin-top: 20px; font-size: 10px; color: #6b7280; text-align: center; border-top: 1px solid #e5e7eb; padding-top: 8px; }
    @media print { body { margin: 0; } }
  </style>
</head>
<body>
  <header>
    <div class="inst">${escapeHtml(report.institution?.title || 'Collection Report')}</div>
    ${report.institution?.address ? `<div class="addr">${escapeHtml(report.institution.address)}</div>` : ''}
    <div class="title">Daily Collection Report</div>
    <div class="range">${escapeHtml(rangeLabel)}</div>
  </header>
  <div class="cards">${summaryCards}</div>
  ${voidedNote}
  ${breakdownTable('By Payment Method', report.by_method, true)}
  ${breakdownTable('By Fee Type', report.by_fee, false)}
  ${breakdownTable('By Cashier', report.by_cashier, true)}
  ${dailyTable}
  ${txnTable}
  <footer>Generated on ${escapeHtml(generatedAt)}</footer>
  <script>window.onload=function(){window.print();window.onafterprint=function(){window.close();}}</script>
</body>
</html>`
}

const CollectionReportView: React.FC = () => {
  const [startDate, setStartDate] = useState(todayStr())
  const [endDate, setEndDate] = useState(todayStr())
  const [applied, setApplied] = useState<{ start: string; end: string } | null>(null)

  const reportQuery = useQuery({
    queryKey: ['finance-collection-report', applied?.start, applied?.end],
    queryFn: () => financeDashboardService.getCollectionsReport(applied!.start, applied!.end),
    enabled: Boolean(applied),
  })

  const report = reportQuery.data?.data
  const rangeInvalid = endDate < startDate

  const summaryCards = useMemo(() => {
    if (!report) return []
    const s = report.summary
    return [
      { label: 'Total Collected', value: formatCurrency(s.total_collected), accent: true },
      { label: 'Transactions', value: formatNumber(s.transaction_count) },
      { label: 'Entries', value: formatNumber(s.entry_count) },
      { label: 'Students Paid', value: formatNumber(s.student_count) },
      { label: 'Payment Methods', value: formatNumber(s.method_count) },
      { label: 'Avg / Transaction', value: formatCurrency(s.average_per_transaction) },
    ]
  }, [report])

  const handleGenerate = () => {
    if (rangeInvalid) return
    setApplied({ start: startDate, end: endDate })
  }

  const handlePrint = () => {
    if (!report) return
    const printWindow = window.open('', '_blank', 'width=900,height=700')
    if (!printWindow) return
    printWindow.document.write(buildPrintHtml(report))
    printWindow.document.close()
  }

  const rangeLabel = report
    ? report.start_date === report.end_date
      ? formatDate(report.start_date)
      : `${formatDate(report.start_date)} — ${formatDate(report.end_date)}`
    : ''

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="px-6 py-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900">Detailed Collection Report</h3>
        <p className="text-sm text-gray-600">
          Pick a date range to generate a printable report of transactions, entries, and collections.
          Leave both dates the same for a single-day report.
        </p>
      </div>

      <div className="px-6 py-4 flex flex-col sm:flex-row sm:items-end gap-4 border-b border-gray-200 bg-gray-50/50">
        <div>
          <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Start Date</label>
          <input
            type="date"
            value={startDate}
            max={endDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 uppercase mb-1">End Date</label>
          <input
            type="date"
            value={endDate}
            min={startDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={handleGenerate}
            loading={reportQuery.isFetching}
            disabled={rangeInvalid || reportQuery.isFetching}
          >
            Generate Report
          </Button>
          <Button
            variant="outline"
            onClick={handlePrint}
            disabled={!report || reportQuery.isFetching}
          >
            Print
          </Button>
        </div>
      </div>

      <div className="p-6">
        {rangeInvalid && (
          <p className="text-sm text-red-600 mb-4">End date must be on or after the start date.</p>
        )}

        {reportQuery.isFetching ? (
          <div className="py-8 text-center">
            <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-indigo-600 mb-2" />
            <p className="text-gray-500">Generating report…</p>
          </div>
        ) : !report ? (
          <p className="text-sm text-gray-500 text-center py-8">
            Select a date range and click “Generate Report”.
          </p>
        ) : (
          <div className="space-y-6">
            <div>
              <p className="text-sm font-medium text-gray-700">{rangeLabel}</p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {summaryCards.map((c) => (
                <div
                  key={c.label}
                  className={`rounded-lg border p-3 ${
                    c.accent ? 'border-indigo-200 bg-indigo-50' : 'border-gray-200 bg-white'
                  }`}
                >
                  <p className="text-xs text-gray-500 uppercase">{c.label}</p>
                  <p
                    className={`text-lg font-semibold tabular-nums ${
                      c.accent ? 'text-indigo-700' : 'text-gray-900'
                    }`}
                  >
                    {c.value}
                  </p>
                </div>
              ))}
            </div>

            {report.summary.voided_count > 0 && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Excludes {formatNumber(report.summary.voided_count)} voided{' '}
                {report.summary.voided_count === 1 ? 'entry' : 'entries'} totalling{' '}
                {formatCurrency(report.summary.voided_amount)}.
              </p>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <BreakdownTable title="Payment Method" rows={report.by_method} showTxns />
              <BreakdownTable title="Fee Type" rows={report.by_fee} />
              <BreakdownTable title="Cashier" rows={report.by_cashier} showTxns />
              <DailyTable rows={report.by_day} />
            </div>

            <TransactionsTable report={report} />
          </div>
        )}
      </div>
    </div>
  )
}

const BreakdownTable: React.FC<{
  title: string
  rows: { label: string; entries: number; transactions?: number; amount: number }[]
  showTxns?: boolean
}> = ({ title, rows, showTxns }) => {
  const total = rows.reduce((s, r) => s + r.amount, 0)
  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
        <h4 className="text-sm font-semibold text-gray-900">By {title}</h4>
      </div>
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">{title}</th>
            {showTxns && (
              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Txns</th>
            )}
            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Entries</th>
            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={showTxns ? 4 : 3} className="px-4 py-3 text-sm text-gray-400 text-center">
                No data
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.label}>
                <td className="px-4 py-2 text-sm text-gray-900">{r.label}</td>
                {showTxns && (
                  <td className="px-4 py-2 text-sm text-right text-gray-600 tabular-nums">
                    {formatNumber(r.transactions ?? 0)}
                  </td>
                )}
                <td className="px-4 py-2 text-sm text-right text-gray-600 tabular-nums">
                  {formatNumber(r.entries)}
                </td>
                <td className="px-4 py-2 text-sm text-right text-gray-900 tabular-nums">
                  {formatCurrency(r.amount)}
                </td>
              </tr>
            ))
          )}
        </tbody>
        {rows.length > 0 && (
          <tfoot className="bg-gray-50">
            <tr className="font-semibold">
              <td className="px-4 py-2 text-sm text-gray-900">Total</td>
              {showTxns && <td />}
              <td />
              <td className="px-4 py-2 text-sm text-right text-gray-900 tabular-nums">
                {formatCurrency(total)}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}

const DailyTable: React.FC<{
  rows: { label: string; transactions: number; entries: number; amount: number }[]
}> = ({ rows }) => (
  <div className="rounded-lg border border-gray-200 overflow-hidden">
    <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
      <h4 className="text-sm font-semibold text-gray-900">By Day</h4>
    </div>
    <table className="min-w-full divide-y divide-gray-200">
      <thead className="bg-gray-50">
        <tr>
          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Txns</th>
          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Entries</th>
          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {rows.length === 0 ? (
          <tr>
            <td colSpan={4} className="px-4 py-3 text-sm text-gray-400 text-center">
              No data
            </td>
          </tr>
        ) : (
          rows.map((r) => (
            <tr key={r.label}>
              <td className="px-4 py-2 text-sm text-gray-900">{formatDateShort(r.label)}</td>
              <td className="px-4 py-2 text-sm text-right text-gray-600 tabular-nums">
                {formatNumber(r.transactions)}
              </td>
              <td className="px-4 py-2 text-sm text-right text-gray-600 tabular-nums">
                {formatNumber(r.entries)}
              </td>
              <td className="px-4 py-2 text-sm text-right text-gray-900 tabular-nums">
                {formatCurrency(r.amount)}
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  </div>
)

const TransactionsTable: React.FC<{ report: CollectionReportResponse }> = ({ report }) => (
  <div className="rounded-lg border border-gray-200 overflow-hidden">
    <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
      <h4 className="text-sm font-semibold text-gray-900">Transactions</h4>
      <span className="text-xs text-gray-500">{formatNumber(report.transactions.length)} total</span>
    </div>
    <div className="overflow-x-auto max-h-96 overflow-y-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50 sticky top-0">
          <tr>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">OR / Receipt</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Student</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Method</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Cashier</th>
            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Entries</th>
            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {report.transactions.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-4 py-6 text-sm text-gray-400 text-center">
                No transactions found for the selected period.
              </td>
            </tr>
          ) : (
            report.transactions.map((t, idx) => (
              <tr key={idx} className="hover:bg-gray-50/50">
                <td className="px-4 py-2 text-sm text-gray-900 whitespace-nowrap">
                  {formatDateShort(t.date)}
                </td>
                <td className="px-4 py-2 text-sm text-gray-600">
                  {t.or_number || t.receipt_number || '—'}
                </td>
                <td className="px-4 py-2 text-sm text-gray-900">{t.student}</td>
                <td className="px-4 py-2 text-sm text-gray-600">{t.method}</td>
                <td className="px-4 py-2 text-sm text-gray-600">{t.cashier}</td>
                <td className="px-4 py-2 text-sm text-right text-gray-600 tabular-nums">
                  {formatNumber(t.entries)}
                </td>
                <td className="px-4 py-2 text-sm text-right text-gray-900 tabular-nums">
                  {formatCurrency(t.amount)}
                </td>
              </tr>
            ))
          )}
        </tbody>
        {report.transactions.length > 0 && (
          <tfoot className="bg-gray-50 sticky bottom-0">
            <tr className="font-semibold">
              <td colSpan={5} className="px-4 py-2 text-sm text-gray-900">
                Total
              </td>
              <td className="px-4 py-2 text-sm text-right text-gray-900 tabular-nums">
                {formatNumber(report.summary.entry_count)}
              </td>
              <td className="px-4 py-2 text-sm text-right text-gray-900 tabular-nums">
                {formatCurrency(report.summary.total_collected)}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  </div>
)

export default CollectionReportView
