import type { LedgerFeeBreakdown } from '../../types'

/**
 * Splitting a lump sum the cashier takes at the till across the fees it settles, so the
 * collection posts with fee names on it instead of as one "General / Other" line.
 *
 * Why this exists rather than letting the money post unnamed: a General / Other line
 * names no fee, so the receipt names none either and the collection can never be
 * reconciled fee by fee. The per-fee *balances* were never wrong — the ledger shares
 * general money across the fees that still owe every time it is read
 * (`general_applied`) — but that share floats: charge the student something new and it
 * re-spreads. Naming the fees at the counter pins it, and it is the same answer the
 * cashier was looking at when they typed the amount.
 *
 * Two rules shape the split, and they are the ones a cashier would apply by hand:
 *
 * 1. **Proportional to what each fee still owes**, which is how the ledger already reads
 *    a general collection, so the balances the till was showing are the balances it comes
 *    back with. What the cashier already typed against a fee comes off its room first —
 *    a lump sum on top of a fee paid in full goes to the *other* fees.
 * 2. **Whole pesos**, because the shares are peso figures a school writes on a receipt
 *    and reads back off it. Centavos appear only where they have to: settling a fee whose
 *    balance is not a round peso, and the centavo tail of a lump sum that itself was not.
 *
 * The one invariant everything else bends to: the shares total the amount typed, exactly.
 * A split that lands a centavo short pays the student's bill a centavo short.
 */

/**
 * Whether a fee may take a share of a lump sum unasked.
 *
 * Late fees and cash-basis fees sit outside the payment schedule and are settled only by
 * money named to them — the same rule the ledger spreads a general collection by (see
 * `FeeBreakdownBuilder`), and the same one `ReceiptApprovalsView` suggests an allocation
 * by. The cashier can still type an amount against one on its own line.
 */
export const takesGeneralShare = (fee: LedgerFeeBreakdown) =>
  fee.source !== 'late_fee' && fee.billing_type !== 'cash'

/** One fee's share of the lump sum. */
export interface GeneralSplitShare {
  fee_id: string
  fee_name: string
  is_additional: boolean
  amount: number
  /** Part of `amount` that is past what this fee still owed — an advance payment. */
  advance: number
}

export interface GeneralSplitPlan {
  shares: GeneralSplitShare[]
  /**
   * What could not be named. Only ever non-zero when the student has no fees at all for
   * the year (nothing charged yet, or the ledger failed to load), in which case there is
   * nothing to name it to and it posts as General / Other exactly as it used to.
   */
  unassigned: number
}

const EMPTY_PLAN: GeneralSplitPlan = { shares: [], unassigned: 0 }

/** Centavos, so the arithmetic is integer and the shares add up. */
const toCents = (amount: number) => Math.round(amount * 100)
const toPesos = (cents: number) => cents / 100

/**
 * Spreads `amount` across `rooms` in proportion to each room, in whole pesos, without
 * ever giving a room more than it can hold. Everything is centavos.
 *
 * Each share is floored to a whole peso first, which leaves up to a peso per room over —
 * that remainder is handed out a peso at a time to the largest fractional shares, so the
 * shares total `amount` rather than `amount` less some pesos. A room with less than a
 * peso of space left takes exactly its space (settling it to the centavo), and the
 * centavo tail of an amount that was not a round peso lands on one share.
 *
 * @param  amount  never more than the rooms can hold; the caller decides what to do with
 *                 a surplus, since that is an advance payment rather than a share.
 */
const spreadWholePesos = (
  amount: number,
  rooms: { key: string; room: number }[]
): Record<string, number> => {
  const capacity = rooms.reduce((sum, entry) => sum + entry.room, 0)
  const spreadable = Math.min(amount, capacity)
  if (spreadable <= 0) return {}

  const shares: Record<string, number> = {}
  const order: { key: string; fraction: number }[] = []
  for (const { key, room } of rooms) {
    const exact = (spreadable * room) / capacity
    const whole = Math.floor(exact / 100) * 100
    shares[key] = whole
    order.push({ key, fraction: exact - whole })
  }
  order.sort((a, b) => b.fraction - a.fraction)

  const roomByKey = Object.fromEntries(rooms.map(({ key, room }) => [key, room]))
  let leftover = spreadable - Object.values(shares).reduce((sum, share) => sum + share, 0)
  while (leftover > 0) {
    let handedOut = false
    for (const { key } of order) {
      if (leftover <= 0) break
      const space = roomByKey[key] - shares[key]
      if (space <= 0) continue
      // A peso at a time, except where the fee has less than a peso of space left: then
      // it takes exactly its space and reads as settled instead of a centavo short.
      const give = Math.min(100, leftover, space)
      shares[key] += give
      leftover -= give
      handedOut = true
    }
    // Cannot happen — `spreadable` is capped at the capacity — but a float wobble must
    // not turn into a spin.
    if (!handedOut) break
  }

  return shares
}

/**
 * Where a lump sum goes.
 *
 * @param  breakdown  the student's fees, as the ledger reports them
 * @param  amount  the lump sum, in pesos
 * @param  entered  what the cashier already typed per fee, keyed by fee id — subtracted
 *                  from each fee's room, so the two together never drive a fee further
 *                  past settled than the cashier asked for
 */
export const planGeneralSplit = (
  breakdown: LedgerFeeBreakdown[],
  amount: number,
  entered: Record<string, string | number | undefined> = {}
): GeneralSplitPlan => {
  const total = toCents(amount)
  if (!Number.isFinite(total) || total <= 0) return EMPTY_PLAN
  if (breakdown.length === 0) return { shares: [], unassigned: toPesos(total) }

  const roomFor = (fee: LedgerFeeBreakdown) => {
    const typed = toCents(Number(entered[fee.fee_id]) || 0)
    return Math.max(toCents(fee.outstanding) - typed, 0)
  }

  // Fees inside the payment schedule are what a lump sum is for. Only if none of them
  // has any room left does it reach the fees that are normally settled by name alone —
  // better on a late fee the student does owe than sitting on the books as unnamed money.
  const scheduled = breakdown.filter(takesGeneralShare)
  const owing = (fees: LedgerFeeBreakdown[]) => fees.filter((fee) => roomFor(fee) > 0)
  const targets = [owing(scheduled), owing(breakdown), scheduled, breakdown].find(
    (candidates) => candidates.length > 0
  )!

  const rooms = targets.map((fee) => ({ key: fee.fee_id, room: roomFor(fee) }))
  const shares = spreadWholePesos(total, rooms)

  // Whatever the fees could not hold is an advance payment. It goes on the fee with the
  // most room — the one the school would have taken it against — rather than staying
  // unnamed: an advance the student is owed back is a conversation about a named fee,
  // not an anonymous credit nobody can trace to a charge.
  const assigned = Object.values(shares).reduce((sum, share) => sum + share, 0)
  const surplus = total - assigned
  if (surplus > 0) {
    const advanceTarget = targets.reduce((best, fee) =>
      roomFor(fee) > roomFor(best) || (roomFor(fee) === roomFor(best) && fee.charge > best.charge)
        ? fee
        : best
    )
    shares[advanceTarget.fee_id] = (shares[advanceTarget.fee_id] ?? 0) + surplus
  }

  return {
    // Kept in the breakdown's own order, which is the order the till lists the fees in.
    shares: targets
      .map((fee) => {
        const share = shares[fee.fee_id] ?? 0
        return {
          fee_id: fee.fee_id,
          fee_name: fee.fee_name,
          is_additional: fee.is_additional,
          amount: toPesos(share),
          advance: toPesos(Math.max(share - roomFor(fee), 0)),
        }
      })
      .filter((share) => share.amount > 0),
    unassigned: 0,
  }
}
