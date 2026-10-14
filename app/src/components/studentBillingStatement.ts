import type { StudentNOAResponse } from '../types'
import { summarizeMonthlyNOA } from './studentNOAStatement'
import type { MonthlyNOAStatement } from './studentNOAStatement'

/** One official receipt as the billing statement lists it. */
export interface BillingStatementPayment {
  key: string
  date: string | null
  orNumber: string
  // Collected against the payment schedule — tuition, miscellaneous, books and the like.
  scheduled: number
  // Collected against fees outside the schedule: late fees and cash-basis charges.
  others: number
  total: number
}

export interface BillingStatement {
  balanceForward: number
  // Assessed fees before surcharges, which are listed on their own line.
  payable: number
  lateFees: number
  discounts: number
  payments: BillingStatementPayment[]
  totalPaid: number
  balance: number
  // The month being billed, with every earlier period still unpaid. Null when the student
  // has no payment plan, in which case the statement asks for the whole balance.
  monthly: MonthlyNOAStatement | null
  amountDue: number
}

const round2 = (value: number) => Math.round(value * 100) / 100

/**
 * The family-facing billing statement: what was assessed, every receipt issued against it,
 * and what is owed this month. Built from the notice of account payload, so its balance and
 * amount due are the same figures the notice and the ledger show.
 *
 * Every row is signed so Payable less Total Amount Paid reconciles to the balance printed.
 */
export const buildBillingStatement = (
  data: StudentNOAResponse,
  sequence: number | null
): BillingStatement => {
  const offScheduleFeeIds = new Set(
    (data.fees ?? [])
      .filter(
        (fee) => fee.is_additional && (fee.billing_type === 'cash' || fee.source === 'late_fee')
      )
      .map((fee) => fee.fee_id)
  )

  // A receipt is stored as one row per fee it paid, but the payer holds one OR for it.
  const byReceipt = new Map<string, BillingStatementPayment>()
  ;(data.payments ?? []).forEach((payment) => {
    const orNumber = payment.receipt_number || payment.reference_number || ''
    const key = orNumber || payment.payment_id
    const amount = Number(payment.amount || 0)
    const isOther = Boolean(payment.fee_id && offScheduleFeeIds.has(payment.fee_id))
    const row = byReceipt.get(key) ?? {
      key,
      date: payment.payment_date ?? null,
      orNumber,
      scheduled: 0,
      others: 0,
      total: 0,
    }
    if (isOther) row.others = round2(row.others + amount)
    else row.scheduled = round2(row.scheduled + amount)
    row.total = round2(row.total + amount)
    if (payment.payment_date && (!row.date || payment.payment_date < row.date)) {
      row.date = payment.payment_date
    }
    byReceipt.set(key, row)
  })
  const payments = [...byReceipt.values()].sort((a, b) =>
    (a.date ?? '').localeCompare(b.date ?? '')
  )

  const lateFees = Number(data.totals?.late_fees || 0)
  const balance = Number(data.totals?.balance || 0)
  const monthly = summarizeMonthlyNOA(data, sequence)

  return {
    balanceForward: Number(data.totals?.balance_forward || 0),
    payable: round2(Number(data.totals?.charges || 0) - lateFees),
    lateFees,
    discounts: Number(data.totals?.discounts || 0),
    payments,
    totalPaid: Number(data.totals?.payments || 0),
    balance,
    monthly,
    amountDue: monthly ? monthly.totalDue : Math.max(0, balance),
  }
}

/**
 * The period a cashier most likely means: the one the server marks current, else the one
 * falling in this month, else the oldest still owing, else the last of the schedule.
 */
export const defaultBillingSequence = (data: StudentNOAResponse): number | null => {
  const installments = data.installments ?? []
  if (!installments.length) return null
  const current = installments.find((installment) => installment.is_current)
  if (current) return current.sequence
  const now = new Date()
  const nowKey = now.getFullYear() * 12 + now.getMonth()
  const thisMonth = installments.find((installment) => {
    const due = new Date(`${installment.due_date}T00:00:00`)
    if (Number.isNaN(due.getTime())) return false
    return due.getFullYear() * 12 + due.getMonth() === nowKey
  })
  if (thisMonth) return thisMonth.sequence
  const firstUnpaid = installments.find(
    (installment) => Number(installment.outstanding_amount || 0) > 0
  )
  return (firstUnpaid ?? installments[installments.length - 1]).sequence
}
