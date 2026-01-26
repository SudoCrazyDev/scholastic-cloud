import React, { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PencilSquareIcon, TrashIcon } from '@heroicons/react/24/outline'
import { Button } from '../../components/button'
import { Input } from '../../components/input'
import { Select } from '../../components/select'
import { schoolFeeService } from '../../services/schoolFeeService'
import { schoolFeeDefaultService } from '../../services/schoolFeeDefaultService'
import { financeDashboardService } from '../../services/financeDashboardService'
import type { SchoolFee, SchoolFeeDefault } from '../../types'

const Finance: React.FC = () => {
  const queryClient = useQueryClient()
  const currentYear = new Date().getFullYear()
  const defaultAcademicYear = `${currentYear}-${currentYear + 1}`

  const [feeForm, setFeeForm] = useState({
    name: '',
    description: '',
    is_active: true,
  })
  const [editingFee, setEditingFee] = useState<SchoolFee | null>(null)
  const [feeError, setFeeError] = useState<string | null>(null)

  const [defaultForm, setDefaultForm] = useState({
    school_fee_id: '',
    grade_level: '',
    academic_year: defaultAcademicYear,
    amount: '',
  })
  const [editingDefault, setEditingDefault] = useState<SchoolFeeDefault | null>(null)
  const [defaultError, setDefaultError] = useState<string | null>(null)
  const [filters, setFilters] = useState({
    grade_level: '',
    academic_year: defaultAcademicYear,
  })
  const [dashboardYear, setDashboardYear] = useState(defaultAcademicYear)

  const academicYearOptions = useMemo(() => {
    const years = []
    for (let offset = 0; offset < 6; offset += 1) {
      const start = currentYear - offset
      const yearLabel = `${start}-${start + 1}`
      years.push({ value: yearLabel, label: yearLabel })
    }
    return years
  }, [currentYear])

  const feesQuery = useQuery({
    queryKey: ['school-fees'],
    queryFn: () => schoolFeeService.getSchoolFees(),
  })

  const dashboardQuery = useQuery({
    queryKey: ['finance-dashboard', dashboardYear],
    queryFn: () => financeDashboardService.getSummary(dashboardYear),
    enabled: Boolean(dashboardYear),
  })

  const defaultsQuery = useQuery({
    queryKey: ['school-fee-defaults', filters],
    queryFn: () =>
      schoolFeeDefaultService.getDefaults({
        academic_year: filters.academic_year || undefined,
        grade_level: filters.grade_level || undefined,
      }),
  })

  const createFeeMutation = useMutation({
    mutationFn: () => schoolFeeService.createSchoolFee(feeForm),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['school-fees'] })
      setFeeForm({ name: '', description: '', is_active: true })
      setFeeError(null)
    },
    onError: (error: any) => {
      setFeeError(error.response?.data?.message || 'Failed to save school fee.')
    },
  })

  const updateFeeMutation = useMutation({
    mutationFn: (payload: { id: string; data: typeof feeForm }) =>
      schoolFeeService.updateSchoolFee(payload.id, payload.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['school-fees'] })
      setEditingFee(null)
      setFeeForm({ name: '', description: '', is_active: true })
      setFeeError(null)
    },
    onError: (error: any) => {
      setFeeError(error.response?.data?.message || 'Failed to update school fee.')
    },
  })

  const deleteFeeMutation = useMutation({
    mutationFn: (id: string) => schoolFeeService.deleteSchoolFee(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['school-fees'] })
    },
  })

  const upsertDefaultMutation = useMutation({
    mutationFn: () =>
      schoolFeeDefaultService.upsertDefault({
        school_fee_id: defaultForm.school_fee_id,
        grade_level: defaultForm.grade_level,
        academic_year: defaultForm.academic_year,
        amount: Number(defaultForm.amount),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['school-fee-defaults'] })
      setDefaultForm({
        school_fee_id: '',
        grade_level: defaultForm.grade_level,
        academic_year: defaultForm.academic_year,
        amount: '',
      })
      setDefaultError(null)
    },
    onError: (error: any) => {
      setDefaultError(error.response?.data?.message || 'Failed to save default amount.')
    },
  })

  const updateDefaultMutation = useMutation({
    mutationFn: (payload: { id: string; amount: string }) =>
      schoolFeeDefaultService.updateDefault(payload.id, { amount: Number(payload.amount) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['school-fee-defaults'] })
      setEditingDefault(null)
      setDefaultForm({
        school_fee_id: '',
        grade_level: filters.grade_level,
        academic_year: filters.academic_year,
        amount: '',
      })
      setDefaultError(null)
    },
    onError: (error: any) => {
      setDefaultError(error.response?.data?.message || 'Failed to update default amount.')
    },
  })

  const deleteDefaultMutation = useMutation({
    mutationFn: (id: string) => schoolFeeDefaultService.deleteDefault(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['school-fee-defaults'] })
    },
  })

  const fees = feesQuery.data?.data || []
  const defaults = defaultsQuery.data?.data || []
  const dashboardData = dashboardQuery.data?.data
  const dashboardFees = dashboardData?.fees || []
  const gradeSummaries = dashboardData?.grades || []
  const hasUnassignedPayments = gradeSummaries.some(
    (grade) => (grade.payments?.unassigned || 0) > 0
  )

  useEffect(() => {
    if (!editingDefault) {
      setDefaultForm(prev => ({
        ...prev,
        grade_level: filters.grade_level,
        academic_year: filters.academic_year,
      }))
    }
  }, [editingDefault, filters.academic_year, filters.grade_level])

  const handleFeeSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!feeForm.name.trim()) {
      setFeeError('Fee name is required.')
      return
    }

    if (editingFee) {
      updateFeeMutation.mutate({ id: editingFee.id, data: feeForm })
    } else {
      createFeeMutation.mutate()
    }
  }

  const formatAmount = (amount?: number | null) => {
    const value = Number(amount || 0)
    return value.toFixed(2)
  }

  const handleDefaultSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!defaultForm.school_fee_id) {
      setDefaultError('Please select a fee.')
      return
    }
    if (!defaultForm.grade_level.trim()) {
      setDefaultError('Grade level is required.')
      return
    }
    if (!defaultForm.academic_year.trim()) {
      setDefaultError('Academic year is required.')
      return
    }
    if (!defaultForm.amount || Number(defaultForm.amount) < 0) {
      setDefaultError('Amount must be zero or more.')
      return
    }

    if (editingDefault) {
      updateDefaultMutation.mutate({ id: editingDefault.id, amount: defaultForm.amount })
    } else {
      upsertDefaultMutation.mutate()
    }
  }

  const handleEditFee = (fee: SchoolFee) => {
    setEditingFee(fee)
    setFeeForm({
      name: fee.name,
      description: fee.description || '',
      is_active: fee.is_active,
    })
    setFeeError(null)
  }

  const handleDeleteFee = (fee: SchoolFee) => {
    if (window.confirm(`Delete "${fee.name}"? This will also remove its defaults.`)) {
      deleteFeeMutation.mutate(fee.id)
    }
  }

  const handleEditDefault = (feeDefault: SchoolFeeDefault) => {
    setEditingDefault(feeDefault)
    setDefaultForm({
      school_fee_id: feeDefault.school_fee_id,
      grade_level: feeDefault.grade_level,
      academic_year: feeDefault.academic_year,
      amount: feeDefault.amount.toString(),
    })
    setDefaultError(null)
  }

  const handleDeleteDefault = (feeDefault: SchoolFeeDefault) => {
    if (window.confirm('Delete this default amount?')) {
      deleteDefaultMutation.mutate(feeDefault.id)
    }
  }

  const resetDefaultForm = () => {
    setEditingDefault(null)
    setDefaultForm({
      school_fee_id: '',
      grade_level: filters.grade_level,
      academic_year: filters.academic_year,
      amount: '',
    })
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-8"
    >
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Finance</h1>
        <p className="text-gray-600 mt-1">Manage school fees, defaults, and yearly amounts.</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Finance Dashboard</h2>
            <p className="text-sm text-gray-600">
              Total Payable shows collectibles for the selected academic year.
            </p>
          </div>
          <div className="w-full lg:w-64">
            <Select
              value={dashboardYear}
              onChange={(event) => setDashboardYear(event.target.value)}
              options={academicYearOptions}
              className="w-full"
            />
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">Total Payable</h3>
          {dashboardQuery.isLoading ? (
            <p className="text-gray-500">Loading dashboard...</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Grade Level
                    </th>
                    {dashboardFees.map((fee) => (
                      <th
                        key={fee.id}
                        className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase"
                      >
                        {fee.name}
                      </th>
                    ))}
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {gradeSummaries.map((grade) => (
                    <tr key={grade.grade_level}>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {grade.grade_level}
                      </td>
                      {dashboardFees.map((fee) => (
                        <td key={fee.id} className="px-4 py-3 text-sm text-right text-gray-900">
                          {formatAmount(grade.payable.by_fee?.[fee.id])}
                        </td>
                      ))}
                      <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900">
                        {formatAmount(grade.payable.total)}
                      </td>
                    </tr>
                  ))}
                  {!gradeSummaries.length && (
                    <tr>
                      <td
                        colSpan={dashboardFees.length + 2}
                        className="px-4 py-6 text-center text-gray-500"
                      >
                        No payable data found for this academic year.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-gray-500">
            Totals include discounts and balance forward adjustments.
          </p>
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">Total Payment</h3>
          {dashboardQuery.isLoading ? (
            <p className="text-gray-500">Loading dashboard...</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Grade Level
                    </th>
                    {dashboardFees.map((fee) => (
                      <th
                        key={fee.id}
                        className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase"
                      >
                        {fee.name}
                      </th>
                    ))}
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {gradeSummaries.map((grade) => (
                    <tr key={grade.grade_level}>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {grade.grade_level}
                      </td>
                      {dashboardFees.map((fee) => (
                        <td key={fee.id} className="px-4 py-3 text-sm text-right text-gray-900">
                          {formatAmount(grade.payments.by_fee?.[fee.id])}
                        </td>
                      ))}
                      <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900">
                        {formatAmount(grade.payments.total)}
                      </td>
                    </tr>
                  ))}
                  {!gradeSummaries.length && (
                    <tr>
                      <td
                        colSpan={dashboardFees.length + 2}
                        className="px-4 py-6 text-center text-gray-500"
                      >
                        No payment data found for this academic year.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          {hasUnassignedPayments && (
            <p className="text-xs text-gray-500">
              Totals include payments not tied to a specific fee.
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">School Fees</h2>
          <form className="space-y-4" onSubmit={handleFeeSubmit}>
            <Input
              label="Fee Name"
              value={feeForm.name}
              onChange={(event) => setFeeForm(prev => ({ ...prev, name: event.target.value }))}
              placeholder="e.g. Tuition Fee"
            />
            <Input
              label="Description"
              value={feeForm.description}
              onChange={(event) => setFeeForm(prev => ({ ...prev, description: event.target.value }))}
              placeholder="Optional notes"
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
              <Select
                value={feeForm.is_active ? 'active' : 'inactive'}
                onChange={(event) =>
                  setFeeForm(prev => ({ ...prev, is_active: event.target.value === 'active' }))
                }
                options={[
                  { value: 'active', label: 'Active' },
                  { value: 'inactive', label: 'Inactive' },
                ]}
                className="w-full"
              />
            </div>
            {feeError && <p className="text-sm text-red-600">{feeError}</p>}
            <div className="flex flex-wrap gap-3">
              <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white">
                {editingFee ? 'Update Fee' : 'Add Fee'}
              </Button>
              {editingFee && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditingFee(null)
                    setFeeForm({ name: '', description: '', is_active: true })
                    setFeeError(null)
                  }}
                >
                  Cancel
                </Button>
              )}
            </div>
          </form>

          <div className="mt-6">
            <h3 className="text-lg font-medium text-gray-900 mb-3">Existing Fees</h3>
            {feesQuery.isLoading ? (
              <p className="text-gray-500">Loading fees...</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {fees.map((fee) => (
                      <tr key={fee.id}>
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">{fee.name}</div>
                          {fee.description && (
                            <div className="text-sm text-gray-500">{fee.description}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {fee.is_active ? 'Active' : 'Inactive'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEditFee(fee)}
                            >
                              <PencilSquareIcon className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDeleteFee(fee)}
                              className="text-red-600 border-red-200 hover:bg-red-50"
                            >
                              <TrashIcon className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!fees.length && (
                      <tr>
                        <td colSpan={3} className="px-4 py-6 text-center text-gray-500">
                          No fees added yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Default Amounts</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <Input
              label="Filter Grade Level"
              value={filters.grade_level}
              onChange={(event) => setFilters(prev => ({ ...prev, grade_level: event.target.value }))}
              placeholder="e.g. Grade 1"
            />
            <Select
              value={filters.academic_year}
              onChange={(event) => setFilters(prev => ({ ...prev, academic_year: event.target.value }))}
              options={academicYearOptions}
              className="w-full"
            />
          </div>

          <form className="space-y-4" onSubmit={handleDefaultSubmit}>
            <Select
              value={defaultForm.school_fee_id}
              onChange={(event) => setDefaultForm(prev => ({ ...prev, school_fee_id: event.target.value }))}
              options={fees.map((fee) => ({ value: fee.id, label: fee.name }))}
              placeholder="Select fee"
              className="w-full"
              disabled={Boolean(editingDefault)}
            />
            <Input
              label="Grade Level"
              value={defaultForm.grade_level}
              onChange={(event) => setDefaultForm(prev => ({ ...prev, grade_level: event.target.value }))}
              placeholder="e.g. Grade 2"
              disabled={Boolean(editingDefault)}
            />
            <Input
              label="Academic Year"
              value={defaultForm.academic_year}
              onChange={(event) => setDefaultForm(prev => ({ ...prev, academic_year: event.target.value }))}
              placeholder="2025-2026"
              disabled={Boolean(editingDefault)}
            />
            <Input
              label="Default Amount"
              type="number"
              min="0"
              step="0.01"
              value={defaultForm.amount}
              onChange={(event) => setDefaultForm(prev => ({ ...prev, amount: event.target.value }))}
              placeholder="0.00"
            />
            {defaultError && <p className="text-sm text-red-600">{defaultError}</p>}
            <div className="flex flex-wrap gap-3">
              <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white">
                {editingDefault ? 'Update Amount' : 'Save Default'}
              </Button>
              {editingDefault && (
                <Button type="button" variant="outline" onClick={resetDefaultForm}>
                  Cancel
                </Button>
              )}
            </div>
          </form>

          <div className="mt-6">
            <h3 className="text-lg font-medium text-gray-900 mb-3">Defaults for Selection</h3>
            {defaultsQuery.isLoading ? (
              <p className="text-gray-500">Loading defaults...</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fee</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Grade</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Academic Year</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {defaults.map((feeDefault) => (
                      <tr key={feeDefault.id}>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {feeDefault.school_fee?.name || 'School Fee'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">{feeDefault.grade_level}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{feeDefault.academic_year}</td>
                        <td className="px-4 py-3 text-sm text-gray-900 text-right">
                          {Number(feeDefault.amount).toFixed(2)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEditDefault(feeDefault)}
                            >
                              <PencilSquareIcon className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDeleteDefault(feeDefault)}
                              className="text-red-600 border-red-200 hover:bg-red-50"
                            >
                              <TrashIcon className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!defaults.length && (
                      <tr>
                        <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                          No defaults found for the selected filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}

export default Finance
