import React, { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PrinterIcon } from '@heroicons/react/24/outline'
import { Button } from '../../../components/button'
import { Select } from '../../../components/select'
import { payrollService } from '../../../services/payrollService'
import type { PayrollPeriodReport } from '../../../types'

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(amount)

const formatNumber = (n: number) => new Intl.NumberFormat('en-PH').format(n)

const formatDate = (iso: string | null) => {
  if (!iso) return '—'
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

const rangeLabel = (report: PayrollPeriodReport) =>
  `${formatDate(report.period.date_from)} — ${formatDate(report.period.date_to)}`

const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

function buildPrintHtml(report: PayrollPeriodReport): string {
  const { summary, deductions, period, institution } = report
  const generatedAt = new Date().toLocaleString('en-PH')

  const cards = [
    ['Employees Paid', formatNumber(summary.employee_count)],
    ['Total Salary Earned', formatCurrency(summary.gross_total)],
    ['Employee Deductions', formatCurrency(summary.employee_deduction_total)],
    ['Employer Contributions', formatCurrency(summary.employer_contribution_total)],
    ['Net Pay — Total Payout', formatCurrency(summary.net_total)],
    ['Total Payroll Cost', formatCurrency(summary.payroll_cost_total)],
  ]
    .map(
      ([label, value]) =>
        `<div class="card"><div class="card-label">${escapeHtml(
          label
        )}</div><div class="card-value">${escapeHtml(value)}</div></div>`
    )
    .join('')

  const deductionRows = deductions.length
    ? deductions
        .map(
          (d) => `<tr>
            <td>${escapeHtml(d.name)}</td>
            <td class="num">${formatNumber(d.employee_count)}</td>
            <td class="num">${formatCurrency(d.employee_amount)}</td>
            <td class="num">${formatCurrency(d.employer_amount)}</td>
            <td class="num">${formatCurrency(d.total_amount)}</td>
          </tr>`
        )
        .join('')
    : '<tr><td colspan="5" class="empty">No deductions were charged in this period.</td></tr>'

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Payroll Period Report — ${escapeHtml(period.name)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color: #111827; margin: 24px; font-size: 12px; }
    header { text-align: center; border-bottom: 2px solid #111827; padding-bottom: 10px; margin-bottom: 16px; }
    header .inst { font-size: 18px; font-weight: 700; }
    header .addr { font-size: 11px; color: #4b5563; }
    header .title { font-size: 14px; font-weight: 600; margin-top: 8px; }
    header .range { font-size: 12px; color: #374151; }
    header .meta { font-size: 11px; color: #4b5563; margin-top: 2px; }
    .cards { display: flex; flex-wrap: wrap; gap: 8px; margin: 14px 0; }
    .card { border: 1px solid #d1d5db; border-radius: 6px; padding: 8px 12px; min-width: 150px; flex: 1; }
    .card-label { font-size: 10px; text-transform: uppercase; color: #6b7280; letter-spacing: .03em; }
    .card-value { font-size: 15px; font-weight: 700; margin-top: 2px; }
    h2 { font-size: 13px; margin: 18px 0 6px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
    th, td { border: 1px solid #e5e7eb; padding: 5px 8px; text-align: left; }
    th { background: #f3f4f6; font-size: 10px; text-transform: uppercase; letter-spacing: .03em; }
    td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
    td.empty { text-align: center; color: #6b7280; font-style: italic; }
    tfoot td { font-weight: 700; background: #f9fafb; }
    .recon { width: 60%; margin-top: 4px; }
    .recon td:first-child { border: none; }
    .note { color: #6b7280; font-style: italic; margin: 6px 0; }
    .sign { margin-top: 40px; display: flex; gap: 40px; }
    .sign div { flex: 1; border-top: 1px solid #111827; padding-top: 4px; font-size: 11px; text-align: center; }
    footer { margin-top: 20px; font-size: 10px; color: #6b7280; text-align: center; border-top: 1px solid #e5e7eb; padding-top: 8px; }
    @media print { body { margin: 0; } }
  </style>
</head>
<body>
  <header>
    <div class="inst">${escapeHtml(institution.name || 'Payroll Period Report')}</div>
    ${institution.address ? `<div class="addr">${escapeHtml(institution.address)}</div>` : ''}
    <div class="title">Payroll Period Report</div>
    <div class="range">${escapeHtml(period.name)} · ${escapeHtml(rangeLabel(report))}</div>
    <div class="meta">
      Status: ${escapeHtml(period.status === 'finalized' ? 'Finalized' : 'Draft')}
      ${period.paid_on ? ` · Paid on ${escapeHtml(formatDate(period.paid_on))}` : ''}
    </div>
  </header>

  <div class="cards">${cards}</div>

  <h2>Deductions by Type</h2>
  <table>
    <thead><tr>
      <th>Deduction</th>
      <th class="num">Employees</th>
      <th class="num">Employee Share</th>
      <th class="num">Employer Share</th>
      <th class="num">Total</th>
    </tr></thead>
    <tbody>${deductionRows}</tbody>
    <tfoot><tr>
      <td>Total</td>
      <td></td>
      <td class="num">${formatCurrency(summary.employee_deduction_total)}</td>
      <td class="num">${formatCurrency(summary.employer_contribution_total)}</td>
      <td class="num">${formatCurrency(
        summary.employee_deduction_total + summary.employer_contribution_total
      )}</td>
    </tr></tfoot>
  </table>
  <p class="note">
    Employer contributions are the school's own share. They are not withheld from anyone's pay —
    they are remitted on top of the salaries.
  </p>

  <h2>Payout Reconciliation</h2>
  <table class="recon">
    <tbody>
      <tr><td>Total salary earned</td><td class="num">${formatCurrency(summary.gross_total)}</td></tr>
      <tr><td>Less: employee deductions</td><td class="num">(${formatCurrency(
        summary.employee_deduction_total
      )})</td></tr>
    </tbody>
    <tfoot>
      <tr><td>Net pay — total to be given out</td><td class="num">${formatCurrency(
        summary.net_total
      )}</td></tr>
    </tfoot>
  </table>

  <div class="sign">
    <div>Prepared by</div>
    <div>Checked by</div>
    <div>Approved by</div>
  </div>

  <footer>Generated on ${escapeHtml(generatedAt)}</footer>
  <script>window.onload=function(){window.print();window.onafterprint=function(){window.close();}}</script>
</body>
</html>`
}

const ReportsTab: React.FC = () => {
  const [periodId, setPeriodId] = useState('')

  const periodsQuery = useQuery({
    queryKey: ['payroll-periods'],
    queryFn: () => payrollService.getPeriods(),
  })

  const periods = periodsQuery.data?.data ?? []

  // Land on the newest period so the tab opens on something rather than an
  // empty picker — the report that gets asked for is almost always the latest.
  useEffect(() => {
    if (!periodId && periods.length > 0) {
      setPeriodId(periods[0].id)
    }
  }, [periodId, periods])

  const reportQuery = useQuery({
    queryKey: ['payroll-period-report', periodId],
    queryFn: () => payrollService.getPeriodReport(periodId),
    enabled: Boolean(periodId),
  })

  const report = reportQuery.data?.data

  const handlePrint = () => {
    if (!report) return
    const printWindow = window.open('', '_blank', 'width=900,height=700')
    if (!printWindow) return
    printWindow.document.write(buildPrintHtml(report))
    printWindow.document.close()
  }

  const summaryCards = report
    ? [
        { label: 'Employees Paid', value: formatNumber(report.summary.employee_count) },
        { label: 'Total Salary Earned', value: formatCurrency(report.summary.gross_total) },
        {
          label: 'Employee Deductions',
          value: formatCurrency(report.summary.employee_deduction_total),
        },
        {
          label: 'Employer Contributions',
          value: formatCurrency(report.summary.employer_contribution_total),
        },
        {
          label: 'Net Pay — Total Payout',
          value: formatCurrency(report.summary.net_total),
          accent: true,
        },
        { label: 'Total Payroll Cost', value: formatCurrency(report.summary.payroll_cost_total) },
      ]
    : []

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="px-6 py-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900">Payroll Period Report</h3>
        <p className="text-sm text-gray-600">
          What one period costs, totalled: the cash going out to staff, what was withheld from
          them, and what the school owes on top of the salaries.
        </p>
      </div>

      <div className="px-6 py-4 flex flex-col sm:flex-row sm:items-end gap-4 border-b border-gray-200 bg-gray-50/50">
        <div className="sm:w-80">
          <label className="block text-xs font-medium text-gray-500 uppercase mb-1">
            Payroll Period
          </label>
          <Select
            inputSize="sm"
            value={periodId}
            onChange={(e) => setPeriodId(e.target.value)}
            disabled={periodsQuery.isLoading || periods.length === 0}
            options={periods.map((p) => ({
              value: p.id,
              label: `${p.name}${p.status === 'finalized' ? ' (finalized)' : ''}`,
            }))}
            placeholder={periodsQuery.isLoading ? 'Loading periods…' : 'Select a payroll period'}
          />
        </div>
        <Button variant="outline" onClick={handlePrint} disabled={!report || reportQuery.isFetching}>
          <PrinterIcon className="h-4 w-4" />
          Print
        </Button>
      </div>

      <div className="p-6">
        {periodsQuery.isSuccess && periods.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-8">
            No payroll periods yet. Create one under Payroll Periods first.
          </p>
        ) : reportQuery.isPending || reportQuery.isFetching ? (
          <div className="py-8 text-center">
            <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-primary-600 mb-2" />
            <p className="text-gray-500">Building report…</p>
          </div>
        ) : reportQuery.isError ? (
          <p className="text-sm text-red-600 text-center py-8">
            Could not load the report for this period.
          </p>
        ) : !report ? (
          <p className="text-sm text-gray-500 text-center py-8">Select a payroll period.</p>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <p className="text-sm font-medium text-gray-700">{rangeLabel(report)}</p>
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${
                  report.period.status === 'finalized'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-amber-100 text-amber-700'
                }`}
              >
                {report.period.status === 'finalized' ? 'Finalized' : 'Draft'}
              </span>
              {report.period.paid_on && (
                <span className="text-xs text-gray-500">
                  Paid on {formatDate(report.period.paid_on)}
                </span>
              )}
            </div>

            {report.summary.employee_count === 0 && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                This period has no payslips yet. Generate them under Payroll Periods to see totals.
              </p>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {summaryCards.map((c) => (
                <div
                  key={c.label}
                  className={`rounded-lg border p-3 ${
                    c.accent ? 'border-primary-200 bg-primary-50' : 'border-gray-200 bg-white'
                  }`}
                >
                  <p className="text-xs text-gray-500 uppercase">{c.label}</p>
                  <p
                    className={`text-lg font-semibold tabular-nums ${
                      c.accent ? 'text-primary-700' : 'text-gray-900'
                    }`}
                  >
                    {c.value}
                  </p>
                </div>
              ))}
            </div>

            <div className="rounded-lg border border-gray-200 overflow-hidden">
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
                <h4 className="text-sm font-semibold text-gray-900">Deductions by Type</h4>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Deduction
                      </th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                        Employees
                      </th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                        Employee Share
                      </th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                        Employer Share
                      </th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {report.deductions.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-6 text-sm text-gray-400 text-center">
                          No deductions were charged in this period.
                        </td>
                      </tr>
                    ) : (
                      report.deductions.map((d) => (
                        <tr key={d.key} className="hover:bg-gray-50/50">
                          <td className="px-4 py-2 text-sm text-gray-900">{d.name}</td>
                          <td className="px-4 py-2 text-sm text-right text-gray-600 tabular-nums">
                            {formatNumber(d.employee_count)}
                          </td>
                          <td className="px-4 py-2 text-sm text-right text-gray-900 tabular-nums">
                            {formatCurrency(d.employee_amount)}
                          </td>
                          <td className="px-4 py-2 text-sm text-right text-gray-900 tabular-nums">
                            {formatCurrency(d.employer_amount)}
                          </td>
                          <td className="px-4 py-2 text-sm text-right text-gray-900 tabular-nums">
                            {formatCurrency(d.total_amount)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {report.deductions.length > 0 && (
                    <tfoot className="bg-gray-50">
                      <tr className="font-semibold">
                        <td className="px-4 py-2 text-sm text-gray-900">Total</td>
                        <td />
                        <td className="px-4 py-2 text-sm text-right text-gray-900 tabular-nums">
                          {formatCurrency(report.summary.employee_deduction_total)}
                        </td>
                        <td className="px-4 py-2 text-sm text-right text-gray-900 tabular-nums">
                          {formatCurrency(report.summary.employer_contribution_total)}
                        </td>
                        <td className="px-4 py-2 text-sm text-right text-gray-900 tabular-nums">
                          {formatCurrency(
                            report.summary.employee_deduction_total +
                              report.summary.employer_contribution_total
                          )}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>

            <p className="text-xs text-gray-500">
              Employer contributions are the school's own share. They are not withheld from
              anyone's pay — they are remitted on top of the salaries, which is why the total
              payroll cost is higher than the payout.
            </p>

            <div className="rounded-lg border border-gray-200 overflow-hidden max-w-md">
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
                <h4 className="text-sm font-semibold text-gray-900">Payout Reconciliation</h4>
              </div>
              <table className="min-w-full">
                <tbody className="divide-y divide-gray-100">
                  <tr>
                    <td className="px-4 py-2 text-sm text-gray-700">Total salary earned</td>
                    <td className="px-4 py-2 text-sm text-right text-gray-900 tabular-nums">
                      {formatCurrency(report.summary.gross_total)}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 text-sm text-gray-700">Less: employee deductions</td>
                    <td className="px-4 py-2 text-sm text-right text-gray-900 tabular-nums">
                      ({formatCurrency(report.summary.employee_deduction_total)})
                    </td>
                  </tr>
                </tbody>
                <tfoot className="bg-gray-50">
                  <tr className="font-semibold">
                    <td className="px-4 py-2 text-sm text-gray-900">
                      Net pay — total to be given out
                    </td>
                    <td className="px-4 py-2 text-sm text-right text-primary-700 tabular-nums">
                      {formatCurrency(report.summary.net_total)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default ReportsTab
