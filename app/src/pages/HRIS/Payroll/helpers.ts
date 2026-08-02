import type { PayrollDeductionBracket, PayrollDeductionPercentBasis } from '../../../types'

export const peso = (amount: number | null | undefined) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(Number(amount) || 0)

export const errorMessage = (err: unknown, fallback: string): string => {
  const response = (err as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } })?.response
  const errors = response?.data?.errors
  if (errors) {
    const first = Object.values(errors)[0]
    if (first?.[0]) return first[0]
  }
  return response?.data?.message || fallback
}

export const parseYmd = (s: string): Date => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// "2026-06-01" → "1-Jun" (matches the printed working-time record)
export const dayLabel = (ymd: string): string => {
  const d = parseYmd(ymd)
  return `${d.getDate()}-${MONTHS_SHORT[d.getMonth()]}`
}

export const longDate = (ymd: string | null | undefined): string => {
  if (!ymd) return '—'
  return parseYmd(ymd).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

export const shortDate = (ymd: string | null | undefined): string => {
  if (!ymd) return '—'
  return parseYmd(ymd).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

// "08:30" → "8:30 AM"
export const time12 = (time: string | null): string => {
  if (!time) return ''
  const [h, m] = time.split(':').map(Number)
  const suffix = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 === 0 ? 12 : h % 12
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`
}

export const numberOrZero = (value: string): number => {
  const parsed = parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

// 5 → "5%", 1.375 → "1.375%"
export const percent = (rate: number | null | undefined) =>
  `${(Number(rate) || 0).toLocaleString('en-PH', { maximumFractionDigits: 3 })}%`

// What a percentage deduction is taken from, as it reads in a sentence.
export const BASIS_LABELS: Record<PayrollDeductionPercentBasis, string> = {
  basic_pay: 'basic pay',
  gross_pay: 'salary earned',
}

export const BASIS_OPTIONS = [
  { value: 'basic_pay', label: 'Basic pay — before lates, undertime and absences' },
  { value: 'gross_pay', label: 'Salary earned — after lates, undertime and absences' },
]

// "5% of basic pay"
export const rateLabel = (rate: number, basis: PayrollDeductionPercentBasis | null) =>
  `${percent(rate)} of ${BASIS_LABELS[basis || 'basic_pay']}`

// "₱10,000.00 – ₱14,999.99" / "₱30,000.00 and above"
export const rangeLabel = (min: number, max: number | null): string =>
  max === null ? `${peso(min)} and above` : `${peso(min)} – ${peso(max)}`

// What one side of a salary range pays, as it reads in the table.
export const bracketShareLabel = (bracket: PayrollDeductionBracket, employer: boolean): string => {
  if (bracket.amount_type === 'percentage') {
    return percent(employer ? bracket.employer_rate_percent : bracket.employee_rate_percent)
  }
  return peso(employer ? bracket.employer_amount : bracket.employee_amount)
}

// What one side pays across a whole table, as a span: "₱275.00 – ₱700.00".
// This is the honest one-line answer to "how much is this deduction?" when
// there is no single figure. Peso and percentage ranges in the same table have
// no common unit to span, so a mixed one says so rather than inventing one.
export const bracketSpanLabel = (
  brackets: PayrollDeductionBracket[],
  employer: boolean
): string | null => {
  if (brackets.length === 0) return null

  const asPercent = brackets.every((bracket) => bracket.amount_type === 'percentage')
  const asPeso = brackets.every((bracket) => bracket.amount_type === 'fixed')
  if (!asPercent && !asPeso) return 'varies by range'

  const values = brackets.map((bracket) =>
    asPercent
      ? employer
        ? bracket.employer_rate_percent
        : bracket.employee_rate_percent
      : employer
        ? bracket.employer_amount
        : bracket.employee_amount
  )
  const format = asPercent ? percent : peso
  const low = Math.min(...values)
  const high = Math.max(...values)

  return low === high ? format(low) : `${format(low)} – ${format(high)}`
}
