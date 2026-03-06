import React, { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { TrashIcon } from '@heroicons/react/24/outline'
import { toast } from 'react-hot-toast'
import { Button } from '../../components/button'
import { Input } from '../../components/input'
import { Select } from '../../components/select'
import { gradeLevelDiscountService } from '../../services/gradeLevelDiscountService'
import type { SchoolFee, CreateGradeLevelDiscountData } from '../../types'

interface DiscountsViewProps {
  academicYearOptions: { value: string; label: string }[]
  defaultAcademicYear: string
  gradeLevelOptions: { value: string; label: string }[]
  fees: SchoolFee[]
}

const DiscountsView: React.FC<DiscountsViewProps> = ({
  academicYearOptions,
  defaultAcademicYear,
  gradeLevelOptions,
  fees,
}) => {
  const queryClient = useQueryClient()
  const [filters, setFilters] = useState({
    academic_year: defaultAcademicYear,
    grade_level: '',
  })
  const [form, setForm] = useState<CreateGradeLevelDiscountData>({
    grade_level: '',
    academic_year: defaultAcademicYear,
    discount_type: 'fixed',
    value: 0,
    school_fee_id: '',
    description: '',
  })
  const [formError, setFormError] = useState<string | null>(null)

  const discountsQuery = useQuery({
    queryKey: ['grade-level-discounts', filters],
    queryFn: () =>
      gradeLevelDiscountService.getDiscounts({
        academic_year: filters.academic_year || undefined,
        grade_level: filters.grade_level || undefined,
      }),
  })

  const createMutation = useMutation({
    mutationFn: (data: CreateGradeLevelDiscountData) => gradeLevelDiscountService.createDiscount(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['grade-level-discounts'] })
      setForm((prev) => ({ ...prev, value: 0, school_fee_id: '', description: '' }))
      setFormError(null)
      toast.success('Grade-level discount added.')
    },
    onError: (error: { response?: { data?: { message?: string } } }) => {
      const msg = error.response?.data?.message || 'Failed to create discount.'
      setFormError(msg)
      toast.error(msg)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => gradeLevelDiscountService.deleteDiscount(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['grade-level-discounts'] })
      toast.success('Discount removed.')
    },
    onError: (error: { response?: { data?: { message?: string } } }) => {
      toast.error(error.response?.data?.message || 'Failed to delete.')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    if (!form.grade_level) {
      setFormError('Please select a grade level.')
      return
    }
    if (!form.value || Number(form.value) <= 0) {
      setFormError('Value must be greater than zero.')
      return
    }
    if (form.discount_type === 'percentage' && Number(form.value) > 100) {
      setFormError('Percentage cannot exceed 100%.')
      return
    }
    createMutation.mutate({
      ...form,
      value: Number(form.value),
      school_fee_id: form.school_fee_id || undefined,
      description: form.description || undefined,
    })
  }

  const discounts = discountsQuery.data?.data || []

  const filterGradeOptions = useMemo(
    () => [{ value: '', label: 'All grades' }, ...gradeLevelOptions],
    [gradeLevelOptions]
  )

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2,
    }).format(amount)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Grade-Level Discounts</h2>
        <p className="text-sm text-gray-600">
          Manage discounts that apply to all students in a specific grade level. Per-student discounts
          can be applied from the student&apos;s finance tab.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-4 rounded-lg border border-gray-200 bg-gray-50/50 px-4 py-3">
        <div className="min-w-[140px]">
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
            Grade level
          </label>
          <Select
            value={filters.grade_level}
            onChange={(e) => setFilters((prev) => ({ ...prev, grade_level: e.target.value }))}
            options={filterGradeOptions}
            className="w-full"
          />
        </div>
        <div className="min-w-[140px]">
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
            Academic year
          </label>
          <Select
            value={filters.academic_year}
            onChange={(e) => setFilters((prev) => ({ ...prev, academic_year: e.target.value }))}
            options={academicYearOptions}
            className="w-full"
          />
        </div>
        <p className="text-sm text-gray-500 ml-auto self-center">
          {discountsQuery.isLoading
            ? 'Loading...'
            : `${discounts.length} discount${discounts.length === 1 ? '' : 's'}`}
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-base font-semibold text-gray-900 mb-4">Add Grade-Level Discount</h3>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Grade Level</label>
              <Select
                value={form.grade_level}
                onChange={(e) => setForm((prev) => ({ ...prev, grade_level: e.target.value }))}
                options={gradeLevelOptions}
                placeholder="Select grade"
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Academic Year</label>
              <Select
                value={form.academic_year}
                onChange={(e) => setForm((prev) => ({ ...prev, academic_year: e.target.value }))}
                options={academicYearOptions}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Discount Type</label>
              <Select
                value={form.discount_type}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    discount_type: e.target.value as 'fixed' | 'percentage',
                  }))
                }
                options={[
                  { value: 'fixed', label: 'Fixed Amount (PHP)' },
                  { value: 'percentage', label: 'Percentage (%)' },
                ]}
                className="w-full"
              />
            </div>
            <div>
              <Input
                label={form.discount_type === 'percentage' ? 'Percentage (%)' : 'Amount (PHP)'}
                type="number"
                min="0"
                step="0.01"
                value={form.value || ''}
                onChange={(e) => setForm((prev) => ({ ...prev, value: Number(e.target.value) }))}
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Apply to Fee (optional)
              </label>
              <Select
                value={form.school_fee_id || ''}
                onChange={(e) => setForm((prev) => ({ ...prev, school_fee_id: e.target.value }))}
                options={[
                  { value: '', label: '— All fees' },
                  ...fees.map((f) => ({ value: f.id, label: f.name })),
                ]}
                className="w-full"
              />
            </div>
            <div>
              <Input
                label="Description (optional)"
                value={form.description || ''}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="e.g. Early bird discount"
              />
            </div>
          </div>
          {formError && <p className="text-sm text-red-600">{formError}</p>}
          <Button
            type="submit"
            loading={createMutation.isPending}
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            {createMutation.isPending ? 'Saving...' : 'Add Discount'}
          </Button>
        </form>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50/50">
          <h3 className="text-base font-semibold text-gray-900">Existing Grade-Level Discounts</h3>
        </div>
        {discountsQuery.isLoading ? (
          <div className="p-8 text-center text-gray-500">Loading...</div>
        ) : !discounts.length ? (
          <div className="py-12 text-center">
            <p className="text-gray-500">No grade-level discounts for the selected filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Grade</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Year</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Value</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fee</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase w-20">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {discounts.map((d) => (
                  <tr key={d.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{d.grade_level}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{d.academic_year}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 capitalize">{d.discount_type}</td>
                    <td className="px-4 py-3 text-sm text-right font-medium text-gray-900 tabular-nums">
                      {d.discount_type === 'percentage'
                        ? `${Number(d.value).toFixed(2)}%`
                        : formatCurrency(Number(d.value))}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {d.school_fee?.name || 'All fees'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{d.description || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (window.confirm('Delete this grade-level discount?')) {
                              deleteMutation.mutate(d.id)
                            }
                          }}
                          className="text-red-600 border-red-200 hover:bg-red-50"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

export default DiscountsView
