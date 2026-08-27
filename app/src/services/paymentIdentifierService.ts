import { api } from '../lib/api'
import type { ApiResponse, PaymentIdentifierHolders } from '../types'

/**
 * Asks whether a receipt identifier is already on the books, before anything is posted.
 *
 * The API also reports reuse *after* a write, as a warning on the response, and that is
 * the right shape for the till. This is for the screens that can still change their mind
 * — receipt approvals, where the number is read off an image and a duplicate usually means
 * the same transfer was uploaded twice.
 */
class PaymentIdentifierService {
  /**
   * Returns only the fields that collide, so an empty object means nothing is reused.
   * Pass `except_transaction_id` / `except_payment_id` when editing a collection, so it
   * is not reported as its own duplicate.
   */
  async holders(params: {
    or_number?: string | null
    reference_number?: string | null
    except_transaction_id?: string | null
    except_payment_id?: string | null
  }) {
    const query = new URLSearchParams()
    if (params.or_number) query.set('or_number', params.or_number)
    if (params.reference_number) query.set('reference_number', params.reference_number)
    if (params.except_transaction_id) {
      query.set('except_transaction_id', params.except_transaction_id)
    }
    if (params.except_payment_id) query.set('except_payment_id', params.except_payment_id)

    const response = await api.get<ApiResponse<PaymentIdentifierHolders>>(
      `/payment-identifiers/holders?${query.toString()}`
    )
    return response.data
  }
}

export const paymentIdentifierService = new PaymentIdentifierService()
