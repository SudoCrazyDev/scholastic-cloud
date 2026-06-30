import React, { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PencilSquareIcon, TrashIcon } from '@heroicons/react/24/outline'
import { toast } from 'react-hot-toast'
import { Button } from '../../components/button'
import { Input } from '../../components/input'
import { Select } from '../../components/select'
import { defaultDiscountService } from '../../services/defaultDiscountService'
import type { DefaultDiscount, CreateDefaultDiscountData } from '../../types'

const emptyForm = {
  name: '',
  discount_type: 'fixed' as 'fixed' | 'percentage',
  value: '',
  description: '',
  is_active: true,
}

const DefaultDiscountsView: React.FC = () => {
  const queryClient = useQueryClient()
  const [form, setForm] = useState(emptyForm)
  const [editing, setEditing] = useState<DefaultDiscount | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const discountsQuery = useQuery({
    queryKey: ['default-discounts'],
    queryFn: () => defaultDiscountService.getDefaultDiscounts(),
  })

  const resetForm = () => {
    setEditing(null)
    setForm(emptyForm)
    setFormError(null)
  }

  const createMutation = useMutation({
    mutationFn: (data: CreateDefaultDiscountData) => defaultDiscountService.createDefaultDiscount(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['default-discounts'] })
      resetForm()
      toast.success('Default discount saved.')
    },
    onError: (error: any) => {
      const msg = error.response?.data?.message || 'Failed to save default discount.'
      setFormError(msg)
      toast.error(msg)
    },
  })

  const updateMutation = useMutation({
    mutationFn: (payload: { id: string; data: CreateDefaultDiscountData }) =>
      defaultDiscountService.updateDefaultDiscount(payload.id, payload.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['default-discounts'] })
      resetForm()
      toast.success('Default discount updated.')
    },
    onError: (error: any) => {
      const msg = error.response?.data?.message || 'Failed to update default discount.'
      setFormError(msg)
      toast.error(msg)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => defaultDiscountService.deleteDefaultDiscount(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['default-discounts'] })
      toast.success('Default discount deleted.')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to delete default discount.')
    },
  })

  const isSaving = createMutation.isPending || updateMutation.isPending

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    setFormError(null)

    if (!form.name.trim()) {
      setFormError('Discount name is required.')
      return
    }
    const value = Number(form.value)
    if (!value || value <= 0) {
      setFormError('Discount value must be greater than zero.')
      return
    }
    if (form.discount_type === 'percentage' && value > 100) {
      setFormError('Percentage discount cannot exceed 100%.')
      return
    }

    const data: CreateDefaultDiscountData = {
      name: form.name.trim(),
      discount_type: form.discount_type,
      value,
      description: form.description.trim() || undefined,
      is_active: form.is_active,
    }

    if (editing) {
      updateMutation.mutate({ id: editing.id, data })
    } else {
      createMutation.mutate(data)
    }
  }

  const handleEdit = (discount: DefaultDiscount) => {
    setEditing(discount)
    setForm({
      name: discount.name,
      discount_type: discount.discount_type,
      value: discount.value.toString(),
      description: discount.description || '',
      is_active: discount.is_active,
    })
    setFormError(null)
  }

  const handleDelete = (discount: DefaultDiscount) => {
    if (window.confirm(`Delete "${discount.name}"?`)) {
      deleteMutation.mutate(discount.id)
    }
  }

  const formatValue = (discount: DefaultDiscount) =>
    discount.discount_type === 'percentage'
      ? `${Number(discount.value)}%`
      : new Intl.NumberFormat('en-PH', {
          style: 'currency',
          currency: 'PHP',
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(Number(discount.value))

  const discounts = discountsQuery.data?.data || []

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
      <h2 className="text-xl font-semibold text-gray-900 mb-1">Default Discounts</h2>
      <p className="text-sm text-gray-500 mb-4">
        Create reusable discounts here so they can be applied to a student from the ledger without
        typing the amount each time.
      </p>

      <form className="space-y-4" onSubmit={handleSubmit}>
        <Input
          label="Discount Name"
          value={form.name}
          onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
          placeholder="e.g. Sibling Discount, Academic Scholarship"
          disabled={isSaving}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Discount Type</label>
            <Select
              value={form.discount_type}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  discount_type: event.target.value as 'fixed' | 'percentage',
                }))
              }
              options={[
                { value: 'fixed', label: 'Fixed Amount' },
                { value: 'percentage', label: 'Percentage' },
              ]}
              className="w-full"
              disabled={isSaving}
            />
          </div>
          <Input
            label={form.discount_type === 'percentage' ? 'Percentage (%)' : 'Amount (PHP)'}
            type="number"
            min="0"
            step="0.01"
            value={form.value}
            onChange={(event) => setForm((prev) => ({ ...prev, value: event.target.value }))}
            placeholder="0.00"
            disabled={isSaving}
          />
        </div>
        <Input
          label="Description"
          value={form.description}
          onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
          placeholder="Optional notes"
          disabled={isSaving}
        />
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
          <Select
            value={form.is_active ? 'active' : 'inactive'}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, is_active: event.target.value === 'active' }))
            }
            options={[
              { value: 'active', label: 'Active' },
              { value: 'inactive', label: 'Inactive' },
            ]}
            className="w-full"
            disabled={isSaving}
          />
        </div>
        {formError && <p className="text-sm text-red-600">{formError}</p>}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" loading={isSaving} className="bg-indigo-600 hover:bg-indigo-700 text-white">
            {editing
              ? isSaving
                ? 'Updating Discount...'
                : 'Update Discount'
              : isSaving
                ? 'Adding Discount...'
                : 'Add Discount'}
          </Button>
          {editing && (
            <Button type="button" variant="outline" disabled={isSaving} onClick={resetForm}>
              Cancel
            </Button>
          )}
        </div>
      </form>

      <div className="mt-6">
        <h3 className="text-lg font-medium text-gray-900 mb-3">Existing Default Discounts</h3>
        {discountsQuery.isLoading ? (
          <p className="text-gray-500">Loading default discounts...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Value</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {discounts.map((discount) => (
                  <tr key={discount.id} className={editing?.id === discount.id ? 'bg-indigo-50/50' : ''}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{discount.name}</div>
                      {discount.description && (
                        <div className="text-sm text-gray-500">{discount.description}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 capitalize">{discount.discount_type}</td>
                    <td className="px-4 py-3 text-sm text-right font-medium text-gray-900 tabular-nums">
                      {formatValue(discount)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {discount.is_active ? 'Active' : 'Inactive'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => handleEdit(discount)}>
                          <PencilSquareIcon className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(discount)}
                          className="text-red-600 border-red-200 hover:bg-red-50"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!discounts.length && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                      No default discounts added yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

export default DefaultDiscountsView
