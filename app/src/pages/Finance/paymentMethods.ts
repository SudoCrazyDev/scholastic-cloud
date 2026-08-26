import type { SelectOption } from '../../components/select'

/**
 * The modes of payment a cashier can record a collection under.
 *
 * Only the till offers this choice. A receipt approval does not: the mode is already
 * settled by the proof of payment the student uploaded, so the API stamps it rather than
 * asking the reviewer to restate it.
 */
export const PAYMENT_METHOD_OPTIONS: SelectOption[] = [
  { value: '', label: '— Select payment mode' },
  { value: 'Cash', label: 'Cash' },
  { value: 'Check', label: 'Check' },
  { value: 'Bank Transfer', label: 'Bank Transfer' },
  { value: 'GCash', label: 'GCash' },
  { value: 'Maya', label: 'Maya' },
  { value: 'Credit Card', label: 'Credit Card' },
  { value: 'Debit Card', label: 'Debit Card' },
  { value: 'Online Banking', label: 'Online Banking' },
  { value: 'Money Order', label: 'Money Order' },
  { value: 'Other', label: 'Other' },
]
