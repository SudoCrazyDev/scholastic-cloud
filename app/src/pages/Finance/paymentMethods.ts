import type { SelectOption } from '../../components/select'

/**
 * The modes of payment a collection can be recorded under.
 *
 * Shared by the cashier's till and the receipt-approval queue on purpose: the two are
 * recording the same thing, and a mode offered in one place but not the other shows up
 * later as a collections report that cannot be totalled by method.
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

/**
 * The same list, guaranteed to contain whatever a record already holds.
 *
 * A receipt approved before a reviewer picked a mode was posted as
 * "Online - Receipt Upload", which is not something a cashier should be able to choose at
 * the till and so is not in the list. Without this the edit form would render that receipt
 * with an empty dropdown and quietly blank a real value on save.
 */
export const paymentMethodOptionsFor = (current?: string | null): SelectOption[] => {
  const value = (current ?? '').trim()
  if (!value || PAYMENT_METHOD_OPTIONS.some((option) => option.value === value)) {
    return PAYMENT_METHOD_OPTIONS
  }

  return [...PAYMENT_METHOD_OPTIONS, { value, label: value }]
}
