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

// What a period is billing this cycle: its own principal plus any surcharge booked
// against it. Mirrors the ledger's Payment Schedule so the print never disagrees with it.
export const periodCharged = (installment: StudentInstallment) =>
  Number(installment.amount || 0) + Number(installment.late_fee_amount || 0)

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
