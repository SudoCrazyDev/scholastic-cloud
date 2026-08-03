import type {
  StaffLoanInterestMethod,
  StaffLoanQuote,
  StaffLoanRatePeriod,
  StaffLoanStatus,
  StaffLoanTerms,
} from '../../../types'

/**
 * The loan form's live preview.
 *
 * This is a deliberate second copy of App\Services\StaffLoanService::quote —
 * the schedule has to redraw as the principal is typed, and a round trip per
 * keystroke is not that. The server stays the authority: it re-prices on save
 * and again on approval, so a drift between the two shows up as a corrected
 * figure rather than as a wrong loan. Keep the two in step.
 *
 * Everything is done in centavos and only turned back into pesos at the end.
 * Dividing a twelve-month loan in floating point leaves a centavo unaccounted
 * for often enough to matter.
 */

/** An annual rate is plain twelfths of itself, not the compounded twelfth root. */
export const monthlyRate = (
  method: StaffLoanInterestMethod,
  ratePercent: number,
  ratePeriod: StaffLoanRatePeriod
): number => {
  if (method === 'none' || ratePercent <= 0) return 0
  const rate = ratePercent / 100
  return ratePeriod === 'annual' ? rate / 12 : rate
}

interface Row {
  principal: number
  interest: number
  opening: number
  closing: number
}

/**
 * No interest, or flat interest on the whole principal: every installment is
 * the same and the split never moves. Whatever the division leaves over lands
 * on the last row.
 */
const levelRows = (principalCents: number, rate: number, term: number): Row[] => {
  const interestCents = Math.round(principalCents * rate * term)
  const perPrincipal = Math.trunc(principalCents / term)
  const perInterest = Math.trunc(interestCents / term)

  const rows: Row[] = []
  let balance = principalCents

  for (let index = 0; index < term; index++) {
    const last = index === term - 1
    const principal = last ? balance : perPrincipal
    const interest = last ? interestCents - perInterest * (term - 1) : perInterest

    rows.push({ principal, interest, opening: balance, closing: balance - principal })
    balance -= principal
  }

  return rows
}

/**
 * Interest on what is still owed, with a level monthly payment off the annuity
 * formula. The last row is settled against the balance rather than computed,
 * which is what closes the schedule at exactly zero.
 */
const diminishingRows = (principalCents: number, rate: number, term: number): Row[] => {
  const payment = Math.round((principalCents * rate) / (1 - (1 + rate) ** -term))

  const rows: Row[] = []
  let balance = principalCents

  for (let index = 0; index < term; index++) {
    const interest = Math.round(balance * rate)
    const principal = index === term - 1 ? balance : Math.min(payment - interest, balance)

    rows.push({ principal, interest, opening: balance, closing: balance - principal })
    balance -= principal
  }

  return rows
}

const pesos = (cents: number): number => Math.round(cents) / 100

/** first + n months, clamped so the 31st does not leap into March. */
const addMonths = (ymd: string, months: number): string => {
  const [year, month, day] = ymd.split('-').map(Number)
  const target = new Date(year, month - 1 + months, 1)
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  target.setDate(Math.min(day, lastDay))
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(target.getDate())}`
}

export const quoteLoan = (terms: StaffLoanTerms): StaffLoanQuote => {
  const term = Math.max(1, Math.trunc(terms.term_months || 0))
  const principalCents = Math.round((terms.principal_amount || 0) * 100)
  const rate = monthlyRate(terms.interest_method, terms.interest_rate_percent, terms.rate_period)

  const rows =
    terms.interest_method === 'diminishing' && rate > 0
      ? diminishingRows(principalCents, rate, term)
      : levelRows(principalCents, rate, term)

  const interestCents = rows.reduce((sum, row) => sum + row.interest, 0)

  const installments = rows.map((row, index) => ({
    sequence: index + 1,
    due_date: addMonths(terms.first_deduction_date, index),
    amount: pesos(row.principal + row.interest),
    principal_component: pesos(row.principal),
    interest_component: pesos(row.interest),
    opening_balance: pesos(row.opening),
    closing_balance: pesos(row.closing),
  }))

  return {
    principal: pesos(principalCents),
    interest: pesos(interestCents),
    total: pesos(principalCents + interestCents),
    installment: installments[0]?.amount ?? 0,
    installments,
  }
}

export const INTEREST_METHOD_OPTIONS = [
  { value: 'none', label: 'No interest — collect exactly what was lent' },
  { value: 'add_on', label: 'Add-on (flat) — one interest charge, split evenly' },
  { value: 'diminishing', label: 'Diminishing balance — interest on what is still owed' },
]

export const RATE_PERIOD_OPTIONS = [
  { value: 'monthly', label: '% per month' },
  { value: 'annual', label: '% per year' },
]

export const INTEREST_METHOD_LABELS: Record<StaffLoanInterestMethod, string> = {
  none: 'No interest',
  add_on: 'Add-on',
  diminishing: 'Diminishing',
}

export const LOAN_STATUS_LABELS: Record<StaffLoanStatus, string> = {
  pending: 'For approval',
  approved: 'Collecting',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
  completed: 'Fully paid',
}

export const LOAN_STATUS_CLASSES: Record<StaffLoanStatus, string> = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-blue-100 text-blue-700',
  rejected: 'bg-gray-100 text-gray-500',
  cancelled: 'bg-gray-100 text-gray-500',
  completed: 'bg-green-100 text-green-700',
}

/** "1% per month" / "12% per year" / "no interest" */
export const interestLabel = (
  method: StaffLoanInterestMethod,
  ratePercent: number,
  ratePeriod: StaffLoanRatePeriod
): string => {
  if (method === 'none' || ratePercent <= 0) return 'No interest'
  const rate = ratePercent.toLocaleString('en-PH', { maximumFractionDigits: 3 })
  return `${rate}% ${ratePeriod === 'annual' ? 'per year' : 'per month'} · ${INTEREST_METHOD_LABELS[method]}`
}
