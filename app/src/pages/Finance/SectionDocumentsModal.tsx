import React, { useEffect, useMemo, useState } from 'react'
import { BlobProvider, Document } from '@react-pdf/renderer'
import { Button } from '../../components/button'
import { Input } from '../../components/input'
import { Select } from '../../components/select'
import { StudentNOAPage } from '../../components/StudentNOAPDF'
import { StudentBillingStatementPage } from '../../components/StudentBillingStatementPDF'
import type { NOAScopeMode } from '../../components/studentNOAStatement'
import { studentFinanceService } from '../../services/studentFinanceService'
import type { FinanceDashboardStudent, StudentNOAResponse } from '../../types'

export type SectionDocument = 'noa' | 'billing-statement'

interface SectionDocumentsModalProps {
  kind: SectionDocument
  sectionName: string
  students: FinanceDashboardStudent[]
  academicYear: string
  institutionName?: string
  institutionAddress?: string
  logoUrl?: string | null
  defaultPreparedBy?: string
  onClose: () => void
}

// Enough in flight to load a section quickly without flooding the API with one request
// per student at once.
const CONCURRENCY = 5

const monthKey = (date: string) => date.slice(0, 7)

const monthLabel = (key: string) => {
  const date = new Date(`${key}-01T00:00:00`)
  if (Number.isNaN(date.getTime())) return key
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

/**
 * Every student of one section in a single PDF — one notice of account or billing statement
 * per page, in the order the dashboard lists them — so the cashier prints the section at
 * once instead of opening each student.
 *
 * Students can be on different payment plans, so the period is chosen as a calendar month
 * and each student is billed for their own installment falling due in it. A student with
 * no installment that month gets the full-year notice, or a statement for the whole balance.
 */
export const SectionDocumentsModal: React.FC<SectionDocumentsModalProps> = ({
  kind,
  sectionName,
  students: initialStudents,
  academicYear,
  institutionName,
  institutionAddress,
  logoUrl,
  defaultPreparedBy,
  onClose,
}) => {
  // Held from when the modal opened: the list refetches when the cashier comes back from
  // the PDF tab, and a new array would otherwise start every account loading again.
  const [students] = useState(initialStudents)
  const [accounts, setAccounts] = useState<StudentNOAResponse[] | null>(null)
  const [loaded, setLoaded] = useState(0)
  const [failed, setFailed] = useState<string[]>([])
  const [scope, setScope] = useState<NOAScopeMode>(kind === 'noa' ? 'total' : 'month')
  const [month, setMonth] = useState('')
  const [preparedBy, setPreparedBy] = useState(defaultPreparedBy ?? '')

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      const results: (StudentNOAResponse | null)[] = new Array(students.length).fill(null)
      const missed: string[] = []
      let next = 0
      const worker = async () => {
        while (!cancelled && next < students.length) {
          const index = next++
          const student = students[index]
          try {
            const response = await studentFinanceService.getNoticeOfAccount(
              student.id,
              academicYear
            )
            results[index] = response.data
          } catch {
            missed.push(student.display_name)
          }
          if (!cancelled) setLoaded((count) => count + 1)
        }
      }
      await Promise.all(Array.from({ length: CONCURRENCY }, worker))
      if (cancelled) return
      setFailed(missed)
      setAccounts(results.filter((account): account is StudentNOAResponse => Boolean(account)))
    }
    run()
    return () => {
      cancelled = true
    }
  }, [students, academicYear])

  // Every month any student has an installment due in, oldest first.
  const monthOptions = useMemo(() => {
    const keys = new Set<string>()
    accounts?.forEach((account) =>
      (account.installments ?? []).forEach((installment) => {
        if (installment.due_date) keys.add(monthKey(installment.due_date))
      })
    )
    return [...keys].sort().map((key) => ({ value: key, label: monthLabel(key) }))
  }, [accounts])

  // Start on this month when the schedule has it, otherwise on the first month.
  useEffect(() => {
    if (month || !monthOptions.length) return
    const now = new Date()
    const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    setMonth(monthOptions.some((option) => option.value === current) ? current : monthOptions[0].value)
  }, [month, monthOptions])

  const byMonth = scope === 'month' && month !== ''
  const sequenceFor = (account: StudentNOAResponse) =>
    byMonth
      ? (account.installments ?? []).find(
          (installment) => installment.due_date && monthKey(installment.due_date) === month
        )?.sequence ?? null
      : null

  const withoutPeriodNames = byMonth
    ? (accounts ?? [])
        .filter((account) => sequenceFor(account) == null)
        .map(({ student }) => `${student.last_name}, ${student.first_name}`.toUpperCase())
    : []
  const withoutPeriod = withoutPeriodNames.length

  const title = kind === 'noa' ? 'Section Notice of Account' : 'Section Billing Statement'
  const loading = accounts === null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-900">{title}</h3>
          <p className="text-sm text-gray-500 mt-1">
            {sectionName} — {students.length} student{students.length === 1 ? '' : 's'}, one per
            page in a single PDF.
          </p>
        </div>

        <div className="px-5 py-4 space-y-4">
          {loading ? (
            <div className="space-y-2">
              <p className="text-sm text-gray-600">
                Loading accounts… {loaded} of {students.length}
              </p>
              <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className="h-full bg-primary-600 transition-all"
                  style={{
                    width: `${students.length ? (loaded / students.length) * 100 : 100}%`,
                  }}
                />
              </div>
            </div>
          ) : (
            <>
              {kind === 'noa' && (
                <div className="grid gap-2">
                  {(
                    [
                      ['total', 'Total balance', `Full statement for ${academicYear}.`],
                      [
                        'month',
                        'Specific month',
                        "Each student's installment due that month, with every earlier month still unpaid.",
                      ],
                    ] as const
                  ).map(([value, label, hint]) => (
                    <button
                      key={value}
                      type="button"
                      disabled={value === 'month' && !monthOptions.length}
                      onClick={() => setScope(value)}
                      className={`text-left rounded-lg border px-4 py-3 transition disabled:opacity-60 disabled:cursor-not-allowed ${
                        scope === value
                          ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-500'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <span className="block text-sm font-medium text-gray-900">{label}</span>
                      <span className="block text-xs text-gray-500 mt-0.5">{hint}</span>
                    </button>
                  ))}
                </div>
              )}

              {scope === 'month' && monthOptions.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {kind === 'noa' ? 'Month' : 'Billing month'}
                  </label>
                  <Select
                    value={month}
                    onChange={(e) => setMonth(e.target.value)}
                    options={monthOptions}
                  />
                </div>
              )}

              {kind === 'billing-statement' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Prepared by
                  </label>
                  <Input value={preparedBy} onChange={(e) => setPreparedBy(e.target.value)} />
                </div>
              )}

              {(withoutPeriod > 0 || failed.length > 0) && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 space-y-1 text-sm text-amber-800">
                  {withoutPeriod > 0 && (
                    <div>
                      <p>
                        {withoutPeriod} student{withoutPeriod === 1 ? ' has' : 's have'} no
                        installment due in {monthLabel(month)} —{' '}
                        {kind === 'noa'
                          ? 'their full-year notice is printed instead.'
                          : 'their statement asks for the whole balance.'}
                      </p>
                      <ul className="mt-1 list-disc pl-5 text-xs max-h-32 overflow-y-auto">
                        {withoutPeriodNames.map((name, index) => (
                          <li key={`${name}-${index}`}>{name}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {failed.length > 0 && (
                    <p>
                      Left out, their account failed to load: {failed.join(', ')}.
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
          {loading || !accounts?.length ? (
            <Button type="button" disabled>
              {loading ? 'Loading...' : 'Nothing to print'}
            </Button>
          ) : (
            // Remounted per selection so the blob is rebuilt for what is being printed.
            <BlobProvider
              key={`${scope}-${month}-${preparedBy}-${logoUrl ? 'logo' : 'nologo'}`}
              document={
                <Document>
                  {accounts.map((account) =>
                    kind === 'noa' ? (
                      <StudentNOAPage
                        key={account.student.id}
                        data={account}
                        institutionName={institutionName}
                        institutionAddress={institutionAddress}
                        logoUrl={logoUrl}
                        scope={scope}
                        installmentSequence={sequenceFor(account)}
                      />
                    ) : (
                      <StudentBillingStatementPage
                        key={account.student.id}
                        data={account}
                        institutionName={institutionName}
                        institutionAddress={institutionAddress}
                        logoUrl={logoUrl}
                        installmentSequence={sequenceFor(account)}
                        preparedBy={preparedBy.trim()}
                      />
                    )
                  )}
                </Document>
              }
            >
              {({ url, loading: preparing }) => (
                <Button
                  type="button"
                  disabled={preparing || !url}
                  onClick={() => url && window.open(url, '_blank')}
                >
                  {preparing ? 'Preparing...' : 'Open PDF'}
                </Button>
              )}
            </BlobProvider>
          )}
        </div>
      </div>
    </div>
  )
}

export default SectionDocumentsModal
