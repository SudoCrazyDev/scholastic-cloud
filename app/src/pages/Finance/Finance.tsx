import React, { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PDFDownloadLink } from '@react-pdf/renderer'
import { PencilSquareIcon, TrashIcon } from '@heroicons/react/24/outline'
import { NavLink, useLocation } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { Button } from '../../components/button'
import { Input } from '../../components/input'
import { Select } from '../../components/select'
import { schoolFeeService } from '../../services/schoolFeeService'
import { schoolFeeDefaultService } from '../../services/schoolFeeDefaultService'
import { financeDashboardService } from '../../services/financeDashboardService'
import { studentService } from '../../services/studentService'
import { studentPaymentService } from '../../services/studentPaymentService'
import { studentFinanceService } from '../../services/studentFinanceService'
import { StudentNOAPDF } from '../../components/StudentNOAPDF'
import type { SchoolFee, SchoolFeeDefault, Student, CreateStudentPaymentData, StudentPayment } from '../../types'

const Finance: React.FC = () => {
  const queryClient = useQueryClient()
  const location = useLocation()
  const view = useMemo(() => {
    const pathname = location.pathname
    if (pathname.endsWith('/school-fees')) return 'school-fees'
    if (pathname.endsWith('/default-amounts')) return 'default-amounts'
    if (pathname.endsWith('/cashiering')) return 'cashiering'
    if (pathname.endsWith('/ledger')) return 'ledger'
    return 'dashboard'
  }, [location.pathname])

  const currentYear = new Date().getFullYear()
  const defaultAcademicYear = `${currentYear}-${currentYear + 1}`

  const gradeLevelOptions = useMemo(() => {
    const options = [
      { value: 'Kinder 1', label: 'Kinder 1' },
      { value: 'Kinder 2', label: 'Kinder 2' },
    ]
    for (let grade = 1; grade <= 12; grade += 1) {
      options.push({ value: `Grade ${grade}`, label: `Grade ${grade}` })
    }
    return options
  }, [])

  const filterGradeOptions = useMemo(
    () => [{ value: '', label: 'All grades' }, ...gradeLevelOptions],
    [gradeLevelOptions]
  )

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

  const [studentSearchTerm, setStudentSearchTerm] = useState('')
  const [debouncedStudentSearch, setDebouncedStudentSearch] = useState('')
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
  const [cashierPaymentForm, setCashierPaymentForm] = useState({
    academic_year: defaultAcademicYear,
    school_fee_id: '',
    amount: '',
    payment_date: new Date().toISOString().split('T')[0],
    payment_method: '',
    reference_number: '',
    remarks: '',
  })
  const [cashierError, setCashierError] = useState<string | null>(null)
  const [lastReceipt, setLastReceipt] = useState<StudentPayment | null>(null)

  const [ledgerSearchTerm, setLedgerSearchTerm] = useState('')
  const [debouncedLedgerSearch, setDebouncedLedgerSearch] = useState('')
  const [selectedLedgerStudent, setSelectedLedgerStudent] = useState<Student | null>(null)
  const [ledgerAcademicYear, setLedgerAcademicYear] = useState(defaultAcademicYear)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedStudentSearch(studentSearchTerm), 300)
    return () => clearTimeout(timer)
  }, [studentSearchTerm])

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedLedgerSearch(ledgerSearchTerm), 300)
    return () => clearTimeout(timer)
  }, [ledgerSearchTerm])

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
    enabled: view === 'dashboard' && Boolean(dashboardYear),
  })

  const defaultsQuery = useQuery({
    queryKey: ['school-fee-defaults', filters],
    queryFn: () =>
      schoolFeeDefaultService.getDefaults({
        academic_year: filters.academic_year || undefined,
        grade_level: filters.grade_level || undefined,
      }),
    enabled: view === 'default-amounts',
  })

  const studentSearchQuery = useQuery({
    queryKey: ['students-cashier-search', debouncedStudentSearch],
    queryFn: () =>
      studentService.searchStudentsForAssignment({
        search: debouncedStudentSearch,
        per_page: 20,
      }),
    enabled: view === 'cashiering' && debouncedStudentSearch.length >= 2,
  })

  const ledgerStudentSearchQuery = useQuery({
    queryKey: ['students-ledger-search', debouncedLedgerSearch],
    queryFn: () =>
      studentService.searchStudentsForAssignment({
        search: debouncedLedgerSearch,
        per_page: 20,
      }),
    enabled: view === 'ledger' && debouncedLedgerSearch.length >= 2,
  })

  const ledgerQuery = useQuery({
    queryKey: ['student-ledger', selectedLedgerStudent?.id, ledgerAcademicYear],
    queryFn: () =>
      studentFinanceService.getLedger(selectedLedgerStudent!.id, ledgerAcademicYear),
    enabled: view === 'ledger' && Boolean(selectedLedgerStudent?.id),
  })

  const ledgerNoaQuery = useQuery({
    queryKey: ['student-noa', selectedLedgerStudent?.id, ledgerAcademicYear],
    queryFn: () => studentFinanceService.getNoticeOfAccount(selectedLedgerStudent!.id, ledgerAcademicYear),
    enabled: view === 'ledger' && Boolean(selectedLedgerStudent?.id && ledgerAcademicYear),
  })

  const createPaymentMutation = useMutation({
    mutationFn: (payload: CreateStudentPaymentData) => studentPaymentService.createPayment(payload),
    onSuccess: (response) => {
      setLastReceipt(response.data)
      setCashierPaymentForm((prev) => ({
        ...prev,
        amount: '',
        reference_number: '',
        remarks: '',
      }))
      setCashierError(null)
      queryClient.invalidateQueries({ queryKey: ['finance-dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['student-ledger'] })
      toast.success(`Payment recorded. Receipt: ${response.data.receipt_number ?? response.data.id}`)
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Failed to record payment.'
      setCashierError(message)
      toast.error(message)
    },
  })

  const createFeeMutation = useMutation({
    mutationFn: () => schoolFeeService.createSchoolFee(feeForm),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['school-fees'] })
      setFeeForm({ name: '', description: '', is_active: true })
      setFeeError(null)
      toast.success('School fee saved.')
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Failed to save school fee.'
      setFeeError(message)
      toast.error(message)
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
      toast.success('School fee updated.')
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Failed to update school fee.'
      setFeeError(message)
      toast.error(message)
    },
  })

  const deleteFeeMutation = useMutation({
    mutationFn: (id: string) => schoolFeeService.deleteSchoolFee(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['school-fees'] })
      toast.success('School fee deleted.')
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Failed to delete school fee.'
      toast.error(message)
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
      toast.success('Default amount saved.')
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Failed to save default amount.'
      setDefaultError(message)
      toast.error(message)
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
      toast.success('Default amount updated.')
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Failed to update default amount.'
      setDefaultError(message)
      toast.error(message)
    },
  })

  const deleteDefaultMutation = useMutation({
    mutationFn: (id: string) => schoolFeeDefaultService.deleteDefault(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['school-fee-defaults'] })
      toast.success('Default amount removed.')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to remove default amount.')
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

  const formatCurrency = (amount?: number | string | null) => {
    const value = Number(amount ?? 0)
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)
  }

  const isSavingDefault = upsertDefaultMutation.isPending || updateDefaultMutation.isPending

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

  const getStudentFullName = (s: Student) =>
    [s.first_name, s.middle_name, s.last_name, s.ext_name].filter(Boolean).join(' ')

  const handleCashierPaymentSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    setCashierError(null)
    if (!selectedStudent) {
      setCashierError('Please select a student.')
      toast.error('Please select a student.')
      return
    }
    const amountValue = Number(cashierPaymentForm.amount)
    if (!amountValue || amountValue <= 0) {
      setCashierError('Payment amount must be greater than zero.')
      toast.error('Payment amount must be greater than zero.')
      return
    }
    const payload: CreateStudentPaymentData = {
      student_id: selectedStudent.id,
      academic_year: cashierPaymentForm.academic_year,
      amount: amountValue,
      payment_date: cashierPaymentForm.payment_date || new Date().toISOString().split('T')[0],
      payment_method: cashierPaymentForm.payment_method || undefined,
      reference_number: cashierPaymentForm.reference_number || undefined,
      remarks: cashierPaymentForm.remarks || undefined,
      school_fee_id: cashierPaymentForm.school_fee_id || undefined,
    }
    createPaymentMutation.mutate(payload)
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

  const isSavingFee = createFeeMutation.isPending || updateFeeMutation.isPending

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

      <div className="bg-white rounded-xl border border-gray-200 p-2 shadow-sm">
        <div className="flex flex-wrap gap-2">
          <NavLink
            to="/finance"
            end
            className={({ isActive }) =>
              `px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                isActive ? 'bg-indigo-600 text-white' : 'text-gray-700 hover:bg-gray-50'
              }`
            }
          >
            Dashboard
          </NavLink>
          <NavLink
            to="/finance/school-fees"
            className={({ isActive }) =>
              `px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                isActive ? 'bg-indigo-600 text-white' : 'text-gray-700 hover:bg-gray-50'
              }`
            }
          >
            School Fees
          </NavLink>
          <NavLink
            to="/finance/default-amounts"
            className={({ isActive }) =>
              `px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                isActive ? 'bg-indigo-600 text-white' : 'text-gray-700 hover:bg-gray-50'
              }`
            }
          >
            Default Amounts
          </NavLink>
          <NavLink
            to="/finance/cashiering"
            className={({ isActive }) =>
              `px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                isActive ? 'bg-indigo-600 text-white' : 'text-gray-700 hover:bg-gray-50'
              }`
            }
          >
            Cashiering (POS)
          </NavLink>
          <NavLink
            to="/finance/ledger"
            className={({ isActive }) =>
              `px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                isActive ? 'bg-indigo-600 text-white' : 'text-gray-700 hover:bg-gray-50'
              }`
            }
          >
            Ledger
          </NavLink>
        </div>
      </div>

      {view === 'dashboard' && (
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
      )}

      {view === 'school-fees' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">School Fees</h2>
          <form className="space-y-4" onSubmit={handleFeeSubmit}>
            <Input
              label="Fee Name"
              value={feeForm.name}
              onChange={(event) => setFeeForm(prev => ({ ...prev, name: event.target.value }))}
              placeholder="e.g. Tuition Fee"
              disabled={isSavingFee}
            />
            <Input
              label="Description"
              value={feeForm.description}
              onChange={(event) => setFeeForm(prev => ({ ...prev, description: event.target.value }))}
              placeholder="Optional notes"
              disabled={isSavingFee}
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
                disabled={isSavingFee}
              />
            </div>
            {feeError && <p className="text-sm text-red-600">{feeError}</p>}
            <div className="flex flex-wrap gap-3">
              <Button type="submit" loading={isSavingFee} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                {editingFee ? (isSavingFee ? 'Updating Fee...' : 'Update Fee') : (isSavingFee ? 'Adding Fee...' : 'Add Fee')}
              </Button>
              {editingFee && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={isSavingFee}
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
      )}

      {view === 'default-amounts' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Default Amounts</h2>
            <p className="text-sm text-gray-500 mt-1">
              Set default fee amounts per grade level and academic year. These are used when assigning fees to students.
            </p>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-end gap-4 rounded-lg border border-gray-200 bg-gray-50/50 px-4 py-3">
            <div className="min-w-[140px]">
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
                Grade level
              </label>
              <Select
                value={filters.grade_level}
                onChange={(e) => setFilters(prev => ({ ...prev, grade_level: e.target.value }))}
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
                onChange={(e) => setFilters(prev => ({ ...prev, academic_year: e.target.value }))}
                options={academicYearOptions}
                className="w-full"
              />
            </div>
            <p className="text-sm text-gray-500 ml-auto self-center">
              {defaultsQuery.isLoading
                ? 'Loading…'
                : `${defaults.length} default${defaults.length === 1 ? '' : 's'}`}
            </p>
          </div>

          {/* Add / Edit form */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="text-base font-semibold text-gray-900 mb-4">
              {editingDefault ? 'Edit default amount' : 'Set default amount'}
            </h3>
            <form className="space-y-4" onSubmit={handleDefaultSubmit}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Fee</label>
                  <Select
                    value={defaultForm.school_fee_id}
                    onChange={(e) => setDefaultForm(prev => ({ ...prev, school_fee_id: e.target.value }))}
                    options={fees.map((fee) => ({ value: fee.id, label: fee.name }))}
                    placeholder="Select fee"
                    className="w-full"
                    disabled={Boolean(editingDefault) || isSavingDefault}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Grade level</label>
                  <Select
                    value={defaultForm.grade_level}
                    onChange={(e) => setDefaultForm(prev => ({ ...prev, grade_level: e.target.value }))}
                    options={gradeLevelOptions}
                    placeholder="Select grade"
                    className="w-full"
                    disabled={Boolean(editingDefault) || isSavingDefault}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Academic year</label>
                  <Select
                    value={defaultForm.academic_year}
                    onChange={(e) => setDefaultForm(prev => ({ ...prev, academic_year: e.target.value }))}
                    options={academicYearOptions}
                    className="w-full"
                    disabled={Boolean(editingDefault) || isSavingDefault}
                  />
                </div>
                <div className="[&_input]:!py-[calc(--spacing(2.5)-1px)] [&_input]:!text-base/6 sm:[&_input]:!py-[calc(--spacing(1.5)-1px)] sm:[&_input]:!text-sm/6">
                  <Input
                    label="Amount (PHP)"
                    type="number"
                    min="0"
                    step="0.01"
                    value={defaultForm.amount}
                    onChange={(e) => setDefaultForm(prev => ({ ...prev, amount: e.target.value }))}
                    placeholder="0.00"
                    disabled={isSavingDefault}
                  />
                </div>
              </div>
              {defaultError && (
                <p className="text-sm text-red-600" role="alert">
                  {defaultError}
                </p>
              )}
              <div className="flex flex-wrap gap-3">
                <Button
                  type="submit"
                  loading={isSavingDefault}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  {editingDefault
                    ? isSavingDefault
                      ? 'Updating…'
                      : 'Update amount'
                    : isSavingDefault
                      ? 'Saving…'
                      : 'Save default'}
                </Button>
                {editingDefault && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isSavingDefault}
                    onClick={resetDefaultForm}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </form>
          </div>

          {/* Table */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50/50">
              <h3 className="text-base font-semibold text-gray-900">Default amounts list</h3>
            </div>
            {defaultsQuery.isLoading ? (
              <div className="p-8 text-center text-gray-500">
                <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-indigo-600 mb-2" />
                <p>Loading defaults…</p>
              </div>
            ) : !defaults.length ? (
              <div className="py-12 text-center">
                <p className="text-gray-500">No default amounts for the selected filters.</p>
                <p className="text-sm text-gray-400 mt-1">
                  Use the form above to add a default amount for a fee, grade, and academic year.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Fee
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Grade
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Academic year
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Amount
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-28">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {defaults.map((row) => (
                      <tr
                        key={row.id}
                        className={editingDefault?.id === row.id ? 'bg-indigo-50/50' : 'hover:bg-gray-50/50'}
                      >
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">
                          {row.school_fee?.name || '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">{row.grade_level}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{row.academic_year}</td>
                        <td className="px-4 py-3 text-sm text-right font-medium text-gray-900 tabular-nums">
                          {formatCurrency(row.amount)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEditDefault(row)}
                              title="Edit amount"
                            >
                              <PencilSquareIcon className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDeleteDefault(row)}
                              className="text-red-600 border-red-200 hover:bg-red-50"
                              title="Remove default"
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
      )}

      {view === 'cashiering' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Cashiering (POS)</h2>
            <p className="text-sm text-gray-600">
              Search for a student and record a payment. Receipt number will be shown after saving.
            </p>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-4">
                <label className="block text-sm font-medium text-gray-700">Student</label>
                <div className="relative">
                  <Input
                    value={studentSearchTerm}
                    onChange={(e) => {
                      setStudentSearchTerm(e.target.value)
                      if (!e.target.value) setSelectedStudent(null)
                    }}
                    placeholder="Search by name or LRN (min 2 characters)"
                    className="w-full"
                  />
                  {studentSearchQuery.isFetching && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                      Searching...
                    </div>
                  )}
                  {debouncedStudentSearch.length >= 2 && !selectedStudent && (
                    <div className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg max-h-60 overflow-auto">
                      {studentSearchQuery.data?.data?.length ? (
                        studentSearchQuery.data.data.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => {
                              setSelectedStudent(s)
                              setStudentSearchTerm(getStudentFullName(s))
                              setDebouncedStudentSearch('')
                            }}
                            className="w-full px-4 py-2 text-left text-sm hover:bg-indigo-50 flex flex-col"
                          >
                            <span className="font-medium text-gray-900">{getStudentFullName(s)}</span>
                            {s.lrn && <span className="text-xs text-gray-500">LRN: {s.lrn}</span>}
                          </button>
                        ))
                      ) : (
                        <div className="px-4 py-3 text-sm text-gray-500">No students found.</div>
                      )}
                    </div>
                  )}
                </div>
                {selectedStudent && (
                  <div className="flex items-center justify-between rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2">
                    <span className="text-sm font-medium text-indigo-900">
                      {getStudentFullName(selectedStudent)}
                      {selectedStudent.lrn && ` (LRN: ${selectedStudent.lrn})`}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedStudent(null)
                        setStudentSearchTerm('')
                      }}
                    >
                      Clear
                    </Button>
                  </div>
                )}
              </div>

              <form onSubmit={handleCashierPaymentSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Academic year</label>
                    <Select
                      value={cashierPaymentForm.academic_year}
                      onChange={(e) =>
                        setCashierPaymentForm((prev) => ({ ...prev, academic_year: e.target.value }))
                      }
                      options={academicYearOptions}
                      className="w-full"
                      disabled={createPaymentMutation.isPending}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Payment date</label>
                    <Input
                      type="date"
                      value={cashierPaymentForm.payment_date}
                      onChange={(e) =>
                        setCashierPaymentForm((prev) => ({ ...prev, payment_date: e.target.value }))
                      }
                      disabled={createPaymentMutation.isPending}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Fee type (optional)
                  </label>
                  <Select
                    value={cashierPaymentForm.school_fee_id}
                    onChange={(e) =>
                      setCashierPaymentForm((prev) => ({ ...prev, school_fee_id: e.target.value }))
                    }
                    options={[
                      { value: '', label: '— Any / General' },
                      ...(feesQuery.data?.data ?? []).map((f) => ({ value: f.id, label: f.name })),
                    ]}
                    className="w-full"
                    disabled={createPaymentMutation.isPending}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Amount (₱) *</label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={cashierPaymentForm.amount}
                    onChange={(e) =>
                      setCashierPaymentForm((prev) => ({ ...prev, amount: e.target.value }))
                    }
                    placeholder="0.00"
                    disabled={createPaymentMutation.isPending}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Payment method (optional)
                  </label>
                  <Select
                    value={cashierPaymentForm.payment_method}
                    onChange={(e) =>
                      setCashierPaymentForm((prev) => ({ ...prev, payment_method: e.target.value }))
                    }
                    options={[
                      { value: '', label: '— Select' },
                      { value: 'Cash', label: 'Cash' },
                      { value: 'Check', label: 'Check' },
                      { value: 'Bank Transfer', label: 'Bank Transfer' },
                      { value: 'Online', label: 'Online' },
                      { value: 'Other', label: 'Other' },
                    ]}
                    className="w-full"
                    disabled={createPaymentMutation.isPending}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Reference number (optional)
                  </label>
                  <Input
                    value={cashierPaymentForm.reference_number}
                    onChange={(e) =>
                      setCashierPaymentForm((prev) => ({ ...prev, reference_number: e.target.value }))
                    }
                    placeholder="e.g. check no., transaction id"
                    disabled={createPaymentMutation.isPending}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Remarks (optional)</label>
                  <Input
                    value={cashierPaymentForm.remarks}
                    onChange={(e) =>
                      setCashierPaymentForm((prev) => ({ ...prev, remarks: e.target.value }))
                    }
                    placeholder="Optional notes"
                    disabled={createPaymentMutation.isPending}
                  />
                </div>
                {cashierError && (
                  <p className="text-sm text-red-600">{cashierError}</p>
                )}
                <Button
                  type="submit"
                  loading={createPaymentMutation.isPending}
                  disabled={!selectedStudent}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white w-full sm:w-auto"
                >
                  {createPaymentMutation.isPending ? 'Recording...' : 'Record payment'}
                </Button>
              </form>
            </div>

            {lastReceipt && (
              <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                <p className="text-sm font-medium text-green-800">Last receipt</p>
                <p className="text-lg font-semibold text-green-900 mt-1">
                  Receipt # {lastReceipt.receipt_number ?? lastReceipt.id}
                </p>
                <p className="text-sm text-green-700 mt-1">
                  Amount: ₱ {Number(lastReceipt.amount).toLocaleString('en-PH', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {view === 'ledger' && (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Student Ledger</h2>
              <p className="text-sm text-gray-600">
                Search for a student to view their finance ledger (charges, payments, discounts, and running balance).
              </p>
            </div>
            {selectedLedgerStudent && ledgerNoaQuery.data?.data && (
              <PDFDownloadLink
                document={<StudentNOAPDF data={ledgerNoaQuery.data.data} />}
                fileName={`NOA-${selectedLedgerStudent.last_name}-${selectedLedgerStudent.first_name}-${ledgerAcademicYear}`.replace(
                  /[^a-zA-Z0-9-_]/g,
                  '-'
                )}
              >
                {({ loading }) => (
                  <Button variant="outline" size="sm">
                    {loading ? 'Preparing Notice of Account...' : 'Download Notice of Account'}
                  </Button>
                )}
              </PDFDownloadLink>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-6">
            <div className="max-w-xl space-y-4">
              <label className="block text-sm font-medium text-gray-700">Student</label>
              <div className="relative">
                <Input
                  value={ledgerSearchTerm}
                  onChange={(e) => {
                    setLedgerSearchTerm(e.target.value)
                    if (!e.target.value) setSelectedLedgerStudent(null)
                  }}
                  placeholder="Search by name or LRN (min 2 characters)"
                  className="w-full"
                />
                {ledgerStudentSearchQuery.isFetching && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                    Searching...
                  </div>
                )}
                {debouncedLedgerSearch.length >= 2 && !selectedLedgerStudent && (
                  <div className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg max-h-60 overflow-auto">
                    {ledgerStudentSearchQuery.data?.data?.length ? (
                      ledgerStudentSearchQuery.data.data.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            setSelectedLedgerStudent(s)
                            setLedgerSearchTerm(getStudentFullName(s))
                            setDebouncedLedgerSearch('')
                          }}
                          className="w-full px-4 py-2 text-left text-sm hover:bg-indigo-50 flex flex-col"
                        >
                          <span className="font-medium text-gray-900">{getStudentFullName(s)}</span>
                          {s.lrn && <span className="text-xs text-gray-500">LRN: {s.lrn}</span>}
                        </button>
                      ))
                    ) : (
                      <div className="px-4 py-3 text-sm text-gray-500">No students found.</div>
                    )}
                  </div>
                )}
              </div>
              {selectedLedgerStudent && (
                <div className="flex items-center justify-between rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2">
                  <span className="text-sm font-medium text-indigo-900">
                    {getStudentFullName(selectedLedgerStudent)}
                    {selectedLedgerStudent.lrn && ` (LRN: ${selectedLedgerStudent.lrn})`}
                  </span>
                  <div className="flex items-center gap-2">
                    <Select
                      value={ledgerAcademicYear}
                      onChange={(e) => setLedgerAcademicYear(e.target.value)}
                      options={academicYearOptions}
                      className="w-40"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedLedgerStudent(null)
                        setLedgerSearchTerm('')
                      }}
                    >
                      Clear
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {selectedLedgerStudent && (
              <>
                {ledgerQuery.data?.data?.available_academic_years?.length &&
                  !ledgerQuery.data.data.available_academic_years.includes(ledgerAcademicYear) && (
                    <p className="text-sm text-amber-600">
                      No ledger data for {ledgerAcademicYear}. Available:{' '}
                      {ledgerQuery.data.data.available_academic_years.join(', ')}
                    </p>
                  )}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                    <p className="text-sm text-gray-500">Balance Forward</p>
                    <p className="text-xl font-semibold text-gray-900 tabular-nums">
                      ₱ {Number(ledgerQuery.data?.data?.totals?.balance_forward ?? 0).toLocaleString('en-PH', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </p>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                    <p className="text-sm text-gray-500">Charges</p>
                    <p className="text-xl font-semibold text-gray-900 tabular-nums">
                      ₱ {Number(ledgerQuery.data?.data?.totals?.charges ?? 0).toLocaleString('en-PH', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </p>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                    <p className="text-sm text-gray-500">Discounts</p>
                    <p className="text-xl font-semibold text-gray-900 tabular-nums">
                      ₱ {Number(ledgerQuery.data?.data?.totals?.discounts ?? 0).toLocaleString('en-PH', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </p>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                    <p className="text-sm text-gray-500">Payments</p>
                    <p className="text-xl font-semibold text-gray-900 tabular-nums">
                      ₱ {Number(ledgerQuery.data?.data?.totals?.payments ?? 0).toLocaleString('en-PH', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </p>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-indigo-50 p-4">
                    <p className="text-sm text-gray-600 font-medium">Current Balance</p>
                    <p className="text-xl font-semibold text-indigo-900 tabular-nums">
                      ₱ {Number(ledgerQuery.data?.data?.totals?.balance ?? 0).toLocaleString('en-PH', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </p>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">Ledger entries</h3>
                  {ledgerQuery.isLoading ? (
                    <p className="text-gray-500">Loading ledger...</p>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-gray-200">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                              Type
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                              Description
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                              Date
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                              Amount
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                              Running Balance
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 bg-white">
                          {ledgerQuery.data?.data?.entries?.map((entry, index) => (
                            <tr
                              key={
                                `${entry.type}-${entry.payment_id ?? entry.discount_id ?? entry.fee_id ?? index}`
                              }
                            >
                              <td className="px-4 py-3 text-sm text-gray-600 capitalize">
                                {entry.type.replace('_', ' ')}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-700">{entry.description}</td>
                              <td className="px-4 py-3 text-sm text-gray-600">
                                {entry.date ?? '—'}
                              </td>
                              <td
                                className={`px-4 py-3 text-sm text-right tabular-nums ${
                                  entry.amount < 0 ? 'text-red-600' : 'text-gray-900'
                                }`}
                              >
                                ₱ {Number(entry.amount).toLocaleString('en-PH', {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </td>
                              <td className="px-4 py-3 text-sm text-right text-gray-900 tabular-nums">
                                ₱ {Number(entry.running_balance ?? 0).toLocaleString('en-PH', {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </td>
                            </tr>
                          ))}
                          {!ledgerQuery.data?.data?.entries?.length && (
                            <tr>
                              <td
                                colSpan={5}
                                className="px-4 py-8 text-center text-gray-500"
                              >
                                No ledger entries for this academic year.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}

            {!selectedLedgerStudent && (
              <p className="text-sm text-gray-500">Select a student above to view their ledger.</p>
            )}
          </div>
        </div>
      )}
    </motion.div>
  )
}

export default Finance
