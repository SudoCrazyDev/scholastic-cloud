import React, { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PDFDownloadLink } from '@react-pdf/renderer'
import { PencilSquareIcon, TrashIcon, PlusIcon } from '@heroicons/react/24/outline'
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
import { studentDiscountService } from '../../services/studentDiscountService'
import { defaultDiscountService } from '../../services/defaultDiscountService'
import { studentAdditionalFeeService } from '../../services/studentAdditionalFeeService'
import { paymentVoidService } from '../../services/paymentVoidService'
import { useAuth } from '../../hooks/useAuth'
import { StudentNOAPDF } from '../../components/StudentNOAPDF'
import DashboardCharts from './DashboardCharts'
import CollectionsView from './CollectionsView'
import DiscountsView from './DiscountsView'
import DefaultDiscountsView from './DefaultDiscountsView'
import ReceiptBuilderView from './ReceiptBuilderView'
import ReceiptPrintModal from './ReceiptPrintModal'
import type { SchoolFee, SchoolFeeDefault, DefaultDiscount, Student, CreateStudentDiscountData, CreateStudentAdditionalFeeData, CreatePaymentTransactionData, PaymentTransaction, StudentLedgerEntry, PaymentVoidStatus } from '../../types'

const VOID_APPROVER_ROLES = ['institution-administrator', 'principal', 'super-administrator']

const Finance: React.FC = () => {
  const queryClient = useQueryClient()
  const location = useLocation()
  const view = useMemo(() => {
    const pathname = location.pathname
    if (pathname.endsWith('/school-fees')) return 'school-fees'
    if (pathname.endsWith('/default-amounts')) return 'default-amounts'
    if (pathname.endsWith('/cashiering')) return 'cashiering'
    if (pathname.endsWith('/ledger')) return 'ledger'
    if (pathname.endsWith('/collections')) return 'collections'
    if (pathname.endsWith('/default-discounts')) return 'default-discounts'
    if (pathname.endsWith('/discounts')) return 'discounts'
    if (pathname.endsWith('/receipt-builder')) return 'receipt-builder'
    if (pathname.endsWith('/void-requests')) return 'void-requests'
    return 'dashboard'
  }, [location.pathname])

  const { user } = useAuth()
  const roleSlug: string | undefined = user?.role?.slug
  const isVoidApprover = Boolean(roleSlug && VOID_APPROVER_ROLES.includes(roleSlug))
  const canRequestVoid = roleSlug === 'finance' || isVoidApprover

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
    apply_to_all: false,
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
    payment_date: new Date().toISOString().split('T')[0],
    payment_method: '',
    or_number: '',
    reference_number: '',
    remarks: '',
  })
  // Per-fee amounts the cashier is paying toward, keyed by fee_id.
  const [cashierLineAmounts, setCashierLineAmounts] = useState<Record<string, string>>({})
  // Optional free-form payment not tied to a specific fee.
  const [cashierGeneralAmount, setCashierGeneralAmount] = useState('')
  const [cashierTendered, setCashierTendered] = useState('')
  const [cashierError, setCashierError] = useState<string | null>(null)
  const [lastReceipt, setLastReceipt] = useState<PaymentTransaction | null>(null)
  const [showReceiptModal, setShowReceiptModal] = useState(false)

  const [ledgerSearchTerm, setLedgerSearchTerm] = useState('')
  const [debouncedLedgerSearch, setDebouncedLedgerSearch] = useState('')
  const [selectedLedgerStudent, setSelectedLedgerStudent] = useState<Student | null>(null)
  const [ledgerAcademicYear, setLedgerAcademicYear] = useState(defaultAcademicYear)
  const [ledgerViewMode, setLedgerViewMode] = useState<'entries' | 'monthly' | 'quarterly'>('entries')
  const [showLedgerDiscount, setShowLedgerDiscount] = useState(false)
  const [ledgerDiscountForm, setLedgerDiscountForm] = useState({
    default_discount_id: '',
    discount_type: 'fixed' as 'fixed' | 'percentage',
    value: '',
    description: '',
  })
  // Rows splitting the discount amount across fees; a single row means the full amount.
  const [ledgerDiscountAllocations, setLedgerDiscountAllocations] = useState<
    { school_fee_id: string; value: string }[]
  >([{ school_fee_id: '', value: '' }])
  const [ledgerDiscountError, setLedgerDiscountError] = useState<string | null>(null)
  const [showLedgerAdditionalFee, setShowLedgerAdditionalFee] = useState(false)
  const [ledgerAdditionalFeeForm, setLedgerAdditionalFeeForm] = useState({
    name: '',
    description: '',
    amount: '',
  })
  const [ledgerAdditionalFeeError, setLedgerAdditionalFeeError] = useState<string | null>(null)

  const createLedgerDiscountMutation = useMutation({
    mutationFn: (payload: CreateStudentDiscountData) => studentDiscountService.createDiscount(payload),
    onSuccess: () => {
      setLedgerDiscountForm({
        default_discount_id: '',
        discount_type: 'fixed',
        value: '',
        description: '',
      })
      setLedgerDiscountAllocations([{ school_fee_id: '', value: '' }])
      setLedgerDiscountError(null)
      setShowLedgerDiscount(false)
      queryClient.invalidateQueries({ queryKey: ['student-ledger', selectedLedgerStudent?.id] })
      queryClient.invalidateQueries({ queryKey: ['student-noa', selectedLedgerStudent?.id] })
      toast.success('Discount applied.')
    },
    onError: (error: any) => {
      setLedgerDiscountError(error.response?.data?.message || 'Failed to save discount.')
    },
  })

  const ledgerDiscountAllocatedTotal = ledgerDiscountAllocations.reduce(
    (sum, allocation) => sum + (Number(allocation.value) || 0),
    0
  )
  const ledgerDiscountRemaining =
    Math.round(((Number(ledgerDiscountForm.value) || 0) - ledgerDiscountAllocatedTotal) * 100) / 100

  const handleLedgerDiscountSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    setLedgerDiscountError(null)
    if (!selectedLedgerStudent) return

    const value = Number(ledgerDiscountForm.value)
    if (!value || value <= 0) {
      setLedgerDiscountError('Discount value must be greater than zero.')
      return
    }
    if (ledgerDiscountForm.discount_type === 'percentage' && value > 100) {
      setLedgerDiscountError('Percentage discount cannot exceed 100%.')
      return
    }

    const isSplit =
      ledgerDiscountForm.discount_type === 'fixed' && ledgerDiscountAllocations.length > 1
    if (isSplit) {
      if (ledgerDiscountAllocations.some((allocation) => !(Number(allocation.value) > 0))) {
        setLedgerDiscountError('Each Apply To row needs an amount greater than zero.')
        return
      }
      if (ledgerDiscountRemaining !== 0) {
        setLedgerDiscountError(
          ledgerDiscountRemaining > 0
            ? `₱${ledgerDiscountRemaining.toFixed(2)} of the discount amount is still unallocated.`
            : `Allocated amounts exceed the discount amount by ₱${Math.abs(ledgerDiscountRemaining).toFixed(2)}.`
        )
        return
      }
    }

    createLedgerDiscountMutation.mutate({
      student_id: selectedLedgerStudent.id,
      academic_year: ledgerAcademicYear,
      discount_type: ledgerDiscountForm.discount_type,
      value,
      school_fee_id: isSplit ? undefined : ledgerDiscountAllocations[0]?.school_fee_id || undefined,
      description: ledgerDiscountForm.description || undefined,
      allocations: isSplit
        ? ledgerDiscountAllocations.map((allocation) => ({
            school_fee_id: allocation.school_fee_id || undefined,
            value: Number(allocation.value),
          }))
        : undefined,
    })
  }

  const ledgerAdditionalFeesQuery = useQuery({
    queryKey: ['student-additional-fees', selectedLedgerStudent?.id, ledgerAcademicYear],
    queryFn: () =>
      studentAdditionalFeeService.getFees({
        student_id: selectedLedgerStudent!.id,
        academic_year: ledgerAcademicYear,
      }),
    enabled: view === 'ledger' && Boolean(selectedLedgerStudent?.id && ledgerAcademicYear),
  })

  const createLedgerAdditionalFeeMutation = useMutation({
    mutationFn: (payload: CreateStudentAdditionalFeeData) =>
      studentAdditionalFeeService.createFee(payload),
    onSuccess: () => {
      setLedgerAdditionalFeeForm({ name: '', description: '', amount: '' })
      setLedgerAdditionalFeeError(null)
      setShowLedgerAdditionalFee(false)
      queryClient.invalidateQueries({ queryKey: ['student-additional-fees', selectedLedgerStudent?.id] })
      queryClient.invalidateQueries({ queryKey: ['student-ledger', selectedLedgerStudent?.id] })
      queryClient.invalidateQueries({ queryKey: ['student-noa', selectedLedgerStudent?.id] })
      toast.success('Additional fee added.')
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Failed to add fee.'
      setLedgerAdditionalFeeError(message)
      toast.error(message)
    },
  })

  const deleteLedgerAdditionalFeeMutation = useMutation({
    mutationFn: (id: string) => studentAdditionalFeeService.deleteFee(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['student-additional-fees', selectedLedgerStudent?.id] })
      queryClient.invalidateQueries({ queryKey: ['student-ledger', selectedLedgerStudent?.id] })
      queryClient.invalidateQueries({ queryKey: ['student-noa', selectedLedgerStudent?.id] })
      toast.success('Additional fee removed.')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to remove fee.')
    },
  })

  // ---- Payment void workflow ----
  const [voidEntry, setVoidEntry] = useState<StudentLedgerEntry | null>(null)
  const [voidNote, setVoidNote] = useState('')
  const [voidStatusFilter, setVoidStatusFilter] = useState<PaymentVoidStatus>('pending')
  const [disapproveTarget, setDisapproveTarget] = useState<string | null>(null)
  const [disapproveNote, setDisapproveNote] = useState('')

  const voidRequestsQuery = useQuery({
    queryKey: ['payment-void-requests', voidStatusFilter],
    queryFn: () => paymentVoidService.list(voidStatusFilter),
    enabled: view === 'void-requests' && canRequestVoid,
  })

  const invalidateAfterVoid = () => {
    queryClient.invalidateQueries({ queryKey: ['payment-void-requests'] })
    queryClient.invalidateQueries({ queryKey: ['student-ledger'] })
    queryClient.invalidateQueries({ queryKey: ['student-noa'] })
  }

  const createVoidMutation = useMutation({
    mutationFn: (payload: { receipt_number: string; request_note: string }) =>
      paymentVoidService.create(payload),
    onSuccess: (response) => {
      setVoidEntry(null)
      setVoidNote('')
      invalidateAfterVoid()
      toast.success(response.message || 'Void request submitted.')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to submit void request.')
    },
  })

  const approveVoidMutation = useMutation({
    mutationFn: (id: string) => paymentVoidService.approve(id),
    onSuccess: () => {
      invalidateAfterVoid()
      toast.success('Void request approved.')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to approve void request.')
    },
  })

  const disapproveVoidMutation = useMutation({
    mutationFn: (payload: { id: string; review_note: string }) =>
      paymentVoidService.disapprove(payload.id, payload.review_note),
    onSuccess: () => {
      setDisapproveTarget(null)
      setDisapproveNote('')
      invalidateAfterVoid()
      toast.success('Void request disapproved.')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to disapprove void request.')
    },
  })

  const handleVoidSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!voidEntry?.receipt_number) {
      toast.error('This payment has no receipt number and cannot be voided.')
      return
    }
    if (!voidNote.trim()) {
      toast.error('A note is required to void a payment.')
      return
    }
    createVoidMutation.mutate({
      receipt_number: voidEntry.receipt_number,
      request_note: voidNote.trim(),
    })
  }

  // ---- Discount void workflow (direct void, no approval queue) ----
  const [voidDiscountEntry, setVoidDiscountEntry] = useState<StudentLedgerEntry | null>(null)
  const [voidDiscountNote, setVoidDiscountNote] = useState('')

  const voidDiscountMutation = useMutation({
    mutationFn: (payload: { id: string; void_note: string }) =>
      studentDiscountService.voidDiscount(payload.id, payload.void_note),
    onSuccess: () => {
      setVoidDiscountEntry(null)
      setVoidDiscountNote('')
      queryClient.invalidateQueries({ queryKey: ['student-ledger'] })
      queryClient.invalidateQueries({ queryKey: ['student-noa'] })
      toast.success('Discount voided.')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to void discount.')
    },
  })

  const handleVoidDiscountSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!voidDiscountEntry?.discount_id) return
    if (!voidDiscountNote.trim()) {
      toast.error('A note is required to void a discount.')
      return
    }
    voidDiscountMutation.mutate({
      id: voidDiscountEntry.discount_id,
      void_note: voidDiscountNote.trim(),
    })
  }

  const handleLedgerAdditionalFeeSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    setLedgerAdditionalFeeError(null)
    if (!selectedLedgerStudent) return

    if (!ledgerAdditionalFeeForm.name.trim()) {
      setLedgerAdditionalFeeError('Fee name is required.')
      return
    }
    const amount = Number(ledgerAdditionalFeeForm.amount)
    if (!amount || amount <= 0) {
      setLedgerAdditionalFeeError('Amount must be greater than zero.')
      return
    }

    createLedgerAdditionalFeeMutation.mutate({
      student_id: selectedLedgerStudent.id,
      academic_year: ledgerAcademicYear,
      name: ledgerAdditionalFeeForm.name,
      description: ledgerAdditionalFeeForm.description || undefined,
      amount,
    })
  }

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

  const defaultDiscountsQuery = useQuery({
    queryKey: ['default-discounts', 'active'],
    queryFn: () => defaultDiscountService.getDefaultDiscounts({ is_active: true }),
    enabled: view === 'ledger',
  })
  const defaultDiscountOptions = defaultDiscountsQuery.data?.data || []

  const handleSelectDefaultDiscount = (id: string) => {
    if (!id) {
      setLedgerDiscountForm((prev) => ({
        ...prev,
        default_discount_id: '',
      }))
      return
    }
    const preset = defaultDiscountOptions.find((discount: DefaultDiscount) => discount.id === id)
    if (!preset) return
    setLedgerDiscountForm((prev) => ({
      ...prev,
      default_discount_id: id,
      discount_type: preset.discount_type,
      value: preset.value.toString(),
      description: preset.description || preset.name,
    }))
    setLedgerDiscountAllocations((prev) => [
      { school_fee_id: prev[0]?.school_fee_id ?? '', value: preset.value.toString() },
    ])
  }

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

  const cashierLedgerQuery = useQuery({
    queryKey: ['cashier-ledger', selectedStudent?.id, cashierPaymentForm.academic_year],
    queryFn: () =>
      studentFinanceService.getLedger(selectedStudent!.id, cashierPaymentForm.academic_year),
    enabled:
      view === 'cashiering' &&
      Boolean(selectedStudent?.id) &&
      Boolean(cashierPaymentForm.academic_year),
  })

  const createTransactionMutation = useMutation({
    mutationFn: (payload: CreatePaymentTransactionData) =>
      studentPaymentService.createTransaction(payload),
    onSuccess: (response) => {
      setLastReceipt(response.data)
      setShowReceiptModal(true)
      setCashierLineAmounts({})
      setCashierGeneralAmount('')
      setCashierTendered('')
      setCashierPaymentForm((prev) => ({
        ...prev,
        or_number: '',
        reference_number: '',
        remarks: '',
      }))
      setCashierError(null)
      queryClient.invalidateQueries({ queryKey: ['finance-dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['student-ledger'] })
      queryClient.invalidateQueries({ queryKey: ['cashier-ledger'] })
      toast.success(`Payment recorded. Receipt: ${response.data.receipt_number}`)
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
        apply_to_all: false,
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

  const applyAllDefaultMutation = useMutation({
    mutationFn: () =>
      schoolFeeDefaultService.applyToAll({
        school_fee_id: defaultForm.school_fee_id,
        academic_year: defaultForm.academic_year,
        amount: Number(defaultForm.amount),
        grade_levels: gradeLevelOptions.map((option) => option.value),
      }),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['school-fee-defaults'] })
      setDefaultForm({
        school_fee_id: '',
        grade_level: defaultForm.grade_level,
        academic_year: defaultForm.academic_year,
        amount: '',
        apply_to_all: false,
      })
      setDefaultError(null)
      const saved = response.data?.saved ?? gradeLevelOptions.length
      toast.success(`Default amount applied to ${saved} grade levels.`)
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Failed to apply default amount to all grade levels.'
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
        apply_to_all: false,
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

  const isSavingDefault = upsertDefaultMutation.isPending || updateDefaultMutation.isPending || applyAllDefaultMutation.isPending

  const handleDefaultSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!defaultForm.school_fee_id) {
      setDefaultError('Please select a fee.')
      return
    }
    if (!defaultForm.apply_to_all && !defaultForm.grade_level.trim()) {
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
    } else if (defaultForm.apply_to_all) {
      applyAllDefaultMutation.mutate()
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
      apply_to_all: false,
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

  const cashierFeeBreakdown = cashierLedgerQuery.data?.data?.fee_breakdown ?? []
  const cashierGradeLevel = cashierLedgerQuery.data?.data?.grade_level
  const cashierSection = cashierLedgerQuery.data?.data?.section

  // Build the list of fee lines the cashier has entered an amount for.
  const cashierLineItems = useMemo(() => {
    const items: { school_fee_id: string | null; fee_name: string; amount: number }[] = []
    for (const fee of cashierFeeBreakdown) {
      const raw = cashierLineAmounts[fee.fee_id]
      const amount = Number(raw)
      if (raw && amount > 0) {
        // Additional fees are not real school_fees; record them as general lines.
        items.push({
          school_fee_id: fee.is_additional ? null : fee.fee_id,
          fee_name: fee.fee_name,
          amount,
        })
      }
    }
    const generalAmount = Number(cashierGeneralAmount)
    if (cashierGeneralAmount && generalAmount > 0) {
      items.push({ school_fee_id: null, fee_name: 'General / Other', amount: generalAmount })
    }
    return items
  }, [cashierFeeBreakdown, cashierLineAmounts, cashierGeneralAmount])

  const cashierTotal = useMemo(
    () => cashierLineItems.reduce((sum, item) => sum + item.amount, 0),
    [cashierLineItems]
  )

  const cashierTenderedValue = Number(cashierTendered) || 0
  const cashierChangeDue = cashierTendered ? Math.max(cashierTenderedValue - cashierTotal, 0) : 0

  const handleCashierTransactionSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    setCashierError(null)
    if (!selectedStudent) {
      setCashierError('Please select a student.')
      toast.error('Please select a student.')
      return
    }
    if (cashierLineItems.length === 0) {
      setCashierError('Enter an amount for at least one fee.')
      toast.error('Enter an amount for at least one fee.')
      return
    }
    if (cashierTendered && cashierTenderedValue < cashierTotal) {
      setCashierError('Amount tendered is less than the total to pay.')
      toast.error('Amount tendered is less than the total to pay.')
      return
    }

    // Soft warning for paying more than a fee's outstanding balance.
    const overpaid = cashierFeeBreakdown.find((fee) => {
      const amount = Number(cashierLineAmounts[fee.fee_id])
      return amount > 0 && fee.outstanding > 0 && amount > fee.outstanding + 0.001
    })
    if (overpaid) {
      toast(`Note: payment for ${overpaid.fee_name} exceeds its balance (advance payment).`, {
        icon: '⚠️',
      })
    }

    const payload: CreatePaymentTransactionData = {
      student_id: selectedStudent.id,
      academic_year: cashierPaymentForm.academic_year,
      payment_date: cashierPaymentForm.payment_date || new Date().toISOString().split('T')[0],
      payment_method: cashierPaymentForm.payment_method || undefined,
      or_number: cashierPaymentForm.or_number || undefined,
      reference_number: cashierPaymentForm.reference_number || undefined,
      remarks: cashierPaymentForm.remarks || undefined,
      amount_tendered: cashierTendered ? cashierTenderedValue : undefined,
      items: cashierLineItems.map((item) => ({
        school_fee_id: item.school_fee_id,
        amount: item.amount,
      })),
    }
    createTransactionMutation.mutate(payload)
  }

  const resetDefaultForm = () => {
    setEditingDefault(null)
    setDefaultForm({
      school_fee_id: '',
      grade_level: filters.grade_level,
      academic_year: filters.academic_year,
      amount: '',
      apply_to_all: false,
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
          <NavLink
            to="/finance/collections"
            className={({ isActive }) =>
              `px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                isActive ? 'bg-indigo-600 text-white' : 'text-gray-700 hover:bg-gray-50'
              }`
            }
          >
            Collections
          </NavLink>
          <NavLink
            to="/finance/discounts"
            className={({ isActive }) =>
              `px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                isActive ? 'bg-indigo-600 text-white' : 'text-gray-700 hover:bg-gray-50'
              }`
            }
          >
            Discounts
          </NavLink>
          <NavLink
            to="/finance/default-discounts"
            className={({ isActive }) =>
              `px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                isActive ? 'bg-indigo-600 text-white' : 'text-gray-700 hover:bg-gray-50'
              }`
            }
          >
            Default Discounts
          </NavLink>
          <NavLink
            to="/finance/receipt-builder"
            className={({ isActive }) =>
              `px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                isActive ? 'bg-indigo-600 text-white' : 'text-gray-700 hover:bg-gray-50'
              }`
            }
          >
            Receipt Builder
          </NavLink>
          {canRequestVoid && (
            <NavLink
              to="/finance/void-requests"
              className={({ isActive }) =>
                `px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  isActive ? 'bg-indigo-600 text-white' : 'text-gray-700 hover:bg-gray-50'
                }`
              }
            >
              Void Requests
            </NavLink>
          )}
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

          {!dashboardQuery.isLoading && (
            <DashboardCharts fees={dashboardFees} grades={gradeSummaries} />
          )}
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
                    disabled={Boolean(editingDefault) || isSavingDefault || defaultForm.apply_to_all}
                  />
                  {!editingDefault && (
                    <label className="mt-2 flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        checked={defaultForm.apply_to_all}
                        onChange={(e) => setDefaultForm(prev => ({ ...prev, apply_to_all: e.target.checked }))}
                        disabled={isSavingDefault}
                      />
                      Apply to all grade levels
                    </label>
                  )}
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
                      : defaultForm.apply_to_all
                        ? 'Apply to all grade levels'
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
            {/* Filters */}
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50/50">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Filters</p>
              <div className="flex flex-wrap items-end gap-4">
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

          {lastReceipt && (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-green-200 bg-green-50 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 text-green-700">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-green-800">
                    Payment recorded · Receipt #{lastReceipt.receipt_number}
                  </p>
                  <p className="text-sm text-green-700">
                    {lastReceipt.items?.length ?? 0} item
                    {(lastReceipt.items?.length ?? 0) === 1 ? '' : 's'} · Total{' '}
                    <span className="font-semibold">{formatCurrency(Number(lastReceipt.total_amount))}</span>
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowReceiptModal(true)}
                className="border-green-300 text-green-700 hover:bg-green-100"
              >
                Print Receipt
              </Button>
            </div>
          )}

          <form onSubmit={handleCashierTransactionSubmit} className="space-y-6">
            {/* Customer + context */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <div className="flex flex-col lg:flex-row lg:items-end gap-4">
                <div className="flex-1 min-w-0">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Student</label>
                  {selectedStudent ? (
                    <div className="flex items-center justify-between rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2.5">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-sm font-semibold text-white">
                          {`${selectedStudent.first_name?.[0] ?? ''}${selectedStudent.last_name?.[0] ?? ''}`.toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-indigo-900">
                            {getStudentFullName(selectedStudent)}
                          </p>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-indigo-700/80">
                            {selectedStudent.lrn && <span>LRN: {selectedStudent.lrn}</span>}
                            {(cashierGradeLevel || cashierSection) && (
                              <>
                                {selectedStudent.lrn && <span className="text-indigo-300">•</span>}
                                <span>
                                  {[cashierGradeLevel, cashierSection].filter(Boolean).join(' — ')}
                                </span>
                              </>
                            )}
                            {cashierLedgerQuery.isFetching && !cashierGradeLevel && (
                              <span className="text-indigo-400">Loading…</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedStudent(null)
                          setStudentSearchTerm('')
                          setCashierLineAmounts({})
                          setCashierGeneralAmount('')
                        }}
                      >
                        Change
                      </Button>
                    </div>
                  ) : (
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
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3 lg:w-[320px] shrink-0">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Academic year</label>
                    <Select
                      value={cashierPaymentForm.academic_year}
                      onChange={(e) =>
                        setCashierPaymentForm((prev) => ({ ...prev, academic_year: e.target.value }))
                      }
                      options={academicYearOptions}
                      className="w-full"
                      disabled={createTransactionMutation.isPending}
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
                      disabled={createTransactionMutation.isPending}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Cart + checkout */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
              {/* Fees cart */}
              <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-gray-900">Fees to pay</h3>
                    {cashierLedgerQuery.isFetching && (
                      <span className="text-xs text-gray-400">Loading balances…</span>
                    )}
                  </div>
                  {selectedStudent && cashierFeeBreakdown.some((f) => f.outstanding > 0) && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setCashierLineAmounts((prev) => {
                          const next = { ...prev }
                          for (const fee of cashierFeeBreakdown) {
                            if (fee.outstanding > 0) next[fee.fee_id] = String(fee.outstanding)
                          }
                          return next
                        })
                      }
                      disabled={createTransactionMutation.isPending}
                    >
                      Pay all balances
                    </Button>
                  )}
                </div>

                {!selectedStudent ? (
                  <div className="px-5 py-16 text-center">
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-400">
                      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.5 20.25a7.5 7.5 0 0115 0v.75H4.5v-.75z" />
                      </svg>
                    </div>
                    <p className="text-sm font-medium text-gray-600">No student selected</p>
                    <p className="text-sm text-gray-400">Search for a student above to load their outstanding fees.</p>
                  </div>
                ) : cashierFeeBreakdown.length === 0 && !cashierLedgerQuery.isFetching ? (
                  <div className="px-5 py-12 text-center text-sm text-gray-500">
                    No fees charged for {cashierPaymentForm.academic_year}.
                    <br />
                    Use the <span className="font-medium">General / Other payment</span> field below.
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {cashierFeeBreakdown.map((fee) => {
                      const entered = Number(cashierLineAmounts[fee.fee_id]) || 0
                      const settled = fee.outstanding <= 0
                      return (
                        <div
                          key={fee.fee_id}
                          className="flex items-center gap-4 px-5 py-3 hover:bg-gray-50/60"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-gray-900">
                              {fee.fee_name}
                              {fee.is_additional && (
                                <span className="ml-1.5 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-500">
                                  Additional
                                </span>
                              )}
                            </p>
                            <p className="text-xs text-gray-500">
                              {settled ? (
                                <span className="text-green-600">Fully paid</span>
                              ) : (
                                <>Balance: <span className="font-medium text-gray-700">{formatCurrency(fee.outstanding)}</span></>
                              )}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <div className="relative">
                              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-400">₱</span>
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                value={cashierLineAmounts[fee.fee_id] ?? ''}
                                onChange={(e) =>
                                  setCashierLineAmounts((prev) => ({
                                    ...prev,
                                    [fee.fee_id]: e.target.value,
                                  }))
                                }
                                placeholder="0.00"
                                className={`w-32 pl-6 text-right ${entered > 0 ? 'border-indigo-300 ring-1 ring-indigo-100' : ''}`}
                                disabled={createTransactionMutation.isPending}
                              />
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setCashierLineAmounts((prev) => ({
                                  ...prev,
                                  [fee.fee_id]: fee.outstanding > 0 ? String(fee.outstanding) : '',
                                }))
                              }
                              disabled={fee.outstanding <= 0 || createTransactionMutation.isPending}
                              title="Pay full balance"
                            >
                              Full
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                <div className="border-t border-gray-100 px-5 py-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    General / Other payment <span className="font-normal text-gray-400">(optional)</span>
                  </label>
                  <div className="relative max-w-xs">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">₱</span>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={cashierGeneralAmount}
                      onChange={(e) => setCashierGeneralAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full pl-7"
                      disabled={createTransactionMutation.isPending}
                    />
                  </div>
                  <p className="mt-1 text-xs text-gray-400">
                    Not tied to a specific fee — reduces the overall balance.
                  </p>
                </div>
              </div>

              {/* Checkout summary */}
              <div className="lg:col-span-1 lg:sticky lg:top-6 bg-white rounded-xl border border-gray-200 shadow-sm">
                <div className="border-b border-gray-100 px-5 py-3.5">
                  <h3 className="text-sm font-semibold text-gray-900">Payment summary</h3>
                </div>
                <div className="space-y-4 px-5 py-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Mode of payment</label>
                    <Select
                      value={cashierPaymentForm.payment_method}
                      onChange={(e) =>
                        setCashierPaymentForm((prev) => ({ ...prev, payment_method: e.target.value }))
                      }
                      options={[
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
                      ]}
                      className="w-full"
                      disabled={createTransactionMutation.isPending}
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        OR number <span className="font-normal text-gray-400">(optional)</span>
                      </label>
                      <Input
                        value={cashierPaymentForm.or_number}
                        onChange={(e) =>
                          setCashierPaymentForm((prev) => ({ ...prev, or_number: e.target.value }))
                        }
                        placeholder="Official Receipt no."
                        disabled={createTransactionMutation.isPending}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Reference number <span className="font-normal text-gray-400">(optional)</span>
                      </label>
                      <Input
                        value={cashierPaymentForm.reference_number}
                        onChange={(e) =>
                          setCashierPaymentForm((prev) => ({ ...prev, reference_number: e.target.value }))
                        }
                        placeholder="e.g. check no., transaction id"
                        disabled={createTransactionMutation.isPending}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Remarks <span className="font-normal text-gray-400">(optional)</span>
                      </label>
                      <Input
                        value={cashierPaymentForm.remarks}
                        onChange={(e) =>
                          setCashierPaymentForm((prev) => ({ ...prev, remarks: e.target.value }))
                        }
                        placeholder="Optional notes"
                        disabled={createTransactionMutation.isPending}
                      />
                    </div>
                  </div>

                  <div className="rounded-lg bg-gray-50 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500">
                        {cashierLineItems.length} item{cashierLineItems.length === 1 ? '' : 's'}
                      </span>
                      <span className="text-xs text-gray-400">Total due</span>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm font-medium text-gray-700">Total to pay</span>
                      <span className="text-2xl font-bold text-gray-900 tabular-nums">
                        {formatCurrency(cashierTotal)}
                      </span>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Amount tendered</label>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">₱</span>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={cashierTendered}
                          onChange={(e) => setCashierTendered(e.target.value)}
                          placeholder="0.00"
                          className="w-full pl-7 text-right"
                          disabled={createTransactionMutation.isPending}
                        />
                      </div>
                    </div>
                    {cashierTendered && (
                      <div className="flex items-center justify-between border-t border-gray-200 pt-3">
                        <span className="text-sm font-medium text-gray-700">Change due</span>
                        <span
                          className={`text-lg font-bold tabular-nums ${
                            cashierTenderedValue < cashierTotal ? 'text-red-600' : 'text-green-700'
                          }`}
                        >
                          {cashierTenderedValue < cashierTotal
                            ? 'Insufficient'
                            : formatCurrency(cashierChangeDue)}
                        </span>
                      </div>
                    )}
                  </div>

                  {cashierError && <p className="text-sm text-red-600">{cashierError}</p>}

                  <Button
                    type="submit"
                    loading={createTransactionMutation.isPending}
                    disabled={!selectedStudent || cashierLineItems.length === 0}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
                  >
                    {createTransactionMutation.isPending
                      ? 'Recording...'
                      : `Record payment${cashierTotal > 0 ? ` · ${formatCurrency(cashierTotal)}` : ''}`}
                  </Button>
                </div>
              </div>
            </div>
          </form>

          {showReceiptModal && lastReceipt && selectedStudent && (
            <ReceiptPrintModal
              transaction={lastReceipt}
              studentName={getStudentFullName(selectedStudent)}
              studentLrn={selectedStudent.lrn}
              onClose={() => setShowReceiptModal(false)}
            />
          )}
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

                <div className="rounded-xl border border-gray-200 bg-white">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">Apply Discount</h3>
                      <p className="text-xs text-gray-500">
                        Add a one-off discount for this student for{' '}
                        <span className="font-medium">{ledgerAcademicYear}</span>.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowLedgerDiscount((prev) => !prev)}
                    >
                      {showLedgerDiscount ? 'Cancel' : 'New Discount'}
                    </Button>
                  </div>
                  {showLedgerDiscount && (
                    <form
                      className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4"
                      onSubmit={handleLedgerDiscountSubmit}
                    >
                      {defaultDiscountOptions.length > 0 && (
                        <div className="md:col-span-2">
                          <label className="block text-sm font-medium text-gray-700 mb-1.5">
                            Use a default discount
                          </label>
                          <Select
                            value={ledgerDiscountForm.default_discount_id}
                            onChange={(e) => handleSelectDefaultDiscount(e.target.value)}
                            options={[
                              { value: '', label: 'None — enter manually' },
                              ...defaultDiscountOptions.map((discount: DefaultDiscount) => ({
                                value: discount.id,
                                label:
                                  discount.discount_type === 'percentage'
                                    ? `${discount.name} (${Number(discount.value)}%)`
                                    : `${discount.name} (₱${Number(discount.value).toFixed(2)})`,
                              })),
                            ]}
                            className="w-full"
                          />
                          <p className="mt-1 text-xs text-gray-500">
                            Pick a saved discount to fill in the type and amount automatically. You can
                            still adjust the fields below.
                          </p>
                        </div>
                      )}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                          Discount Type
                        </label>
                        <Select
                          value={ledgerDiscountForm.discount_type}
                          onChange={(e) => {
                            const discountType = e.target.value as 'fixed' | 'percentage'
                            setLedgerDiscountForm((prev) => ({
                              ...prev,
                              default_discount_id: '',
                              discount_type: discountType,
                            }))
                            setLedgerDiscountAllocations((prev) => [
                              {
                                school_fee_id: prev[0]?.school_fee_id ?? '',
                                value: discountType === 'fixed' ? ledgerDiscountForm.value : '',
                              },
                            ])
                          }}
                          options={[
                            { value: 'fixed', label: 'Fixed Amount' },
                            { value: 'percentage', label: 'Percentage' },
                          ]}
                          className="w-full"
                        />
                      </div>
                      <Input
                        label={
                          ledgerDiscountForm.discount_type === 'percentage'
                            ? 'Percentage (%)'
                            : 'Discount Amount'
                        }
                        type="number"
                        min="0"
                        step="0.01"
                        value={ledgerDiscountForm.value}
                        onChange={(e) => {
                          const nextValue = e.target.value
                          setLedgerDiscountForm((prev) => ({
                            ...prev,
                            default_discount_id: '',
                            value: nextValue,
                          }))
                          setLedgerDiscountAllocations((prev) =>
                            prev.length === 1 ? [{ ...prev[0], value: nextValue }] : prev
                          )
                        }}
                      />
                      <div className="md:col-span-2">
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="block text-sm font-medium text-gray-700">
                            Apply To
                          </label>
                          {ledgerDiscountForm.discount_type === 'fixed' &&
                            ledgerDiscountAllocations.length > 1 && (
                              <span
                                className={`text-xs font-medium ${
                                  ledgerDiscountRemaining === 0
                                    ? 'text-green-600'
                                    : 'text-amber-600'
                                }`}
                              >
                                {ledgerDiscountRemaining === 0
                                  ? 'Fully allocated'
                                  : ledgerDiscountRemaining > 0
                                    ? `₱${ledgerDiscountRemaining.toFixed(2)} left to allocate`
                                    : `₱${Math.abs(ledgerDiscountRemaining).toFixed(2)} over the discount amount`}
                              </span>
                            )}
                        </div>
                        <div className="space-y-2">
                          {ledgerDiscountAllocations.map((allocation, index) => (
                            <div key={index} className="flex items-center gap-2">
                              <Select
                                value={allocation.school_fee_id}
                                onChange={(e) =>
                                  setLedgerDiscountAllocations((prev) =>
                                    prev.map((row, i) =>
                                      i === index ? { ...row, school_fee_id: e.target.value } : row
                                    )
                                  )
                                }
                                options={[
                                  { value: '', label: 'All charges (whole year)' },
                                  ...(feesQuery.data?.data || []).map((fee: SchoolFee) => ({
                                    value: fee.id,
                                    label: fee.name,
                                  })),
                                ]}
                                className="w-full"
                              />
                              {ledgerDiscountAllocations.length > 1 && (
                                <>
                                  <div className="w-40 shrink-0">
                                    <Input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      placeholder="Amount"
                                      value={allocation.value}
                                      onChange={(e) =>
                                        setLedgerDiscountAllocations((prev) =>
                                          prev.map((row, i) =>
                                            i === index ? { ...row, value: e.target.value } : row
                                          )
                                        )
                                      }
                                    />
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setLedgerDiscountAllocations((prev) => {
                                        const next = prev.filter((_, i) => i !== index)
                                        return next.length === 1
                                          ? [{ ...next[0], value: ledgerDiscountForm.value }]
                                          : next
                                      })
                                    }
                                    className="p-2 text-gray-400 hover:text-red-600 shrink-0"
                                    aria-label="Remove this allocation"
                                  >
                                    <TrashIcon className="w-4 h-4" />
                                  </button>
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                        {ledgerDiscountForm.discount_type === 'fixed' && (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                setLedgerDiscountAllocations((prev) => [
                                  ...prev,
                                  {
                                    school_fee_id: '',
                                    value:
                                      ledgerDiscountRemaining > 0
                                        ? ledgerDiscountRemaining.toFixed(2)
                                        : '',
                                  },
                                ])
                              }
                              className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-700"
                            >
                              <PlusIcon className="w-4 h-4" />
                              Add another fee
                            </button>
                            {ledgerDiscountAllocations.length > 1 && (
                              <p className="mt-1 text-xs text-gray-500">
                                Split the discount across the selected fees. The amounts must add
                                up to the total discount amount.
                              </p>
                            )}
                          </>
                        )}
                      </div>
                      <Input
                        label="Description (optional)"
                        value={ledgerDiscountForm.description}
                        onChange={(e) =>
                          setLedgerDiscountForm((prev) => ({
                            ...prev,
                            description: e.target.value,
                          }))
                        }
                        placeholder="e.g. Sibling discount, Scholarship"
                      />
                      {ledgerDiscountError && (
                        <p className="md:col-span-2 text-sm text-red-600">{ledgerDiscountError}</p>
                      )}
                      <div className="md:col-span-2 flex justify-end">
                        <Button
                          type="submit"
                          loading={createLedgerDiscountMutation.isPending}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white"
                        >
                          Save Discount
                        </Button>
                      </div>
                    </form>
                  )}
                </div>

                <div className="rounded-xl border border-gray-200 bg-white">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                        <PlusIcon className="w-4 h-4 text-indigo-600" />
                        Additional Fees
                      </h3>
                      <p className="text-xs text-gray-500">
                        Extra fees specific to this student for{' '}
                        <span className="font-medium">{ledgerAcademicYear}</span>, beyond the standard
                        grade-level fees.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowLedgerAdditionalFee((prev) => !prev)}
                    >
                      {showLedgerAdditionalFee ? 'Cancel' : 'New Fee'}
                    </Button>
                  </div>
                  {showLedgerAdditionalFee && (
                    <form
                      className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-4"
                      onSubmit={handleLedgerAdditionalFeeSubmit}
                    >
                      <Input
                        label="Fee Name"
                        value={ledgerAdditionalFeeForm.name}
                        onChange={(e) =>
                          setLedgerAdditionalFeeForm((prev) => ({ ...prev, name: e.target.value }))
                        }
                        placeholder="e.g. Lab Fee, Field Trip"
                      />
                      <Input
                        label="Amount (PHP)"
                        type="number"
                        min="0"
                        step="0.01"
                        value={ledgerAdditionalFeeForm.amount}
                        onChange={(e) =>
                          setLedgerAdditionalFeeForm((prev) => ({ ...prev, amount: e.target.value }))
                        }
                        placeholder="0.00"
                      />
                      <Input
                        label="Description (optional)"
                        value={ledgerAdditionalFeeForm.description}
                        onChange={(e) =>
                          setLedgerAdditionalFeeForm((prev) => ({ ...prev, description: e.target.value }))
                        }
                        placeholder="Optional note"
                      />
                      {ledgerAdditionalFeeError && (
                        <p className="sm:col-span-3 text-sm text-red-600">{ledgerAdditionalFeeError}</p>
                      )}
                      <div className="sm:col-span-3 flex justify-end">
                        <Button
                          type="submit"
                          loading={createLedgerAdditionalFeeMutation.isPending}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white"
                        >
                          Add Additional Fee
                        </Button>
                      </div>
                    </form>
                  )}
                  {(ledgerAdditionalFeesQuery.data?.data?.length ?? 0) > 0 && (
                    <div className="px-4 pb-4 overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase w-20">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 bg-white">
                          {ledgerAdditionalFeesQuery.data?.data?.map((fee) => (
                            <tr key={fee.id}>
                              <td className="px-4 py-2 text-sm font-medium text-gray-900">{fee.name}</td>
                              <td className="px-4 py-2 text-sm text-right text-gray-900 tabular-nums">
                                {formatCurrency(fee.amount)}
                              </td>
                              <td className="px-4 py-2 text-sm text-gray-600">{fee.description || '—'}</td>
                              <td className="px-4 py-2">
                                <div className="flex justify-end">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      if (window.confirm('Remove this additional fee?')) {
                                        deleteLedgerAdditionalFeeMutation.mutate(fee.id)
                                      }
                                    }}
                                    className="text-red-600 border-red-200 hover:bg-red-50"
                                    title="Remove fee"
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

                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-semibold text-gray-900">Ledger View</h3>
                    <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setLedgerViewMode('entries')}
                        className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                          ledgerViewMode === 'entries'
                            ? 'bg-indigo-600 text-white'
                            : 'bg-white text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        Entries
                      </button>
                      <button
                        type="button"
                        onClick={() => setLedgerViewMode('monthly')}
                        className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                          ledgerViewMode === 'monthly'
                            ? 'bg-indigo-600 text-white'
                            : 'bg-white text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        Monthly
                      </button>
                      <button
                        type="button"
                        onClick={() => setLedgerViewMode('quarterly')}
                        className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                          ledgerViewMode === 'quarterly'
                            ? 'bg-indigo-600 text-white'
                            : 'bg-white text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        Quarterly
                      </button>
                    </div>
                  </div>

                  {ledgerViewMode === 'entries' && (
                    <>
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
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                              OR Number
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                              Amount
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                              Running Balance
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                              Processed By
                            </th>
                            {canRequestVoid && (
                              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                                Action
                              </th>
                            )}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 bg-white">
                          {ledgerQuery.data?.data?.entries?.map((entry, index) => (
                            <tr
                              key={
                                `${entry.type}-${entry.payment_id ?? entry.discount_id ?? entry.fee_id ?? index}`
                              }
                              className={entry.voided ? 'bg-gray-50' : undefined}
                            >
                              <td className="px-4 py-3 text-sm text-gray-600 capitalize">
                                {entry.type.replace('_', ' ')}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-700">
                                <span className={entry.voided ? 'line-through text-gray-400' : undefined}>
                                  {entry.description}
                                </span>
                                {entry.voided && (
                                  <span
                                    className="ml-2 inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-red-700"
                                    title={entry.void_note ? `Reason: ${entry.void_note}${entry.voided_by ? ` — by ${entry.voided_by}` : ''}` : 'Voided'}
                                  >
                                    Voided
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-600">
                                {entry.date ?? '—'}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-600 font-mono">
                                {entry.or_number ?? '—'}
                              </td>
                              <td
                                className={`px-4 py-3 text-sm text-right tabular-nums ${
                                  entry.voided
                                    ? 'text-gray-400 line-through'
                                    : entry.amount < 0
                                    ? 'text-red-600'
                                    : 'text-gray-900'
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
                              <td className="px-4 py-3 text-sm text-gray-600">
                                {entry.processed_by ?? '—'}
                              </td>
                              {canRequestVoid && (
                                <td className="px-4 py-3 text-sm text-right">
                                  {entry.type === 'payment' && !entry.voided && entry.receipt_number ? (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setVoidEntry(entry)
                                        setVoidNote('')
                                      }}
                                      className="text-red-600 hover:text-red-700 font-medium"
                                    >
                                      Void
                                    </button>
                                  ) : entry.type === 'discount' &&
                                    !entry.voided &&
                                    entry.discount_id &&
                                    entry.discount_scope === 'student' ? (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setVoidDiscountEntry(entry)
                                        setVoidDiscountNote('')
                                      }}
                                      className="text-red-600 hover:text-red-700 font-medium"
                                    >
                                      Void
                                    </button>
                                  ) : (
                                    <span className="text-gray-300">—</span>
                                  )}
                                </td>
                              )}
                            </tr>
                          ))}
                          {!ledgerQuery.data?.data?.entries?.length && (
                            <tr>
                              <td
                                colSpan={canRequestVoid ? 8 : 7}
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
                    </>
                  )}

                  {(ledgerViewMode === 'monthly' || ledgerViewMode === 'quarterly') && (() => {
                    const totals = ledgerQuery.data?.data?.totals
                    const totalPayable = (totals?.balance_forward ?? 0) + (totals?.charges ?? 0) - (totals?.discounts ?? 0)
                    const startYear = Number(ledgerAcademicYear.split('-')[0]) || currentYear

                    const schoolMonths = [
                      { month: 6, year: startYear, label: 'June' },
                      { month: 7, year: startYear, label: 'July' },
                      { month: 8, year: startYear, label: 'August' },
                      { month: 9, year: startYear, label: 'September' },
                      { month: 10, year: startYear, label: 'October' },
                      { month: 11, year: startYear, label: 'November' },
                      { month: 12, year: startYear, label: 'December' },
                      { month: 1, year: startYear + 1, label: 'January' },
                      { month: 2, year: startYear + 1, label: 'February' },
                      { month: 3, year: startYear + 1, label: 'March' },
                    ]

                    const payments = ledgerQuery.data?.data?.entries?.filter(
                      (e) => e.type === 'payment'
                    ) || []

                    const paidByMonth: Record<string, number> = {}
                    for (const p of payments) {
                      if (!p.date) continue
                      const d = new Date(p.date)
                      const key = `${d.getMonth() + 1}-${d.getFullYear()}`
                      paidByMonth[key] = (paidByMonth[key] ?? 0) + Math.abs(p.amount)
                    }

                    if (ledgerViewMode === 'monthly') {
                      const monthlyDue = totalPayable > 0 ? totalPayable / 10 : 0
                      let cumulativeDue = 0
                      let cumulativePaid = 0

                      const rows = schoolMonths.map((sm) => {
                        const key = `${sm.month}-${sm.year}`
                        const paid = paidByMonth[key] ?? 0
                        cumulativeDue += monthlyDue
                        cumulativePaid += paid
                        const remaining = Math.max(cumulativeDue - cumulativePaid, 0)
                        return { ...sm, due: monthlyDue, paid, cumulativeDue, cumulativePaid, remaining }
                      })

                      return (
                        <div className="space-y-4">
                          <div className="flex items-center gap-4 text-sm text-gray-600">
                            <span>Total Payable: <strong className="text-gray-900">{formatCurrency(totalPayable)}</strong></span>
                            <span>Monthly Due: <strong className="text-gray-900">{formatCurrency(monthlyDue)}</strong></span>
                          </div>
                          <div className="overflow-x-auto rounded-lg border border-gray-200">
                            <table className="min-w-full divide-y divide-gray-200">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Month</th>
                                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Monthly Due</th>
                                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Paid</th>
                                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Cumulative Due</th>
                                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Cumulative Paid</th>
                                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Remaining</th>
                                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200 bg-white">
                                {rows.map((r) => {
                                  const isFullyPaid = r.cumulativePaid >= r.cumulativeDue - 0.01
                                  return (
                                    <tr key={`${r.month}-${r.year}`} className="hover:bg-gray-50/50">
                                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{r.label} {r.year}</td>
                                      <td className="px-4 py-3 text-sm text-right text-gray-900 tabular-nums">{formatCurrency(r.due)}</td>
                                      <td className="px-4 py-3 text-sm text-right text-gray-900 tabular-nums">{formatCurrency(r.paid)}</td>
                                      <td className="px-4 py-3 text-sm text-right text-gray-600 tabular-nums">{formatCurrency(r.cumulativeDue)}</td>
                                      <td className="px-4 py-3 text-sm text-right text-gray-600 tabular-nums">{formatCurrency(r.cumulativePaid)}</td>
                                      <td className="px-4 py-3 text-sm text-right font-medium tabular-nums text-gray-900">{formatCurrency(r.remaining)}</td>
                                      <td className="px-4 py-3 text-center">
                                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                                          isFullyPaid
                                            ? 'bg-green-100 text-green-700'
                                            : r.paid > 0
                                              ? 'bg-yellow-100 text-yellow-700'
                                              : 'bg-gray-100 text-gray-500'
                                        }`}>
                                          {isFullyPaid ? 'Paid' : r.paid > 0 ? 'Partial' : 'Unpaid'}
                                        </span>
                                      </td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                              <tfoot className="bg-gray-50">
                                <tr className="font-semibold">
                                  <td className="px-4 py-3 text-sm text-gray-900">Total</td>
                                  <td className="px-4 py-3 text-sm text-right text-gray-900 tabular-nums">{formatCurrency(totalPayable)}</td>
                                  <td className="px-4 py-3 text-sm text-right text-gray-900 tabular-nums">
                                    {formatCurrency(rows.reduce((s, r) => s + r.paid, 0))}
                                  </td>
                                  <td colSpan={2} />
                                  <td className="px-4 py-3 text-sm text-right text-gray-900 tabular-nums">
                                    {formatCurrency(Math.max(totalPayable - rows.reduce((s, r) => s + r.paid, 0), 0))}
                                  </td>
                                  <td />
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        </div>
                      )
                    }

                    const quarters = [
                      { label: 'Q1 (Jun–Aug)', monthIndices: [0, 1, 2] },
                      { label: 'Q2 (Sep–Nov)', monthIndices: [3, 4, 5] },
                      { label: 'Q3 (Dec–Feb)', monthIndices: [6, 7, 8] },
                      { label: 'Q4 (Mar)', monthIndices: [9] },
                    ]

                    const quarterlyDues = [
                      totalPayable * 3 / 10,
                      totalPayable * 3 / 10,
                      totalPayable * 3 / 10,
                      totalPayable * 1 / 10,
                    ]

                    let qCumulativeDue = 0
                    let qCumulativePaid = 0

                    const qRows = quarters.map((q, qi) => {
                      let paid = 0
                      for (const idx of q.monthIndices) {
                        const sm = schoolMonths[idx]
                        const key = `${sm.month}-${sm.year}`
                        paid += paidByMonth[key] ?? 0
                      }
                      const due = quarterlyDues[qi]
                      qCumulativeDue += due
                      qCumulativePaid += paid
                      const remaining = Math.max(qCumulativeDue - qCumulativePaid, 0)
                      return { ...q, due, paid, cumulativeDue: qCumulativeDue, cumulativePaid: qCumulativePaid, remaining }
                    })

                    return (
                      <div className="space-y-4">
                        <div className="flex items-center gap-4 text-sm text-gray-600">
                          <span>Total Payable: <strong className="text-gray-900">{formatCurrency(totalPayable)}</strong></span>
                          <span>Quarterly breakdown is proportional to months in each quarter (3-3-3-1).</span>
                        </div>
                        <div className="overflow-x-auto rounded-lg border border-gray-200">
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Quarter</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Quarterly Due</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Paid</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Cumulative Due</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Cumulative Paid</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Remaining</th>
                                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 bg-white">
                              {qRows.map((r, idx) => {
                                const isFullyPaid = r.cumulativePaid >= r.cumulativeDue - 0.01
                                return (
                                  <tr key={idx} className="hover:bg-gray-50/50">
                                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{r.label}</td>
                                    <td className="px-4 py-3 text-sm text-right text-gray-900 tabular-nums">{formatCurrency(r.due)}</td>
                                    <td className="px-4 py-3 text-sm text-right text-gray-900 tabular-nums">{formatCurrency(r.paid)}</td>
                                    <td className="px-4 py-3 text-sm text-right text-gray-600 tabular-nums">{formatCurrency(r.cumulativeDue)}</td>
                                    <td className="px-4 py-3 text-sm text-right text-gray-600 tabular-nums">{formatCurrency(r.cumulativePaid)}</td>
                                    <td className="px-4 py-3 text-sm text-right font-medium tabular-nums text-gray-900">{formatCurrency(r.remaining)}</td>
                                    <td className="px-4 py-3 text-center">
                                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                                        isFullyPaid
                                          ? 'bg-green-100 text-green-700'
                                          : r.paid > 0
                                            ? 'bg-yellow-100 text-yellow-700'
                                            : 'bg-gray-100 text-gray-500'
                                      }`}>
                                        {isFullyPaid ? 'Paid' : r.paid > 0 ? 'Partial' : 'Unpaid'}
                                      </span>
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                            <tfoot className="bg-gray-50">
                              <tr className="font-semibold">
                                <td className="px-4 py-3 text-sm text-gray-900">Total</td>
                                <td className="px-4 py-3 text-sm text-right text-gray-900 tabular-nums">{formatCurrency(totalPayable)}</td>
                                <td className="px-4 py-3 text-sm text-right text-gray-900 tabular-nums">
                                  {formatCurrency(qRows.reduce((s, r) => s + r.paid, 0))}
                                </td>
                                <td colSpan={2} />
                                <td className="px-4 py-3 text-sm text-right text-gray-900 tabular-nums">
                                  {formatCurrency(Math.max(totalPayable - qRows.reduce((s, r) => s + r.paid, 0), 0))}
                                </td>
                                <td />
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              </>
            )}

            {!selectedLedgerStudent && (
              <p className="text-sm text-gray-500">Select a student above to view their ledger.</p>
            )}
          </div>
        </div>
      )}
      {view === 'collections' && (
        <CollectionsView
          academicYearOptions={academicYearOptions}
          defaultAcademicYear={defaultAcademicYear}
        />
      )}

      {view === 'discounts' && (
        <DiscountsView
          academicYearOptions={academicYearOptions}
          defaultAcademicYear={defaultAcademicYear}
          gradeLevelOptions={gradeLevelOptions}
          fees={fees}
        />
      )}

      {view === 'default-discounts' && <DefaultDiscountsView />}

      {view === 'receipt-builder' && <ReceiptBuilderView />}

      {view === 'void-requests' && canRequestVoid && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Payment Void Requests</h2>
              <p className="text-sm text-gray-500">
                {isVoidApprover
                  ? 'Review and approve or disapprove void requests submitted by finance.'
                  : 'Track the status of payment void requests you have submitted.'}
              </p>
            </div>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              {(['pending', 'approved', 'disapproved'] as PaymentVoidStatus[]).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setVoidStatusFilter(status)}
                  className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                    voidStatusFilter === status
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Receipt</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Student</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reason</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Requested By</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  {isVoidApprover && (
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Action</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {voidRequestsQuery.isLoading && (
                  <tr>
                    <td colSpan={isVoidApprover ? 7 : 6} className="px-4 py-8 text-center text-gray-500">
                      Loading void requests...
                    </td>
                  </tr>
                )}
                {!voidRequestsQuery.isLoading &&
                  voidRequestsQuery.data?.data?.map((req) => {
                    const studentName = req.student
                      ? `${req.student.first_name} ${req.student.last_name}`
                      : '—'
                    const requesterName = req.requester
                      ? `${req.requester.first_name} ${req.requester.last_name}`
                      : '—'
                    return (
                      <tr key={req.id}>
                        <td className="px-4 py-3 text-sm font-mono text-gray-700">{req.receipt_number}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{studentName}</td>
                        <td className="px-4 py-3 text-sm text-right tabular-nums text-gray-900">
                          ₱ {Number(req.amount).toLocaleString('en-PH', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 max-w-xs">
                          <span title={req.request_note}>{req.request_note}</span>
                          {req.review_note && (
                            <span className="block text-xs text-gray-400 mt-1">
                              Review: {req.review_note}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">{requesterName}</td>
                        <td className="px-4 py-3 text-sm">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${
                              req.status === 'approved'
                                ? 'bg-green-100 text-green-700'
                                : req.status === 'disapproved'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-amber-100 text-amber-700'
                            }`}
                          >
                            {req.status}
                          </span>
                        </td>
                        {isVoidApprover && (
                          <td className="px-4 py-3 text-sm text-right whitespace-nowrap">
                            {req.status === 'pending' ? (
                              <div className="flex justify-end gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={() => approveVoidMutation.mutate(req.id)}
                                  loading={approveVoidMutation.isPending}
                                  className="bg-green-600 hover:bg-green-700 text-white"
                                >
                                  Approve
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setDisapproveTarget(req.id)
                                    setDisapproveNote('')
                                  }}
                                >
                                  Disapprove
                                </Button>
                              </div>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                        )}
                      </tr>
                    )
                  })}
                {!voidRequestsQuery.isLoading && !voidRequestsQuery.data?.data?.length && (
                  <tr>
                    <td colSpan={isVoidApprover ? 7 : 6} className="px-4 py-8 text-center text-gray-500">
                      No {voidStatusFilter} void requests.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Void request modal (from the ledger) */}
      {voidEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
            <form onSubmit={handleVoidSubmit}>
              <div className="px-5 py-4 border-b border-gray-100">
                <h3 className="text-base font-semibold text-gray-900">Void Payment</h3>
                <p className="text-sm text-gray-500 mt-1">
                  {isVoidApprover
                    ? 'This will void the payment immediately. A note is required.'
                    : 'This submits a void request for admin approval. A note is required.'}
                </p>
              </div>
              <div className="px-5 py-4 space-y-3">
                <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Receipt</span>
                    <span className="font-mono">{voidEntry.receipt_number}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Amount</span>
                    <span className="tabular-nums">
                      ₱ {Math.abs(Number(voidEntry.amount)).toLocaleString('en-PH', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Reason / Note <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={voidNote}
                    onChange={(e) => setVoidNote(e.target.value)}
                    rows={3}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                    placeholder="e.g. Duplicate entry, wrong amount, payment reversed"
                  />
                </div>
              </div>
              <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setVoidEntry(null)
                    setVoidNote('')
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  loading={createVoidMutation.isPending}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  {isVoidApprover ? 'Void Payment' : 'Submit Request'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Void discount modal (from the ledger) */}
      {voidDiscountEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
            <form onSubmit={handleVoidDiscountSubmit}>
              <div className="px-5 py-4 border-b border-gray-100">
                <h3 className="text-base font-semibold text-gray-900">Void Discount</h3>
                <p className="text-sm text-gray-500 mt-1">
                  This will void the discount immediately and add it back to the balance. The entry
                  stays on the ledger for audit. A note is required.
                </p>
              </div>
              <div className="px-5 py-4 space-y-3">
                <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
                  <div className="flex justify-between gap-3">
                    <span className="text-gray-500">Discount</span>
                    <span className="text-right">{voidDiscountEntry.description}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Amount</span>
                    <span className="tabular-nums">
                      ₱ {Math.abs(Number(voidDiscountEntry.amount)).toLocaleString('en-PH', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Reason / Note <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={voidDiscountNote}
                    onChange={(e) => setVoidDiscountNote(e.target.value)}
                    rows={3}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                    placeholder="e.g. Applied in error, wrong amount, not eligible"
                  />
                </div>
              </div>
              <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setVoidDiscountEntry(null)
                    setVoidDiscountNote('')
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  loading={voidDiscountMutation.isPending}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  Void Discount
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Disapprove modal */}
      {disapproveTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (!disapproveNote.trim()) {
                  toast.error('A reason is required to disapprove.')
                  return
                }
                disapproveVoidMutation.mutate({ id: disapproveTarget, review_note: disapproveNote.trim() })
              }}
            >
              <div className="px-5 py-4 border-b border-gray-100">
                <h3 className="text-base font-semibold text-gray-900">Disapprove Void Request</h3>
                <p className="text-sm text-gray-500 mt-1">
                  The payment will remain active. Provide a reason for the requester.
                </p>
              </div>
              <div className="px-5 py-4">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Reason <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={disapproveNote}
                  onChange={(e) => setDisapproveNote(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                  placeholder="e.g. Payment is valid, please verify with the receipt"
                />
              </div>
              <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setDisapproveTarget(null)
                    setDisapproveNote('')
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  loading={disapproveVoidMutation.isPending}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  Disapprove
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </motion.div>
  )
}

export default Finance
