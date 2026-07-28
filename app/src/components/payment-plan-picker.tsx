import React, { useState } from 'react'
import { Button } from './button'
import { Input } from './input'
import type { PaymentPlan } from '../types'

export interface PaymentPlanPickerProps {
  plans: PaymentPlan[]
  loading: boolean
  plansLoading?: boolean
  currentPlanId?: string
  /**
   * Capture a reason alongside the change. Staff overriding a plan on a
   * student's behalf should say why, since the note is what the change history
   * shows back to whoever reviews it later.
   */
  withNote?: boolean
  noteRequired?: boolean
  onSelect: (paymentPlanId: string, note?: string) => void
}

/**
 * Plan chooser shared by the student portal (first selection) and the staff
 * surfaces that override a plan on the student's behalf.
 */
export const PaymentPlanPicker: React.FC<PaymentPlanPickerProps> = ({
  plans,
  loading,
  plansLoading,
  currentPlanId,
  withNote = false,
  noteRequired = false,
  onSelect,
}) => {
  const [choice, setChoice] = useState<string | null>(currentPlanId ?? null)
  const [note, setNote] = useState('')

  const cardClass = (active: boolean) =>
    `flex-1 text-left cursor-pointer rounded-xl border p-5 transition shadow-sm ${
      active
        ? 'border-primary-500 ring-2 ring-primary-200 bg-white'
        : 'border-gray-200 bg-white hover:border-primary-300'
    }`

  if (plansLoading) {
    return <p className="text-sm text-gray-500">Loading available plans…</p>
  }

  if (!plans.length) {
    return (
      <p className="text-sm text-gray-600">
        No payment plans are available yet. Please contact your school registrar.
      </p>
    )
  }

  const trimmedNote = note.trim()
  const noteMissing = withNote && noteRequired && trimmedNote.length === 0

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {plans.map((plan) => (
          <button
            key={plan.id}
            type="button"
            className={cardClass(choice === plan.id)}
            onClick={() => setChoice(plan.id)}
          >
            <div className="flex items-center justify-between mb-2 gap-2">
              <h5 className="text-base font-semibold text-gray-900">{plan.name}</h5>
              <span className="text-xs font-medium text-primary-600 bg-primary-50 rounded-full px-2 py-0.5 whitespace-nowrap">
                {plan.installment_count} installment{plan.installment_count === 1 ? '' : 's'}
              </span>
            </div>
            <p className="text-sm text-gray-600">
              {plan.description
                ? plan.description
                : `Pay your net fees in ${plan.installment_count} installment${
                    plan.installment_count === 1 ? '' : 's'
                  }.`}
            </p>
          </button>
        ))}
      </div>

      {withNote && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Reason for the change {noteRequired ? '' : '(optional)'}
          </label>
          <Input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="e.g. Parent requested a shift to quarterly terms"
            maxLength={255}
          />
          <p className="mt-1 text-xs text-gray-500">
            Recorded in the payment plan history along with your name.
          </p>
        </div>
      )}

      <div className="flex justify-end">
        <Button
          disabled={!choice || loading || choice === currentPlanId || noteMissing}
          loading={loading}
          onClick={() => choice && onSelect(choice, trimmedNote || undefined)}
          className="bg-primary-600 hover:bg-primary-700 text-white"
        >
          {currentPlanId ? 'Update plan' : 'Confirm plan'}
        </Button>
      </div>
    </div>
  )
}

export default PaymentPlanPicker
