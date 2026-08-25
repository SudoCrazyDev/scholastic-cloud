import type { StudentInstallment, StudentNOAResponse } from '../types'

// What a printed notice of account covers. 'total' is the whole academic year; 'month'
// bills a single installment together with every period behind it that is still unpaid.
export type NOAScopeMode = 'total' | 'month'

export interface MonthlyNOAStatement {
  selected: StudentInstallment
  // Earlier periods that still owe money, oldest first.
  arrears: StudentInstallment[]
  arrearsTotal: number
  // Unpaid from a previous academic year. Owed too, so it leads the arrears.
  balanceForward: number
  // What the notice bills: the selected period plus everything unpaid behind it.
  totalDue: number
  otherFees: StudentNOAResponse['fees']
  otherFeesCharged: number
  otherFeesPaid: number
  otherFeesOutstanding: number
}

const round2 = (value: number) => Math.round(value * 100) / 100

// What a period still owes: unpaid principal plus the uncollected part of any surcharge
// booked against it. Mirrors the ledger's Payment Schedule so the print never disagrees.
export const periodUnpaid = (installment: StudentInstallment) =>
  Math.max(0, Number(installment.outstanding_amount || 0))

/**
 * The figures a month-scoped notice bills, derived from the same schedule the ledger's
 * Payment Schedule renders — so a printed notice and the screen can never disagree.
 *
 * Returns null when the sequence matches no installment (no plan assigned, or a stale
 * selection), which is the caller's signal to fall back to the full-year statement.
 */
export const summarizeMonthlyNOA = (
  data: StudentNOAResponse,
  sequence?: number | null
): MonthlyNOAStatement | null => {
  const installments = data.installments ?? []
  const selected =
    sequence == null
      ? null
      : installments.find((installment) => installment.sequence === sequence) ?? null
  if (!selected) return null

  const balanceForward = Math.max(0, Number(data.totals?.balance_forward || 0))
  const arrears = installments.filter(
    (installment) => installment.sequence < selected.sequence && periodUnpaid(installment) > 0
  )
  const arrearsTotal = arrears.reduce((sum, installment) => sum + periodUnpaid(installment), 0)

  // Cash-basis fees are collected on their own and were never amortized into the schedule,
  // so they are reported for information and kept out of the month's amount due. Late fees
  // are booked cash-basis too but belong to the period that incurred them — they are
  // already inside `late_fee_amount`, so listing them here would bill them twice.
  const otherFees = (data.fees ?? []).filter(
    (fee) => fee.is_additional && fee.billing_type === 'cash' && fee.source !== 'late_fee'
  )
  const otherFeesCharged =
    data.cash_basis?.charges ?? otherFees.reduce((sum, fee) => sum + Number(fee.amount || 0), 0)
  const otherFeesPaid = data.cash_basis?.paid ?? 0

  return {
    selected,
    arrears,
    arrearsTotal: round2(arrearsTotal),
    balanceForward,
    totalDue: round2(balanceForward + arrearsTotal + periodUnpaid(selected)),
    otherFees,
    otherFeesCharged,
    otherFeesPaid,
    otherFeesOutstanding:
      data.cash_basis?.outstanding ?? Math.max(0, round2(otherFeesCharged - otherFeesPaid)),
  }
}

/** One printed row of the notice's DESCRIPTION / AMOUNT table. */
export interface NOALine {
  key: string
  description: string
  amount: number
  /** Split across fees rather than read off one, so the notice can say so. */
  apportioned?: boolean
}

/**
 * The notice bills by fee, not by month: a payer reads "Tuition, Books, Miscellaneous",
 * the way the school's own form is laid out, and the periods being covered are stated in
 * words rather than as rows of their own.
 *
 * Every line is signed so the column adds up to the total printed beneath it.
 */
export const buildNOALines = (
  data: StudentNOAResponse,
  monthly: MonthlyNOAStatement | null
): { lines: NOALine[]; total: number } => {
  const breakdown = data.fee_breakdown ?? []
  const lines: NOALine[] = []

  if (!monthly) {
    const balanceForward = Number(data.totals?.balance_forward || 0)
    if (balanceForward > 0) {
      lines.push({
        key: 'balance-forward',
        description: 'Balance Forward (previous academic year)',
        amount: balanceForward,
      })
    }
    // Each fee states exactly what it still owes — charge less its discounts and
    // whatever the cashier has already collected against it.
    breakdown.forEach((fee) => {
      lines.push({
        key: `fee-${fee.fee_id}`,
        description: fee.fee_name,
        amount: fee.outstanding,
      })
    })
    // Money taken without being priced to a fee reduces the bill but belongs to no line
    // above, so it is named rather than silently folded into one.
    const unapplied = Number(data.unallocated_payments || 0)
    if (unapplied > 0) {
      lines.push({ key: 'unapplied', description: 'Less: Unapplied Payments', amount: -unapplied })
    }
    return { lines, total: Number(data.totals?.balance || 0) }
  }

  if (monthly.balanceForward > 0) {
    lines.push({
      key: 'balance-forward',
      description: 'Balance Forward (previous academic year)',
      amount: monthly.balanceForward,
    })
  }

  // A surcharge is booked whole against the period that incurred it, so it is billed at
  // its own figure instead of being spread — and only once its period is in scope.
  const lateFees = breakdown.filter(
    (fee) =>
      fee.source === 'late_fee' &&
      fee.outstanding > 0 &&
      (fee.installment_sequence ?? 0) <= monthly.selected.sequence
  )
  const lateFeesDue = round2(lateFees.reduce((sum, fee) => sum + fee.outstanding, 0))

  // What is left is amortized principal. The schedule divides every fee by the same
  // count, so a period is genuinely each fee's share of itself — apportioning by net
  // charge reproduces that split rather than inventing one.
  const principalDue = Math.max(0, round2(monthly.totalDue - monthly.balanceForward - lateFeesDue))
  const amortized = breakdown.filter(
    (fee) => fee.billing_type !== 'cash' && fee.source !== 'late_fee'
  )
  const weights = amortized.map((fee) => Math.max(0, round2(fee.charge - fee.discount)))
  const weightTotal = round2(weights.reduce((sum, weight) => sum + weight, 0))

  if (principalDue > 0 && weightTotal > 0) {
    let assigned = 0
    // The last line absorbs the rounding so the column reconciles with the total exactly.
    const lastIndex = weights.reduce((last, weight, index) => (weight > 0 ? index : last), -1)
    amortized.forEach((fee, index) => {
      if (weights[index] <= 0) return
      const share =
        index === lastIndex
          ? round2(principalDue - assigned)
          : round2((principalDue * weights[index]) / weightTotal)
      assigned = round2(assigned + share)
      lines.push({
        key: `fee-${fee.fee_id}`,
        description: fee.fee_name,
        amount: share,
        apportioned: true,
      })
    })
  } else if (principalDue > 0) {
    lines.push({ key: 'principal', description: 'Assessed Fees', amount: principalDue })
  }

  lateFees.forEach((fee) => {
    lines.push({ key: `late-${fee.fee_id}`, description: fee.fee_name, amount: fee.outstanding })
  })

  return { lines, total: monthly.totalDue }
}

/**
 * Which periods a month notice is collecting for, phrased for the slip — the arrears are
 * no longer rows of their own, so the notice has to say in words what it covers.
 */
export const describeCoveredPeriods = (monthly: MonthlyNOAStatement): string => {
  if (!monthly.arrears.length) return monthly.selected.label
  const earliest = monthly.arrears[0].label
  return `${earliest} to ${monthly.selected.label}`
}
