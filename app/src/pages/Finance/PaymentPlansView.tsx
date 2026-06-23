import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PencilSquareIcon, TrashIcon, PlusIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { toast } from 'react-hot-toast'
import { Button } from '../../components/button'
import { Input } from '../../components/input'
import { Select } from '../../components/select'
import { paymentPlanService } from '../../services/paymentPlanService'
import type { CreatePaymentPlanData, PaymentPlan } from '../../types'

const MONTH_OPTIONS = [
  { value: '1', label: 'January' },
  { value: '2', label: 'February' },
  { value: '3', label: 'March' },
  { value: '4', label: 'April' },
  { value: '5', label: 'May' },
  { value: '6', label: 'June' },
  { value: '7', label: 'July' },
  { value: '8', label: 'August' },
  { value: '9', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
]

const monthName = (month: number) =>
  MONTH_OPTIONS.find((option) => option.value === String(month))?.label ?? String(month)

const errorMessage = (err: unknown, fallback: string): string => {
  const response = (err as { response?: { data?: { message?: string } } })?.response
  return response?.data?.message || fallback
}

interface InstallmentRow {
  label: string
  due_month: string
  due_day: string
}

const emptyInstallment = (): InstallmentRow => ({ label: '', due_month: '8', due_day: '31' })

const emptyForm = () => ({
  name: '',
  description: '',
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
        is_active: !plan.is_active,
        sort_order: plan.sort_order,
        installments: plan.installments.map((inst) => ({
          label: inst.label,
          due_month: inst.due_month,
          due_day: inst.due_day,
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
      is_active: plan.is_active,
      installments: plan.installments.length
        ? plan.installments.map((inst) => ({
            label: inst.label || '',
            due_month: String(inst.due_month),
            due_day: String(inst.due_day),
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

  const updateInstallment = (index: number, field: keyof InstallmentRow, value: string) => {
    setForm((prev) => ({
      ...prev,
      installments: prev.installments.map((inst, i) =>
        i === index ? { ...inst, [field]: value } : inst
      ),
    }))
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
        setError(`Installment ${i + 1}: due day must be between 1 and 31.`)
        return
      }
    }

    const payload: CreatePaymentPlanData = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      is_active: form.is_active,
      installments: form.installments.map((inst) => ({
        label: inst.label.trim() || null,
        due_month: Number(inst.due_month),
        due_day: Number(inst.due_day),
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
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">
                Installments
                <span className="ml-2 text-xs font-normal text-gray-500">
                  Net charges are split evenly across these installments.
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
                  className="grid grid-cols-1 sm:grid-cols-[2.5rem_1fr_1fr_5rem_2.5rem] gap-3 items-end rounded-lg border border-gray-200 p-3 bg-gray-50/50"
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
                    <label className="block text-xs font-medium text-gray-500 mb-1">Due Month</label>
                    <Select
                      value={inst.due_month}
                      onChange={(e) => updateInstallment(index, 'due_month', e.target.value)}
                      options={MONTH_OPTIONS}
                      className="w-full"
                      disabled={isSaving}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Due Day</label>
                    <Input
                      type="number"
                      min="1"
                      max="31"
                      value={inst.due_day}
                      onChange={(e) => updateInstallment(index, 'due_day', e.target.value)}
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
              Due dates use the academic year automatically: months August–December fall in the start
              year, January–July in the following year. Day 31 lands on the last day of shorter months.
            </p>
          </div>

          {error && (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          )}

          <div className="flex flex-wrap gap-3">
            <Button type="submit" loading={isSaving} className="bg-indigo-600 hover:bg-indigo-700 text-white">
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
                      <span className="inline-flex rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
                        {plan.installment_count} installment{plan.installment_count === 1 ? '' : 's'}
                      </span>
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
