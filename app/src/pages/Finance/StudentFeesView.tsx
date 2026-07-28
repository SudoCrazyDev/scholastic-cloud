import React, { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PencilSquareIcon, TrashIcon } from '@heroicons/react/24/outline'
import { toast } from 'react-hot-toast'
import { Button } from '../../components/button'
import { Input } from '../../components/input'
import { Select } from '../../components/select'
import { studentFeeService } from '../../services/studentFeeService'
import type { StudentFee, CreateStudentFeeData } from '../../types'

const emptyForm = {
  name: '',
  amount: '',
  description: '',
  is_active: true,
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)

const StudentFeesView: React.FC = () => {
  const queryClient = useQueryClient()
  const [form, setForm] = useState(emptyForm)
  const [editing, setEditing] = useState<StudentFee | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const feesQuery = useQuery({
    queryKey: ['student-fees'],
    queryFn: () => studentFeeService.getStudentFees(),
  })

  const resetForm = () => {
    setEditing(null)
    setForm(emptyForm)
    setFormError(null)
  }

  const createMutation = useMutation({
    mutationFn: (data: CreateStudentFeeData) => studentFeeService.createStudentFee(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['student-fees'] })
      resetForm()
      toast.success('Student fee saved.')
    },
    onError: (error: any) => {
      const msg = error.response?.data?.message || 'Failed to save student fee.'
      setFormError(msg)
      toast.error(msg)
    },
  })

  const updateMutation = useMutation({
    mutationFn: (payload: { id: string; data: CreateStudentFeeData }) =>
      studentFeeService.updateStudentFee(payload.id, payload.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['student-fees'] })
      resetForm()
      toast.success('Student fee updated.')
    },
    onError: (error: any) => {
      const msg = error.response?.data?.message || 'Failed to update student fee.'
      setFormError(msg)
      toast.error(msg)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => studentFeeService.deleteStudentFee(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['student-fees'] })
      toast.success('Student fee deleted.')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to delete student fee.')
    },
  })

  const isSaving = createMutation.isPending || updateMutation.isPending

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    setFormError(null)

    if (!form.name.trim()) {
      setFormError('Fee name is required.')
      return
    }
    const amount = Number(form.amount)
    if (!amount || amount <= 0) {
      setFormError('Amount must be greater than zero.')
      return
    }

    const data: CreateStudentFeeData = {
      name: form.name.trim(),
      amount,
      description: form.description.trim() || undefined,
      is_active: form.is_active,
    }

    if (editing) {
      updateMutation.mutate({ id: editing.id, data })
    } else {
      createMutation.mutate(data)
    }
  }

  const handleEdit = (fee: StudentFee) => {
    setEditing(fee)
    setForm({
      name: fee.name,
      amount: Number(fee.amount).toString(),
      description: fee.description || '',
      is_active: fee.is_active,
    })
    setFormError(null)
  }

  const handleDelete = (fee: StudentFee) => {
    if (window.confirm(`Delete "${fee.name}"?`)) {
      deleteMutation.mutate(fee.id)
    }
  }

  const fees = feesQuery.data?.data || []
  const visibleFees = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return fees
    return fees.filter(
      (fee) =>
        fee.name.toLowerCase().includes(term) ||
        (fee.description || '').toLowerCase().includes(term)
    )
  }, [fees, search])

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
      <h2 className="text-xl font-semibold text-gray-900 mb-1">Student Fees</h2>
      <p className="text-sm text-gray-500 mb-4">
        Create reusable student fees here so a cashier can search for one on the ledger and add it to
        a student without typing the amount each time.
      </p>

      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Fee Name"
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            placeholder="e.g. Laboratory Fee, Field Trip"
            disabled={isSaving}
          />
          <Input
            label="Amount (PHP)"
            type="number"
            min="0"
            step="0.01"
            value={form.amount}
            onChange={(event) => setForm((prev) => ({ ...prev, amount: event.target.value }))}
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
          <p className="mt-1 text-xs text-gray-500">
            Only active fees appear in the ledger search.
          </p>
        </div>
        {formError && <p className="text-sm text-red-600">{formError}</p>}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" loading={isSaving} className="bg-primary-600 hover:bg-primary-700 text-white">
            {editing
              ? isSaving
                ? 'Updating Fee...'
                : 'Update Fee'
              : isSaving
                ? 'Adding Fee...'
                : 'Add Fee'}
          </Button>
          {editing && (
            <Button type="button" variant="outline" disabled={isSaving} onClick={resetForm}>
              Cancel
            </Button>
          )}
        </div>
      </form>

      <div className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h3 className="text-lg font-medium text-gray-900">Existing Student Fees</h3>
          <div className="w-full sm:w-64">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search student fees..."
            />
          </div>
        </div>
        {feesQuery.isLoading ? (
          <p className="text-gray-500">Loading student fees...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {visibleFees.map((fee) => (
                  <tr key={fee.id} className={editing?.id === fee.id ? 'bg-primary-50/50' : ''}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{fee.name}</div>
                      {fee.description && (
                        <div className="text-sm text-gray-500">{fee.description}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-medium text-gray-900 tabular-nums">
                      {formatCurrency(Number(fee.amount))}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {fee.is_active ? 'Active' : 'Inactive'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => handleEdit(fee)}>
                          <PencilSquareIcon className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(fee)}
                          className="text-red-600 border-red-200 hover:bg-red-50"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!visibleFees.length && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-gray-500">
                      {fees.length ? 'No student fees match your search.' : 'No student fees added yet.'}
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

export default StudentFeesView
