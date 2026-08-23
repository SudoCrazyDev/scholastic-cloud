import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  PencilSquareIcon,
  TrashIcon,
  PlusIcon,
  XMarkIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline'
import { toast } from 'react-hot-toast'
import { Button } from '../../components/button'
import { Input } from '../../components/input'
import { Select } from '../../components/select'
import { MonthDayPicker } from '../../components/month-day-picker'
import { MONTH_NAMES } from '../../utils/monthNames'
import { paymentPlanService } from '../../services/paymentPlanService'
import type {
  AdvancePaymentMode,
  CreatePaymentPlanData,
  PaymentPlan,
  SurchargeMode,
} from '../../types'

const monthName = (month: number) => MONTH_NAMES[month - 1] ?? String(month)

const ADVANCE_MODE_OPTIONS: Array<{ value: AdvancePaymentMode; label: string; hint: string }> = [
  {
    value: 'equal_split',
    label: 'Pays off the earliest installments',
    hint:
      'Each installment is the same fixed amount. Money paid before the schedule starts settles ' +
      'installment 1, then 2, and so on — a student who pays early is simply months ahead.',
  },
  {
    value: 'net_of_downpayment',
    label: 'Counts as a downpayment (lowers every installment)',
    hint:
      'Anything collected before the first installment’s month is deducted from the amount ' +
      'being divided, so the monthly figure itself drops. Paying ₱8,100 up front on ₱30,600 ' +
      'over 9 installments gives ₱2,500 a month instead of ₱3,400.',
  },
]

const SURCHARGE_MODE_OPTIONS: Array<{ value: SurchargeMode; label: string; hint: string }> = [
  {
    value: 'per_installment',
    label: 'Charged once per installment',
    hint:
      'Each installment is surcharged once, on its own amount, when its grace period ends ' +
      'unpaid. An unpaid ₱2,500 at 3% adds ₱75 and stops there, however long it stays unpaid.',
  },
  {
    value: 'running_total',
    label: 'Charged once, then totalled into a running balance',
    hint:
      'Surcharged once per installment exactly as above — nothing compounds. What changes is ' +
      'what each period asks for: the unpaid balance behind it is folded in. Unpaid June at ' +
      '₱1,030 and unpaid August at ₱1,030 make September ask for ₱3,060, not its own ₱1,000.',
  },
  {
    value: 'carry_over',
    label: 'Carried over and charged again each period',
    hint:
      'The unpaid balance rolls into the next period and is surcharged again when that ' +
      'period opens, on top of the surcharge that period’s own overdue amount earns. Unpaid ' +
      'July at ₱2,575 adds ₱77.25 on 1 August, then August’s own ₱2,500 adds ₱75 on the 10th.',
  },
]

const errorMessage = (err: unknown, fallback: string): string => {
  const response = (err as { response?: { data?: { message?: string } } })?.response
  return response?.data?.message || fallback
}

interface InstallmentRow {
  label: string
  due_month: string
  due_day: string
  grace_days: string
  late_fee: string
}

const emptyInstallment = (): InstallmentRow => ({
  label: '',
  due_month: '8',
  due_day: '31',
  grace_days: '0',
  late_fee: '0',
})

const emptyForm = () => ({
  name: '',
  description: '',
  advance_payment_mode: 'equal_split' as AdvancePaymentMode,
  surcharge_mode: 'per_installment' as SurchargeMode,
  is_active: true,
  installments: [emptyInstallment()],
})

const PaymentPlansView: React.FC = () => {
  const queryClient = useQueryClient()
  const [form, setForm] = useState(emptyForm())
  const [editingPlan, setEditingPlan] = useState<PaymentPlan | null>(null)
  const [error, setError] = useState<string | null>(null)

  const plansQuery = useQuery({
    queryKey: ['payment-plans'],
    queryFn: () => paymentPlanService.getPlans(),
  })

  const plans = plansQuery.data?.data || []

  const resetForm = () => {
    setEditingPlan(null)
    setForm(emptyForm())
    setError(null)
  }

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['payment-plans'] })
    // Pickers elsewhere read the active plan list.
    queryClient.invalidateQueries({ queryKey: ['active-payment-plans'] })
    // A plan's installments drive every student schedule built from it, so cached
    // ledgers and notices would otherwise keep showing the pre-edit breakdown.
    queryClient.invalidateQueries({ queryKey: ['student-ledger'] })
    queryClient.invalidateQueries({ queryKey: ['cashier-ledger'] })
    queryClient.invalidateQueries({ queryKey: ['student-noa'] })
  }

  const createMutation = useMutation({
    mutationFn: (payload: CreatePaymentPlanData) => paymentPlanService.createPlan(payload),
    onSuccess: () => {
      invalidate()
      resetForm()
      toast.success('Payment plan created.')
    },
    onError: (err: unknown) => {
      const message = errorMessage(err, 'Failed to create payment plan.')
      setError(message)
      toast.error(message)
    },
  })

  const updateMutation = useMutation({
    mutationFn: (payload: { id: string; data: CreatePaymentPlanData }) =>
      paymentPlanService.updatePlan(payload.id, payload.data),
    onSuccess: () => {
      invalidate()
      resetForm()
      toast.success('Payment plan updated.')
    },
    onError: (err: unknown) => {
      const message = errorMessage(err, 'Failed to update payment plan.')
      setError(message)
      toast.error(message)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => paymentPlanService.deletePlan(id),
    onSuccess: () => {
      invalidate()
      toast.success('Payment plan deleted.')
    },
    onError: (err: unknown) => {
      toast.error(errorMessage(err, 'Failed to delete payment plan.'))
    },
  })

  const toggleActiveMutation = useMutation({
    mutationFn: (plan: PaymentPlan) =>
      paymentPlanService.updatePlan(plan.id, {
        name: plan.name,
        description: plan.description,
        // Carried through, otherwise a disable/enable would silently reset the plan
        // to the default split and change every student's installment amounts — or
        // to the default surcharge rule and change what they owe on an overdue one.
        advance_payment_mode: plan.advance_payment_mode ?? 'equal_split',
        surcharge_mode: plan.surcharge_mode ?? 'per_installment',
        is_active: !plan.is_active,
        sort_order: plan.sort_order,
        installments: plan.installments.map((inst) => ({
          label: inst.label,
          due_month: inst.due_month,
          due_day: inst.due_day,
          grace_period_days: inst.grace_period_days ?? 0,
          late_fee_percentage: inst.late_fee_percentage ?? 0,
          share_percentage: inst.share_percentage ?? null,
        })),
      }),
    onSuccess: (_data, plan) => {
      invalidate()
      toast.success(plan.is_active ? 'Plan disabled.' : 'Plan enabled.')
    },
    onError: (err: unknown) => {
      toast.error(errorMessage(err, 'Failed to update plan status.'))
    },
  })

  const isSaving = createMutation.isPending || updateMutation.isPending

  const handleEdit = (plan: PaymentPlan) => {
    setEditingPlan(plan)
    setError(null)
    setForm({
      name: plan.name,
      description: plan.description || '',
      advance_payment_mode: plan.advance_payment_mode ?? 'equal_split',
      surcharge_mode: plan.surcharge_mode ?? 'per_installment',
      is_active: plan.is_active,
      installments: plan.installments.length
        ? plan.installments.map((inst) => ({
            label: inst.label || '',
            due_month: String(inst.due_month),
            due_day: String(inst.due_day),
            grace_days: String(inst.grace_period_days ?? 0),
            late_fee: String(inst.late_fee_percentage ?? 0),
          }))
        : [emptyInstallment()],
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleDelete = (plan: PaymentPlan) => {
    if (window.confirm(`Delete "${plan.name}"? Plans already chosen by students cannot be deleted — disable them instead.`)) {
      deleteMutation.mutate(plan.id)
    }
  }

  const patchInstallment = (index: number, patch: Partial<InstallmentRow>) => {
    setForm((prev) => ({
      ...prev,
      installments: prev.installments.map((inst, i) =>
        i === index ? { ...inst, ...patch } : inst
      ),
    }))
  }

  const updateInstallment = (index: number, field: keyof InstallmentRow, value: string) => {
    patchInstallment(index, { [field]: value })
  }

  const addInstallment = () => {
    setForm((prev) => ({ ...prev, installments: [...prev.installments, emptyInstallment()] }))
  }

  const removeInstallment = (index: number) => {
    setForm((prev) => ({
      ...prev,
      installments: prev.installments.filter((_, i) => i !== index),
    }))
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)

    if (!form.name.trim()) {
      setError('Plan name is required.')
      return
    }
    if (!form.installments.length) {
      setError('Add at least one installment.')
      return
    }

    for (const [i, inst] of form.installments.entries()) {
      const day = Number(inst.due_day)
      if (!inst.due_month) {
        setError(`Installment ${i + 1}: select a due month.`)
        return
      }
      if (!day || day < 1 || day > 31) {
        setError(`Installment ${i + 1}: pick a due date.`)
        return
      }
      const grace = Number(inst.grace_days)
      if (Number.isNaN(grace) || grace < 0) {
        setError(`Installment ${i + 1}: grace period must be 0 or more days.`)
        return
      }
      const lateFee = Number(inst.late_fee)
      if (Number.isNaN(lateFee) || lateFee < 0 || lateFee > 100) {
        setError(`Installment ${i + 1}: late fee must be between 0 and 100%.`)
        return
      }
    }

    const payload: CreatePaymentPlanData = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      advance_payment_mode: form.advance_payment_mode,
      surcharge_mode: form.surcharge_mode,
      is_active: form.is_active,
      installments: form.installments.map((inst) => ({
        label: inst.label.trim() || null,
        due_month: Number(inst.due_month),
        due_day: Number(inst.due_day),
        grace_period_days: Number(inst.grace_days) || 0,
        late_fee_percentage: Number(inst.late_fee) || 0,
      })),
    }

    if (editingPlan) {
      updateMutation.mutate({ id: editingPlan.id, data: payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-6"
    >
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Payment Plans</h1>
        <p className="text-gray-600 mt-1">
          Define the payment plans students can choose (e.g. Monthly, Quarterly, 3 Terms). Set each
          installment's label and due date. Disable a plan to hide it from new selections without
          affecting students already on it.
        </p>
      </div>

      {/* Add / Edit form */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-base font-semibold text-gray-900 mb-4">
          {editingPlan ? `Edit "${editingPlan.name}"` : 'Create payment plan'}
        </h3>
        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Plan Name"
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="e.g. 3 Terms"
              disabled={isSaving}
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
              <Select
                value={form.is_active ? 'active' : 'inactive'}
                onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.value === 'active' }))}
                options={[
                  { value: 'active', label: 'Active' },
                  { value: 'inactive', label: 'Inactive' },
                ]}
                className="w-full"
                disabled={isSaving}
              />
            </div>
          </div>

          <Input
            label="Description"
            value={form.description}
            onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
            placeholder="Optional description shown to students"
            disabled={isSaving}
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Payments made before the schedule starts
            </label>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {ADVANCE_MODE_OPTIONS.map((option) => {
                const selected = form.advance_payment_mode === option.value
                return (
                  <label
                    key={option.value}
                    className={`flex gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                      selected
                        ? 'border-primary-400 bg-primary-50/50 ring-1 ring-primary-200'
                        : 'border-gray-200 bg-gray-50/50 hover:border-gray-300'
                    } ${isSaving ? 'opacity-60 cursor-not-allowed' : ''}`}
                  >
                    <input
                      type="radio"
                      name="advance_payment_mode"
                      className="mt-0.5 h-4 w-4 shrink-0 text-primary-600 focus:ring-primary-500"
                      value={option.value}
                      checked={selected}
                      onChange={() =>
                        setForm((prev) => ({ ...prev, advance_payment_mode: option.value }))
                      }
                      disabled={isSaving}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-gray-900">{option.label}</span>
                      <span className="block text-xs text-gray-500 mt-1">{option.hint}</span>
                    </span>
                  </label>
                )
              })}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Late fees on an installment that stays unpaid
            </label>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              {SURCHARGE_MODE_OPTIONS.map((option) => {
                const selected = form.surcharge_mode === option.value
                return (
                  <label
                    key={option.value}
                    className={`flex gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                      selected
                        ? 'border-primary-400 bg-primary-50/50 ring-1 ring-primary-200'
                        : 'border-gray-200 bg-gray-50/50 hover:border-gray-300'
                    } ${isSaving ? 'opacity-60 cursor-not-allowed' : ''}`}
                  >
                    <input
                      type="radio"
                      name="surcharge_mode"
                      className="mt-0.5 h-4 w-4 shrink-0 text-primary-600 focus:ring-primary-500"
                      value={option.value}
                      checked={selected}
                      onChange={() =>
                        setForm((prev) => ({ ...prev, surcharge_mode: option.value }))
                      }
                      disabled={isSaving}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-gray-900">{option.label}</span>
                      <span className="block text-xs text-gray-500 mt-1">{option.hint}</span>
                    </span>
                  </label>
                )
              })}
            </div>
            {form.surcharge_mode === 'running_total' && (
              <p className="mt-2 text-xs text-gray-500">
                Students are charged no more than they would be under the first option — the
                schedule simply states the arrears as one figure to settle. A period that has
                been paid drops out of the total, so a student who missed June and August but
                paid July is asked for June + August + September and nothing else.
              </p>
            )}
            {form.surcharge_mode === 'carry_over' && (
              <p className="mt-2 text-xs text-gray-500">
                Each period uses its own late fee percentage for both charges, and a period set
                to 0% is skipped in both directions. Nothing is carried past the last
                installment — the balance stops compounding once the schedule ends.
              </p>
            )}
            {!form.installments.some((inst) => Number(inst.late_fee) > 0) && (
              <p className="mt-2 text-xs text-gray-500">
                {form.surcharge_mode === 'running_total'
                  ? 'No installment below charges a late fee yet, so the running balance accumulates unpaid principal only.'
                  : 'No installment below charges a late fee yet, so this setting has no effect.'}
              </p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">
                Installments
                <span className="ml-2 text-xs font-normal text-gray-500">
                  {form.advance_payment_mode === 'net_of_downpayment'
                    ? 'Net charges less any downpayment are split evenly across these installments.'
                    : 'Net charges are split evenly across these installments.'}
                </span>
              </label>
              <Button type="button" variant="outline" size="sm" onClick={addInstallment} disabled={isSaving}>
                <PlusIcon className="w-4 h-4 mr-1" /> Add installment
              </Button>
            </div>

            <div className="space-y-3">
              {form.installments.map((inst, index) => (
                <div
                  key={index}
                  className="grid grid-cols-1 sm:grid-cols-[2.5rem_1fr_1fr_6rem_6rem_2.5rem] gap-3 items-end rounded-lg border border-gray-200 p-3 bg-gray-50/50"
                >
                  <div className="text-sm font-semibold text-gray-500 sm:pb-2.5">#{index + 1}</div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Label (optional)</label>
                    <Input
                      value={inst.label}
                      onChange={(e) => updateInstallment(index, 'label', e.target.value)}
                      placeholder={`e.g. Term ${index + 1}`}
                      disabled={isSaving}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Due Date</label>
                    <MonthDayPicker
                      month={Number(inst.due_month) || 0}
                      day={Number(inst.due_day) || 0}
                      onChange={({ month, day }) =>
                        patchInstallment(index, { due_month: String(month), due_day: String(day) })
                      }
                      disabled={isSaving}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Grace (days)</label>
                    <Input
                      type="number"
                      min="0"
                      max="365"
                      value={inst.grace_days}
                      onChange={(e) => updateInstallment(index, 'grace_days', e.target.value)}
                      disabled={isSaving}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Late fee (%)</label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={inst.late_fee}
                      onChange={(e) => updateInstallment(index, 'late_fee', e.target.value)}
                      disabled={isSaving}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeInstallment(index)}
                    disabled={isSaving || form.installments.length <= 1}
                    title="Remove installment"
                    className="inline-flex items-center justify-center h-9 w-9 rounded-lg border border-gray-200 text-gray-400 hover:text-red-600 hover:border-red-200 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <XMarkIcon className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-gray-500">
              Due dates repeat every school year, so only a month and day are needed — the year is
              applied automatically (August–December fall in the start year, January–July in the
              following year). Grace days are how long after the due date before the late fee applies; the
              late fee is a one-time charge of that percent of the installment, added to the
              student's balance while the installment stays unpaid.
            </p>

            {/* A plan left at 0% silently never surcharges anyone, and nothing downstream
                reports it — the omission only surfaces when finance asks why a late payment
                went uncharged. Say so here, while it is still being edited. */}
            {!form.installments.some((inst) => Number(inst.late_fee) > 0) && (
              <div className="mt-3 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <ExclamationTriangleIcon className="w-5 h-5 shrink-0 text-amber-600" />
                <p className="text-xs text-amber-800">
                  <span className="font-medium">No late fee is set on any installment.</span>{' '}
                  Students on this plan will never be charged a surcharge, however late they pay.
                  Leave it at 0% only if that is intended.
                </p>
              </div>
            )}
          </div>

          {error && (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          )}

          <div className="flex flex-wrap gap-3">
            <Button type="submit" loading={isSaving} className="bg-primary-600 hover:bg-primary-700 text-white">
              {editingPlan
                ? isSaving
                  ? 'Updating…'
                  : 'Update plan'
                : isSaving
                  ? 'Creating…'
                  : 'Create plan'}
            </Button>
            {editingPlan && (
              <Button type="button" variant="outline" disabled={isSaving} onClick={resetForm}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      </div>

      {/* Plans list */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50/50">
          <h3 className="text-base font-semibold text-gray-900">Existing plans</h3>
        </div>
        {plansQuery.isLoading ? (
          <div className="p-8 text-center text-gray-500">Loading plans…</div>
        ) : !plans.length ? (
          <div className="py-12 text-center">
            <p className="text-gray-500">No payment plans yet.</p>
            <p className="text-sm text-gray-400 mt-1">Use the form above to create your first plan.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {plans.map((plan) => (
              <div key={plan.id} className="p-4 sm:p-5">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-base font-semibold text-gray-900">{plan.name}</h4>
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          plan.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'
                        }`}
                      >
                        {plan.is_active ? 'Active' : 'Inactive'}
                      </span>
                      <span className="inline-flex rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-medium text-primary-700">
                        {plan.installment_count} installment{plan.installment_count === 1 ? '' : 's'}
                      </span>
                      {plan.advance_payment_mode === 'net_of_downpayment' && (
                        <span
                          className="inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800"
                          title="Payments received before the first installment's month are deducted from the amount being divided."
                        >
                          Net of downpayment
                        </span>
                      )}
                      {plan.surcharge_mode === 'running_total' && (
                        <span
                          className="inline-flex rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-medium text-sky-800"
                          title="Each installment is still surcharged only once, but every period is billed with the unpaid balance behind it folded in, so the schedule states the arrears as one running figure."
                        >
                          Running total
                        </span>
                      )}
                      {plan.surcharge_mode === 'carry_over'
                        && plan.installments.some((inst) => Number(inst.late_fee_percentage) > 0) && (
                        <span
                          className="inline-flex rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-medium text-orange-800"
                          title="An unpaid balance rolls into the next period and is surcharged again when it opens, on top of that period's own overdue late fee. Earlier late fees are part of what gets carried, so the charge compounds."
                        >
                          Carried late fees
                        </span>
                      )}
                      {!plan.installments.some((inst) => Number(inst.late_fee_percentage) > 0) && (
                        <span
                          className="inline-flex rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700"
                          title="No installment has a late fee percentage, so students on this plan are never surcharged for paying late."
                        >
                          No late fee
                        </span>
                      )}
                    </div>
                    {plan.description && (
                      <p className="text-sm text-gray-500 mt-1">{plan.description}</p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {plan.installments.map((inst) => (
                        <span
                          key={inst.sequence}
                          className="inline-flex items-center rounded-md bg-gray-100 px-2 py-1 text-xs text-gray-600"
                        >
                          {inst.label || `Installment ${inst.sequence}`} · {monthName(inst.due_month)} {inst.due_day}
                          {inst.grace_period_days ? ` · +${inst.grace_period_days}d grace` : ''}
                          {inst.late_fee_percentage ? ` · ${inst.late_fee_percentage}% late fee` : ''}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggleActiveMutation.mutate(plan)}
                      loading={toggleActiveMutation.isPending && toggleActiveMutation.variables?.id === plan.id}
                    >
                      {plan.is_active ? 'Disable' : 'Enable'}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleEdit(plan)} title="Edit">
                      <PencilSquareIcon className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(plan)}
                      className="text-red-600 border-red-200 hover:bg-red-50"
                      title="Delete"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  )
}

export default PaymentPlansView
