import React, { useMemo, useState } from 'react'
import { PencilSquareIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { Button } from '../../../components/button'
import { Input } from '../../../components/input'
import { ConfirmationModal } from '../../../components'
import { payrollService } from '../../../services/payrollService'
import type { PayrollDeductionType, SavePayrollDeductionTypeData } from '../../../types'
import { errorMessage, numberOrZero, peso } from './helpers'

const DeductionTypesTab: React.FC = () => {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    default_amount: '',
    has_employer_share: false,
    default_employer_amount: '',
    is_active: true,
  })
  const [formError, setFormError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<PayrollDeductionType | null>(null)

  const typesQuery = useQuery({
    queryKey: ['payroll-deduction-types'],
    queryFn: () => payrollService.getDeductionTypes(),
  })

  const types = useMemo<PayrollDeductionType[]>(() => typesQuery.data?.data || [], [typesQuery.data])

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['payroll-deduction-types'] })
    queryClient.invalidateQueries({ queryKey: ['payroll-compensations'] })
  }

  const saveMutation = useMutation({
    mutationFn: (payload: { id: string | null; data: SavePayrollDeductionTypeData }) =>
      payload.id
        ? payrollService.updateDeductionType(payload.id, payload.data)
        : payrollService.createDeductionType(payload.data),
    onSuccess: (_, payload) => {
      invalidate()
      setShowForm(false)
      toast.success(payload.id ? 'Deduction type updated.' : 'Deduction type added.')
    },
    onError: (err: unknown) => {
      const message = errorMessage(err, 'Failed to save deduction type.')
      setFormError(message)
      toast.error(message)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => payrollService.deleteDeductionType(id),
    onSuccess: () => {
      invalidate()
      setDeleting(null)
      toast.success('Deduction type deleted.')
    },
    onError: (err: unknown) => {
      setDeleting(null)
      toast.error(errorMessage(err, 'Failed to delete deduction type.'))
    },
  })

  const openCreate = () => {
    setForm({
      name: '',
      default_amount: '',
      has_employer_share: false,
      default_employer_amount: '',
      is_active: true,
    })
    setEditingId(null)
    setFormError(null)
    setShowForm(true)
  }

  const openEdit = (type: PayrollDeductionType) => {
    setForm({
      name: type.name,
      default_amount: String(type.default_amount),
      has_employer_share: type.has_employer_share,
      default_employer_amount: String(type.default_employer_amount),
      is_active: type.is_active,
    })
    setEditingId(type.id)
    setFormError(null)
    setShowForm(true)
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    saveMutation.mutate({
      id: editingId,
      data: {
        name: form.name.trim(),
        default_amount: numberOrZero(form.default_amount),
        has_employer_share: form.has_employer_share,
        default_employer_amount: form.has_employer_share
          ? numberOrZero(form.default_employer_amount)
          : 0,
        is_active: form.is_active,
      },
    })
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 p-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Deduction Types</h2>
          <p className="text-sm text-gray-500">
            The deductions your institution uses — e.g. SSS, Pag-IBIG, PhilHealth, Cash Advance.
            The default amount pre-fills new entries; per-employee amounts are set in Employee Rates.
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <PlusIcon className="h-4 w-4" />
          Add Deduction Type
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3 text-right">Default (Employee)</th>
              <th className="px-4 py-3 text-right">Default (Employer)</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {typesQuery.isLoading ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-gray-400">
                  Loading deduction types…
                </td>
              </tr>
            ) : types.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-gray-400">
                  No deduction types yet. Add the ones your school uses — e.g. SSS, Pag-IBIG,
                  PhilHealth, Cash Advance.
                </td>
              </tr>
            ) : (
              types.map((type) => (
                <tr key={type.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-4 py-3 font-medium text-gray-900">{type.name}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {type.default_amount > 0 ? peso(type.default_amount) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {type.has_employer_share ? (
                      type.default_employer_amount > 0 ? (
                        peso(type.default_employer_amount)
                      ) : (
                        <span className="text-xs text-gray-400">shared, no default</span>
                      )
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {type.is_active ? (
                      <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        title="Edit"
                        onClick={() => openEdit(type)}
                        className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                      >
                        <PencilSquareIcon className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        title="Delete"
                        onClick={() => setDeleting(type)}
                        className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setShowForm(false)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-gray-200 px-6 py-4">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingId ? 'Edit Deduction Type' : 'Add Deduction Type'}
              </h3>
            </div>
            <form onSubmit={submit} className="space-y-4 p-6">
              {formError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
                  {formError}
                </div>
              )}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Name</label>
                <Input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. Cash Advance"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Default amount — employee's share (₱)
                </label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.default_amount}
                  onChange={(e) => setForm((prev) => ({ ...prev, default_amount: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.has_employer_share}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, has_employer_share: e.target.checked }))
                  }
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                Shared by employer (adds an employer counterpart, shown under Other Benefits)
              </label>
              {form.has_employer_share && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    Default amount — employer's share (₱)
                  </label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.default_employer_amount}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, default_employer_amount: e.target.value }))
                    }
                    placeholder="0.00"
                  />
                </div>
              )}
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))}
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                Active (available on rates and payslips)
              </label>
              <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
                <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? 'Saving…' : editingId ? 'Save changes' : 'Add type'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmationModal
        isOpen={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
        title="Delete deduction type"
        message={`Delete "${deleting?.name}"? It will be removed from every employee's default deductions. Existing payslips keep their recorded amounts.`}
        confirmText="Delete"
        variant="danger"
        loading={deleteMutation.isPending}
      />
    </div>
  )
}

export default DeductionTypesTab
