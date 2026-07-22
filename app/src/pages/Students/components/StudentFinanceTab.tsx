import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PDFDownloadLink } from '@react-pdf/renderer'
import {
  ArrowUpTrayIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
  ClockIcon,
  CreditCardIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  PencilSquareIcon,
} from '@heroicons/react/24/outline'
import { toast } from 'react-hot-toast'
import { Button } from '../../../components/button'
import { Input } from '../../../components/input'
import { Select } from '../../../components/select'
import { useAuth } from '../../../hooks/useAuth'
import { studentFinanceService } from '../../../services/studentFinanceService'
import { paymentPlanService } from '../../../services/paymentPlanService'
import { studentOnlinePaymentService } from '../../../services/studentOnlinePaymentService'
import { paymentReceiptService } from '../../../services/paymentReceiptService'
import { StudentNOAPDF } from '../../../components/StudentNOAPDF'
import type {
  CreateStudentOnlinePaymentCheckoutData,
  PaymentPlan,
  PaymentReceiptSubmission,
  Student,
} from '../../../types'

interface StudentFinanceTabProps {
  student: Student
  studentId: string
}

// Temporarily hidden; flip back to true to restore the Pay Online (Maya Checkout) form.
const SHOW_PAY_ONLINE_SECTION = false

// Temporarily hidden; flip back to true to restore the per-installment Pay button.
const SHOW_PAY_INSTALLMENT_BUTTON = false

export const StudentFinanceTab: React.FC<StudentFinanceTabProps> = ({ student, studentId }) => {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const currentYear = new Date().getFullYear()
  const fallbackAcademicYear = `${currentYear}-${currentYear + 1}`
  const roleSlug = user?.role?.slug
  const isStudentUser = roleSlug === 'student'

  const [selectedAcademicYear, setSelectedAcademicYear] = useState<string>('')
  const [onlinePaymentAmount, setOnlinePaymentAmount] = useState('')
  const [onlinePaymentError, setOnlinePaymentError] = useState<string | null>(null)
  const [onlinePaymentMessage, setOnlinePaymentMessage] = useState<string | null>(null)
  const [showPlanOverride, setShowPlanOverride] = useState(false)
  const [payingInstallment, setPayingInstallment] = useState<number | null>(null)
  const receiptFileInputRef = useRef<HTMLInputElement | null>(null)
  const [receiptUploadTarget, setReceiptUploadTarget] = useState<{
    sequence: number
    label: string
  } | null>(null)

  const activePlansQuery = useQuery({
    queryKey: ['active-payment-plans'],
    queryFn: () => paymentPlanService.getPlans({ is_active: true }),
    enabled: Boolean(studentId),
  })
  const activePlans = activePlansQuery.data?.data || []

  const ledgerQuery = useQuery({
    queryKey: ['student-ledger', studentId, selectedAcademicYear || 'auto'],
    queryFn: () => studentFinanceService.getLedger(studentId, selectedAcademicYear || undefined),
    enabled: Boolean(studentId),
  })

  const ledgerData = ledgerQuery.data?.data
  const resolvedAcademicYear =
    selectedAcademicYear || ledgerData?.academic_year || fallbackAcademicYear

  const noaQuery = useQuery({
    queryKey: ['student-noa', studentId, resolvedAcademicYear],
    queryFn: () => studentFinanceService.getNoticeOfAccount(studentId, resolvedAcademicYear),
    enabled: Boolean(studentId && resolvedAcademicYear),
  })

  const onlinePaymentsQuery = useQuery({
    queryKey: ['student-online-payments', studentId, resolvedAcademicYear],
    queryFn: () =>
      studentOnlinePaymentService.getTransactions({
        academic_year: resolvedAcademicYear,
      }),
    enabled: Boolean(studentId && resolvedAcademicYear && isStudentUser),
  })

  const receiptSubmissionsQuery = useQuery({
    queryKey: ['payment-receipt-submissions', studentId, resolvedAcademicYear],
    queryFn: () => paymentReceiptService.list({ academic_year: resolvedAcademicYear }),
    enabled: Boolean(studentId && resolvedAcademicYear && isStudentUser),
  })

  const planHistoryQuery = useQuery({
    queryKey: ['payment-plan-changes', studentId, resolvedAcademicYear],
    queryFn: () =>
      paymentPlanService.getChangeHistory({
        student_id: studentId,
        academic_year: resolvedAcademicYear,
      }),
    enabled: Boolean(studentId && resolvedAcademicYear && !isStudentUser),
  })
  const planHistory = planHistoryQuery.data?.data || []

  useEffect(() => {
    if (!selectedAcademicYear && ledgerData?.academic_year) {
      setSelectedAcademicYear(ledgerData.academic_year)
    }
  }, [ledgerData?.academic_year, selectedAcademicYear])

  useEffect(() => {
    if (!isStudentUser) return

    const params = new URLSearchParams(window.location.search)
    const paymentResult = params.get('payment_result')
    if (!paymentResult) return

    const invalidateAll = () => {
      queryClient.invalidateQueries({ queryKey: ['student-online-payments', studentId] })
      queryClient.invalidateQueries({ queryKey: ['student-ledger', studentId] })
      queryClient.invalidateQueries({ queryKey: ['student-noa', studentId] })
    }

    if (paymentResult === 'success') {
      setOnlinePaymentMessage('Payment completed. We are syncing your ledger now.')
      setOnlinePaymentError(null)
    } else if (paymentResult === 'failure') {
      setOnlinePaymentError('Payment failed. You may retry the checkout.')
      setOnlinePaymentMessage(null)
    } else if (paymentResult === 'cancel') {
      setOnlinePaymentMessage('Payment was cancelled.')
      setOnlinePaymentError(null)
    }

    const pendingId = sessionStorage.getItem('pendingMayaTransactionId')
    if (pendingId) {
      sessionStorage.removeItem('pendingMayaTransactionId')
      const outcome =
        paymentResult === 'failure'
          ? 'failed'
          : paymentResult === 'cancel'
            ? 'cancelled'
            : null

      const work = outcome
        ? studentOnlinePaymentService.recordOutcome(pendingId, outcome).catch(() => undefined)
        : studentOnlinePaymentService.getTransaction(pendingId).catch(() => undefined)

      work.finally(invalidateAll)
    } else {
      invalidateAll()
    }
  }, [isStudentUser, queryClient, studentId])

  useEffect(() => {
    if (!isStudentUser) return
    if (onlinePaymentAmount) return

    const balance = Number(ledgerData?.totals?.balance ?? 0)
    if (balance > 0) {
      setOnlinePaymentAmount(balance.toFixed(2))
    }
  }, [isStudentUser, ledgerData?.totals?.balance, onlinePaymentAmount])

  const academicYearOptions = useMemo(() => {
    const years = ledgerData?.available_academic_years?.length
      ? ledgerData.available_academic_years
      : [fallbackAcademicYear]
    return years.map((year) => ({ value: year, label: year }))
  }, [ledgerData?.available_academic_years, fallbackAcademicYear])

  const createOnlinePaymentMutation = useMutation({
    mutationFn: (payload: CreateStudentOnlinePaymentCheckoutData) =>
      studentOnlinePaymentService.createCheckout(payload),
    onSuccess: (response) => {
      setOnlinePaymentError(null)
      setOnlinePaymentMessage('Redirecting to Maya Checkout...')
      const redirectUrl = response.data.redirect_url || response.data.checkout_url
      if (redirectUrl) {
        const transactionId = response.data?.id
        if (transactionId) {
          sessionStorage.setItem('pendingMayaTransactionId', transactionId)
        }
        window.location.href = redirectUrl
      } else {
        setOnlinePaymentError('Checkout created but no redirect URL was returned.')
      }
    },
    onError: (error: any) => {
      setOnlinePaymentError(error.response?.data?.message || 'Failed to create online checkout.')
      setOnlinePaymentMessage(null)
    },
  })

  const setPaymentPlanMutation = useMutation({
    mutationFn: (paymentPlanId: string) =>
      studentFinanceService.setPaymentPlan(studentId, {
        academic_year: resolvedAcademicYear,
        payment_plan_id: paymentPlanId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['student-ledger', studentId] })
      queryClient.invalidateQueries({ queryKey: ['student-noa', studentId] })
      queryClient.invalidateQueries({ queryKey: ['payment-plan-changes', studentId] })
      toast.success('Payment plan saved.')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to save payment plan.')
    },
  })

  const uploadReceiptMutation = useMutation({
    mutationFn: (payload: { sequence: number; label: string; file: File }) =>
      paymentReceiptService.upload({
        academic_year: resolvedAcademicYear,
        installment_sequence: payload.sequence,
        installment_label: payload.label,
        file: payload.file,
      }),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['payment-receipt-submissions', studentId] })
      toast.success(response.message || 'Receipt uploaded. It will be reviewed by the finance office.')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to upload receipt.')
    },
    onSettled: () => setReceiptUploadTarget(null),
  })

  const handleUploadReceiptClick = (installment: { sequence: number; label: string }) => {
    setReceiptUploadTarget({ sequence: installment.sequence, label: installment.label })
    receiptFileInputRef.current?.click()
  }

  const handleReceiptFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !receiptUploadTarget) return
    uploadReceiptMutation.mutate({ ...receiptUploadTarget, file })
  }

  const formatAmount = (amount?: number | null) => {
    const value = Number(amount || 0)
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)
  }

  const studentFullName = [student.first_name, student.last_name]
    .map((part) => (part || '').trim())
    .filter(Boolean)
    .join(' ')

  const startMayaCheckout = (
    amount: number,
    extras?: {
      item_name?: string
      item_description?: string
      original_amount?: number
      discount_amount?: number
    }
  ) => {
    const basePath = `${window.location.origin}${window.location.pathname}`
    createOnlinePaymentMutation.mutate({
      academic_year: resolvedAcademicYear,
      amount,
      ...(extras?.item_name ? { item_name: extras.item_name } : {}),
      ...(extras?.item_description ? { item_description: extras.item_description } : {}),
      ...(extras?.original_amount !== undefined ? { original_amount: extras.original_amount } : {}),
      ...(extras?.discount_amount !== undefined ? { discount_amount: extras.discount_amount } : {}),
      redirect_url: {
        success: `${basePath}?payment_result=success`,
        failure: `${basePath}?payment_result=failure`,
        cancel: `${basePath}?payment_result=cancel`,
      },
    })
  }

  const buildInstallmentItemName = (installment: { label: string; due_date: string }) => {
    const planName = paymentPlan?.name ? `${paymentPlan.name} ` : ''
    return `${planName}${installment.label} Payment`.trim()
  }

  const handlePayInstallment = (installment: {
    sequence: number
    label: string
    due_date: string
    amount: number
    original_amount?: number
    discount_amount?: number
  }) => {
    setOnlinePaymentError(null)
    setOnlinePaymentMessage(null)

    const { sequence, amount } = installment
    if (!amount || amount <= 0) {
      setOnlinePaymentError('Installment amount must be greater than zero.')
      return
    }

    const currentBalance = Number(ledgerData?.totals?.balance ?? 0)
    if (currentBalance <= 0) {
      setOnlinePaymentError('Your balance is already settled.')
      return
    }
    if (amount > currentBalance) {
      setOnlinePaymentError(
        `Installment exceeds remaining balance (${new Intl.NumberFormat('en-PH', {
          style: 'currency',
          currency: 'PHP',
        }).format(currentBalance)}). Use the Pay Online form to pay a partial amount.`
      )
      return
    }

    // Forward the discount breakdown only when paying the full installment
    // amount (so Maya's reconciliation: subtotal - discount == amount holds).
    const original = installment.original_amount
    const discount = installment.discount_amount
    const includeBreakdown =
      typeof original === 'number' &&
      typeof discount === 'number' &&
      discount > 0 &&
      Math.abs(original - discount - amount) < 0.01

    setPayingInstallment(sequence)
    startMayaCheckout(amount, {
      item_name: buildInstallmentItemName(installment),
      item_description: studentFullName || undefined,
      ...(includeBreakdown ? { original_amount: original, discount_amount: discount } : {}),
    })
  }

  const handleOnlinePaymentSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    setOnlinePaymentError(null)
    setOnlinePaymentMessage(null)

    const amountValue = Number(onlinePaymentAmount)
    if (!amountValue || amountValue <= 0) {
      setOnlinePaymentError('Online payment amount must be greater than zero.')
      return
    }

    const currentBalance = Number(ledgerData?.totals?.balance ?? 0)
    if (currentBalance > 0 && amountValue > currentBalance) {
      setOnlinePaymentError('Amount cannot be greater than your current balance.')
      return
    }

    setPayingInstallment(null)
    startMayaCheckout(amountValue)
  }

  const totals = ledgerData?.totals
  const noaData = noaQuery.data?.data
  const onlineTransactions = onlinePaymentsQuery.data?.data || []
  const paymentPlan = ledgerData?.payment_plan ?? null
  const installmentsData = ledgerData?.installments
  const installments = useMemo(() => installmentsData ?? [], [installmentsData])
  const needsPlanSelection = isStudentUser && !paymentPlan && !ledgerQuery.isLoading

  const receiptSubmissions = useMemo(
    () => receiptSubmissionsQuery.data?.data || [],
    [receiptSubmissionsQuery.data?.data]
  )

  // Latest submission per installment (API returns newest first).
  const latestReceiptBySequence = useMemo(() => {
    const map = new Map<number, PaymentReceiptSubmission>()
    for (const submission of receiptSubmissions) {
      if (!map.has(submission.installment_sequence)) {
        map.set(submission.installment_sequence, submission)
      }
    }
    return map
  }, [receiptSubmissions])

  const rejectedReceipts = useMemo(() => {
    const paidSequences = new Set(
      installments.filter((installment) => installment.status === 'paid').map((i) => i.sequence)
    )
    return [...latestReceiptBySequence.values()].filter(
      (submission) =>
        submission.status === 'rejected' && !paidSequences.has(submission.installment_sequence)
    )
  }, [latestReceiptBySequence, installments])

  const handlePlanSubmit = (paymentPlanId: string) => {
    setPaymentPlanMutation.mutate(paymentPlanId, {
      onSuccess: () => setShowPlanOverride(false),
    })
  }

  if (isStudentUser && ledgerQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        <span className="ml-3 text-gray-600">Loading your finance page...</span>
      </div>
    )
  }

  if (needsPlanSelection) {
    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-xl font-semibold text-gray-900">Choose your payment plan</h3>
          <p className="text-gray-600 mt-1">
            Before viewing your finance page, please choose how you would like to pay your fees for
            academic year <span className="font-medium">{resolvedAcademicYear}</span>. This selection
            is permanent for the school year — contact your school registrar if you need to change it
            later.
          </p>
        </div>
        <PaymentPlanPicker
          plans={activePlans}
          loading={setPaymentPlanMutation.isPending}
          plansLoading={activePlansQuery.isLoading}
          onSelect={handlePlanSubmit}
        />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {isStudentUser && (
        <input
          ref={receiptFileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,application/pdf"
          className="hidden"
          onChange={handleReceiptFileChange}
        />
      )}

      {isStudentUser && rejectedReceipts.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="flex items-start gap-3">
            <ExclamationTriangleIcon className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-red-800">
                {rejectedReceipts.length === 1
                  ? 'Your uploaded payment receipt was rejected'
                  : `${rejectedReceipts.length} of your uploaded payment receipts were rejected`}
              </p>
              <ul className="mt-1 space-y-1 text-sm text-red-700">
                {rejectedReceipts.map((submission) => (
                  <li key={submission.id}>
                    <span className="font-medium">
                      {submission.installment_label ||
                        `Installment #${submission.installment_sequence}`}
                    </span>
                    {submission.review_note ? ` — ${submission.review_note}` : ''}
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-red-600">
                Please upload a new receipt from the installment schedule below.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-semibold text-gray-900">Student Finance</h3>
          <p className="text-gray-600">Ledger, payments, discounts, and Notice of Account (NOA).</p>
          {paymentPlan && (
            <div className="mt-2 flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700">
                <CalendarDaysIcon className="w-3.5 h-3.5" />
                {paymentPlan.name || 'Payment'} plan
                <span className="text-indigo-500">·</span>
                {paymentPlan.installment_count} installments
              </span>
              {!isStudentUser && (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800"
                  onClick={() => setShowPlanOverride((prev) => !prev)}
                >
                  <PencilSquareIcon className="w-3.5 h-3.5" />
                  {showPlanOverride ? 'Cancel' : 'Change plan'}
                </button>
              )}
            </div>
          )}
        </div>
        <div className="w-full lg:w-64">
          <Select
            value={resolvedAcademicYear}
            onChange={(event) => setSelectedAcademicYear(event.target.value)}
            options={academicYearOptions}
            className="w-full"
          />
        </div>
      </div>

      {!isStudentUser && (showPlanOverride || !paymentPlan) && (
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-6">
          <h4 className="text-base font-semibold text-gray-900 mb-1">
            {paymentPlan ? 'Override payment plan' : 'Set payment plan'}
          </h4>
          <p className="text-sm text-gray-600 mb-4">
            {paymentPlan
              ? 'Choosing a different plan will overwrite the student’s current selection for this academic year.'
              : 'The student has not yet picked a plan. You may set one on their behalf.'}
          </p>
          <PaymentPlanPicker
            plans={activePlans}
            loading={setPaymentPlanMutation.isPending}
            plansLoading={activePlansQuery.isLoading}
            currentPlanId={paymentPlan?.payment_plan_id ?? undefined}
            onSelect={handlePlanSubmit}
          />
        </div>
      )}

      {!isStudentUser && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h4 className="text-lg font-semibold text-gray-900 mb-1 flex items-center gap-2">
            <CalendarDaysIcon className="w-5 h-5 text-indigo-600" />
            Payment Plan History
          </h4>
          <p className="text-sm text-gray-500 mb-4">
            Every plan selection and change for {resolvedAcademicYear}.
          </p>
          {planHistoryQuery.isLoading ? (
            <p className="text-gray-500">Loading history...</p>
          ) : !planHistory.length ? (
            <p className="text-sm text-gray-500">No payment plan changes recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Plan</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Changed From</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">By</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {planHistory.map((change) => (
                    <tr key={change.id}>
                      <td className="px-4 py-2 text-sm text-gray-600">
                        {change.changed_at
                          ? new Date(change.changed_at).toLocaleString('en-PH', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '—'}
                      </td>
                      <td className="px-4 py-2 text-sm font-medium text-gray-900">
                        {change.plan_name || '—'}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-600">
                        {change.previous_plan_name || '—'}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-600">
                        {change.changed_by_name || (change.changed_by_student ? 'Student' : '—')}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-600">{change.note || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-500">Balance Forward</p>
          <p className="text-2xl font-semibold text-gray-900">
            {formatAmount(totals?.balance_forward)}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-500">Charges</p>
          <p className="text-2xl font-semibold text-gray-900">
            {formatAmount(totals?.charges)}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-500">Discounts</p>
          <p className="text-2xl font-semibold text-gray-900">
            {formatAmount(totals?.discounts)}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-500">Payments</p>
          <p className="text-2xl font-semibold text-gray-900">
            {formatAmount(totals?.payments)}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-500">Current Balance</p>
          <p className="text-2xl font-semibold text-gray-900">
            {formatAmount(totals?.balance)}
          </p>
        </div>
      </div>

      {isStudentUser && (
        <div className="space-y-6">
          {SHOW_PAY_ONLINE_SECTION && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <h4 className="text-lg font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <CreditCardIcon className="w-5 h-5 text-indigo-600" />
              Pay Online (Maya Checkout)
            </h4>
            <p className="text-sm text-gray-600 mb-4">
              Use Maya Checkout to pay your balance online. Your ledger updates automatically after confirmation.
            </p>
            <form className="space-y-4" onSubmit={handleOnlinePaymentSubmit}>
              <Input
                label="Payment Amount"
                type="number"
                min="0"
                step="0.01"
                value={onlinePaymentAmount}
                onChange={(event) => setOnlinePaymentAmount(event.target.value)}
                placeholder="0.00"
              />
              <p className="text-xs text-gray-500">
                Current balance: <span className="font-medium">{formatAmount(ledgerData?.totals?.balance)}</span>
              </p>
              {onlinePaymentError && <p className="text-sm text-red-600">{onlinePaymentError}</p>}
              {onlinePaymentMessage && <p className="text-sm text-indigo-700">{onlinePaymentMessage}</p>}
              <Button
                type="submit"
                loading={createOnlinePaymentMutation.isPending}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {createOnlinePaymentMutation.isPending ? 'Creating Checkout...' : 'Proceed to Maya Checkout'}
              </Button>
            </form>
          </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <h4 className="text-lg font-semibold text-gray-900 mb-4">Recent Online Payments</h4>
            {onlinePaymentsQuery.isLoading ? (
              <p className="text-gray-500">Loading online payments...</p>
            ) : !onlineTransactions.length ? (
              <p className="text-sm text-gray-500">No online payment transactions yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Reference</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {onlineTransactions.map((tx) => (
                      <tr key={tx.id}>
                        <td className="px-4 py-2 text-sm text-gray-700">{tx.request_reference_number}</td>
                        <td className="px-4 py-2 text-sm text-gray-600">
                          {new Date(tx.created_at).toLocaleString('en-PH')}
                        </td>
                        <td className="px-4 py-2 text-sm text-right text-gray-900">{formatAmount(tx.amount)}</td>
                        <td className="px-4 py-2 text-sm text-right">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                              tx.status === 'completed'
                                ? 'bg-green-100 text-green-700'
                                : tx.status === 'pending' || tx.status === 'authorized'
                                  ? 'bg-yellow-100 text-yellow-700'
                                  : 'bg-red-100 text-red-700'
                            }`}
                          >
                            {tx.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <h4 className="text-lg font-semibold text-gray-900 mb-1">Uploaded Payment Receipts</h4>
            <p className="text-sm text-gray-500 mb-4">
              Receipts you upload are reviewed by the finance office. Approved receipts are posted
              to your ledger automatically.
            </p>
            {receiptSubmissionsQuery.isLoading ? (
              <p className="text-gray-500">Loading uploaded receipts...</p>
            ) : !receiptSubmissions.length ? (
              <p className="text-sm text-gray-500">No uploaded receipts yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Installment</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Uploaded</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Receipt</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Verified Amount</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {receiptSubmissions.map((submission) => (
                      <tr key={submission.id}>
                        <td className="px-4 py-2 text-sm text-gray-700">
                          {submission.installment_label ||
                            `Installment #${submission.installment_sequence}`}
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-600">
                          {submission.created_at
                            ? new Date(submission.created_at).toLocaleString('en-PH')
                            : '—'}
                        </td>
                        <td className="px-4 py-2 text-sm">
                          {submission.url ? (
                            <a
                              href={submission.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-indigo-600 hover:text-indigo-800 hover:underline"
                            >
                              {submission.file_name}
                            </a>
                          ) : (
                            <span className="text-gray-600">{submission.file_name}</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-sm text-right text-gray-900 tabular-nums">
                          {submission.amount != null ? formatAmount(Number(submission.amount)) : '—'}
                        </td>
                        <td className="px-4 py-2 text-sm text-right">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium capitalize ${
                              submission.status === 'approved'
                                ? 'bg-green-100 text-green-700'
                                : submission.status === 'pending'
                                  ? 'bg-yellow-100 text-yellow-700'
                                  : 'bg-red-100 text-red-700'
                            }`}
                          >
                            {submission.status}
                          </span>
                          {submission.status === 'rejected' && submission.review_note && (
                            <span className="block text-xs text-red-600 mt-1 max-w-xs ml-auto">
                              {submission.review_note}
                            </span>
                          )}
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

      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
          <h4 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <DocumentTextIcon className="w-5 h-5 text-indigo-600" />
            Notice of Account (NOA)
          </h4>
          {noaData && (
            <PDFDownloadLink
              document={<StudentNOAPDF data={noaData} />}
              fileName={`NOA-${student.last_name}-${student.first_name}-${resolvedAcademicYear}`.replace(
                /[^a-zA-Z0-9-_]/g,
                '-'
              )}
            >
              {({ loading }) => (
                <Button variant="outline" size="sm" className="flex items-center gap-2">
                  <DocumentTextIcon className="w-4 h-4 text-indigo-600" />
                  {loading ? 'Preparing PDF...' : 'Download PDF'}
                </Button>
              )}
            </PDFDownloadLink>
          )}
        </div>
        {noaQuery.isLoading ? (
          <p className="text-gray-500">Loading NOA...</p>
        ) : (
          <div className="space-y-4">
            <div className="text-sm text-gray-600">
              Grade Level: <span className="font-medium">{noaData?.grade_level || 'N/A'}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Fee</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {noaData?.fees?.map((fee) => (
                    <tr key={fee.fee_id}>
                      <td className="px-4 py-2 text-sm text-gray-700">{fee.fee_name}</td>
                      <td className="px-4 py-2 text-sm text-gray-900 text-right">
                        {formatAmount(fee.amount)}
                      </td>
                    </tr>
                  ))}
                  {!noaData?.fees?.length && (
                    <tr>
                      <td colSpan={2} className="px-4 py-4 text-center text-gray-500">
                        No fees configured for this academic year.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {Boolean(noaData?.discounts?.length) && (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Discount</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {noaData?.discounts?.map((discount) => (
                      <tr key={discount.discount_id}>
                        <td className="px-4 py-2 text-sm text-gray-700">
                          {discount.fee_name || 'General Discount'}
                          {discount.description && (
                            <div className="text-xs text-gray-500">{discount.description}</div>
                          )}
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-600 capitalize">
                          {discount.discount_type}
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-900 text-right">
                          {formatAmount(discount.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="border-t border-gray-200 pt-4 space-y-2 text-sm text-gray-700">
              <div className="flex justify-between">
                <span>Balance Forward</span>
                <span className="font-medium">{formatAmount(noaData?.totals?.balance_forward)}</span>
              </div>
              <div className="flex justify-between">
                <span>Total Charges</span>
                <span className="font-medium">{formatAmount(noaData?.totals?.charges)}</span>
              </div>
              <div className="flex justify-between">
                <span>Total Discounts</span>
                <span className="font-medium">{formatAmount(noaData?.totals?.discounts)}</span>
              </div>
              <div className="flex justify-between">
                <span>Total Payments</span>
                <span className="font-medium">{formatAmount(noaData?.totals?.payments)}</span>
              </div>
              <div className="flex justify-between text-base font-semibold text-gray-900">
                <span>Balance</span>
                <span>{formatAmount(noaData?.totals?.balance)}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {paymentPlan && installments.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2 mb-3 sm:mb-4">
            <h4 className="text-base sm:text-lg font-semibold text-gray-900 flex items-center gap-2">
              <CalendarDaysIcon className="w-5 h-5 text-indigo-600" />
              Installment Schedule
            </h4>
            <span className="text-xs text-gray-500">
              {paymentPlan.name || 'Payment'} ·{' '}
              {paymentPlan.installment_count} installments
            </span>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Net charges (after discounts) divided across {paymentPlan.installment_count}{' '}
            installments for academic year {resolvedAcademicYear}.
          </p>

          {/* Mobile: stacked cards */}
          <ul className="space-y-3 sm:hidden">
            {installments.map((installment) => {
              const isPaying =
                createOnlinePaymentMutation.isPending && payingInstallment === installment.sequence
              const isPaid = installment.status === 'paid'
              const remaining = Math.max(0, installment.amount - installment.paid_amount)
              const receipt = latestReceiptBySequence.get(installment.sequence)
              const receiptStatus = !isPaid && receipt?.status !== 'approved' ? receipt?.status : undefined
              const isUploading =
                uploadReceiptMutation.isPending &&
                receiptUploadTarget?.sequence === installment.sequence
              return (
                <li
                  key={installment.sequence}
                  className={`rounded-xl border bg-white overflow-hidden ${
                    isPaid ? 'border-green-200' : 'border-gray-200'
                  }`}
                >
                  <div className="p-4 flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <span
                        className={`flex-shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full text-sm font-semibold ${
                          isPaid ? 'bg-green-50 text-green-700' : 'bg-indigo-50 text-indigo-700'
                        }`}
                      >
                        {installment.sequence}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">
                          {installment.label}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Due{' '}
                          {new Date(installment.due_date).toLocaleDateString('en-PH', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </p>
                        {installment.is_overdue && installment.late_fee_amount > 0 && (
                          <p className="text-xs font-medium text-red-600 mt-0.5">
                            Overdue · +{formatAmount(installment.late_fee_amount)} late fee
                          </p>
                        )}
                      </div>
                    </div>
                    <p className="text-base font-bold text-gray-900 tabular-nums whitespace-nowrap">
                      {formatAmount(installment.amount)}
                    </p>
                  </div>
                  {isPaid ? (
                    <div className="w-full flex items-center justify-center gap-2 py-3 text-sm font-semibold text-green-700 bg-green-50 border-t border-green-100">
                      <CheckCircleIcon className="w-4 h-4" />
                      Paid
                    </div>
                  ) : (
                    isStudentUser && (
                      <div className="border-t border-gray-100">
                        {receiptStatus === 'pending' && (
                          <div className="flex items-center justify-center gap-2 py-2 text-xs font-medium text-yellow-800 bg-yellow-50">
                            <ClockIcon className="w-4 h-4" />
                            Receipt pending review
                          </div>
                        )}
                        {receiptStatus === 'rejected' && (
                          <div className="flex items-start gap-2 px-4 py-2 text-xs font-medium text-red-700 bg-red-50">
                            <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
                            <span>
                              Receipt rejected
                              {receipt?.review_note ? `: ${receipt.review_note}` : ''}
                            </span>
                          </div>
                        )}
                        <div className={SHOW_PAY_INSTALLMENT_BUTTON ? 'grid grid-cols-2' : 'grid grid-cols-1'}>
                          {SHOW_PAY_INSTALLMENT_BUTTON && (
                          <button
                            type="button"
                            disabled={createOnlinePaymentMutation.isPending}
                            onClick={() =>
                              handlePayInstallment({ ...installment, amount: remaining })
                            }
                            className="flex items-center justify-center gap-2 py-3 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-60 disabled:cursor-not-allowed transition"
                          >
                            {isPaying ? (
                              <>
                                <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                Processing...
                              </>
                            ) : (
                              <>
                                <CreditCardIcon className="w-4 h-4" />
                                Pay {formatAmount(remaining)}
                                {installment.status === 'partial' && (
                                  <span className="ml-1 text-[10px] uppercase tracking-wide bg-white/20 rounded px-1.5 py-0.5">
                                    Remaining
                                  </span>
                                )}
                              </>
                            )}
                          </button>
                          )}
                          <button
                            type="button"
                            disabled={uploadReceiptMutation.isPending || receiptStatus === 'pending'}
                            onClick={() => handleUploadReceiptClick(installment)}
                            className={`flex items-center justify-center gap-2 py-3 text-sm font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 active:bg-indigo-200 disabled:opacity-60 disabled:cursor-not-allowed transition${SHOW_PAY_INSTALLMENT_BUTTON ? ' border-l border-gray-100' : ''}`}
                          >
                            {isUploading ? (
                              <>
                                <span className="inline-block w-4 h-4 border-2 border-indigo-300 border-t-indigo-700 rounded-full animate-spin" />
                                Uploading...
                              </>
                            ) : (
                              <>
                                <ArrowUpTrayIcon className="w-4 h-4" />
                                {receiptStatus === 'rejected' ? 'Re-upload' : 'Upload Receipt'}
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    )
                  )}
                </li>
              )
            })}
          </ul>

          {/* Tablet/desktop: table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase w-12">
                    #
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    Period
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    Due Date
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                    Amount Due
                  </th>
                  {isStudentUser && (
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase w-64">
                      Action
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {installments.map((installment) => {
                  const isPaying =
                    createOnlinePaymentMutation.isPending &&
                    payingInstallment === installment.sequence
                  const isPaid = installment.status === 'paid'
                  const remaining = Math.max(0, installment.amount - installment.paid_amount)
                  const receipt = latestReceiptBySequence.get(installment.sequence)
                  const receiptStatus =
                    !isPaid && receipt?.status !== 'approved' ? receipt?.status : undefined
                  const isUploading =
                    uploadReceiptMutation.isPending &&
                    receiptUploadTarget?.sequence === installment.sequence
                  return (
                    <tr key={installment.sequence} className={isPaid ? 'bg-green-50/30' : undefined}>
                      <td className="px-4 py-2 text-sm text-gray-600">{installment.sequence}</td>
                      <td className="px-4 py-2 text-sm text-gray-900">{installment.label}</td>
                      <td className="px-4 py-2 text-sm text-gray-600">
                        {new Date(installment.due_date).toLocaleDateString('en-PH', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                        {installment.is_overdue && installment.late_fee_amount > 0 && (
                          <span className="block text-xs font-medium text-red-600">
                            Overdue · +{formatAmount(installment.late_fee_amount)} late fee
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-sm text-right text-gray-900 tabular-nums">
                        {formatAmount(installment.amount)}
                      </td>
                      {isStudentUser && (
                        <td className="px-4 py-2 text-right">
                          {isPaid ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 text-green-700 px-2.5 py-1 text-xs font-medium">
                              <CheckCircleIcon className="w-3.5 h-3.5" />
                              Paid
                            </span>
                          ) : (
                            <div className="flex flex-col items-end gap-1.5">
                              <div className="flex items-center justify-end gap-2">
                                {SHOW_PAY_INSTALLMENT_BUTTON && (
                                <Button
                                  size="sm"
                                  loading={isPaying}
                                  disabled={createOnlinePaymentMutation.isPending}
                                  onClick={() =>
                                    handlePayInstallment({ ...installment, amount: remaining })
                                  }
                                  className="bg-indigo-600 hover:bg-indigo-700 text-white"
                                >
                                  {installment.status === 'partial'
                                    ? `Pay ${formatAmount(remaining)}`
                                    : 'Pay'}
                                </Button>
                                )}
                                <Button
                                  size="sm"
                                  variant="outline"
                                  loading={isUploading}
                                  disabled={
                                    uploadReceiptMutation.isPending || receiptStatus === 'pending'
                                  }
                                  onClick={() => handleUploadReceiptClick(installment)}
                                  className="flex items-center gap-1.5 whitespace-nowrap"
                                >
                                  <ArrowUpTrayIcon className="w-4 h-4" />
                                  {receiptStatus === 'rejected' ? 'Re-upload' : 'Upload Receipt'}
                                </Button>
                              </div>
                              {receiptStatus === 'pending' && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 text-yellow-800 px-2.5 py-1 text-xs font-medium">
                                  <ClockIcon className="w-3.5 h-3.5" />
                                  Receipt pending review
                                </span>
                              )}
                              {receiptStatus === 'rejected' && (
                                <span
                                  className="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-700 px-2.5 py-1 text-xs font-medium"
                                  title={receipt?.review_note || undefined}
                                >
                                  <ExclamationTriangleIcon className="w-3.5 h-3.5" />
                                  Receipt rejected
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {isStudentUser && (onlinePaymentError || onlinePaymentMessage) && (
            <div className="mt-3 space-y-1">
              {onlinePaymentError && <p className="text-sm text-red-600">{onlinePaymentError}</p>}
              {onlinePaymentMessage && (
                <p className="text-sm text-indigo-700">{onlinePaymentMessage}</p>
              )}
            </div>
          )}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h4 className="text-lg font-semibold text-gray-900 mb-4">Ledger</h4>
        {ledgerQuery.isLoading ? (
          <p className="text-gray-500">Loading ledger...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                    Running Balance
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {ledgerData?.entries?.map((entry, index) => (
                  <tr key={`${entry.type}-${entry.payment_id || entry.discount_id || entry.fee_id || index}`}>
                    <td className="px-4 py-2 text-sm text-gray-600 capitalize">{entry.type.replace('_', ' ')}</td>
                    <td className="px-4 py-2 text-sm text-gray-700">{entry.description}</td>
                    <td className="px-4 py-2 text-sm text-gray-600">{entry.date || '—'}</td>
                    <td
                      className={`px-4 py-2 text-sm text-right ${
                        entry.amount < 0 ? 'text-red-600' : 'text-gray-900'
                      }`}
                    >
                      {formatAmount(entry.amount)}
                    </td>
                    <td className="px-4 py-2 text-sm text-right text-gray-900">
                      {formatAmount(entry.running_balance)}
                    </td>
                  </tr>
                ))}
                {!ledgerData?.entries?.length && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                      No ledger entries found for this academic year.
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

interface PaymentPlanPickerProps {
  plans: PaymentPlan[]
  loading: boolean
  plansLoading?: boolean
  currentPlanId?: string
  onSelect: (paymentPlanId: string) => void
}

const PaymentPlanPicker: React.FC<PaymentPlanPickerProps> = ({
  plans,
  loading,
  plansLoading,
  currentPlanId,
  onSelect,
}) => {
  const [choice, setChoice] = useState<string | null>(currentPlanId ?? null)

  const cardClass = (active: boolean) =>
    `flex-1 text-left cursor-pointer rounded-xl border p-5 transition shadow-sm ${
      active
        ? 'border-indigo-500 ring-2 ring-indigo-200 bg-white'
        : 'border-gray-200 bg-white hover:border-indigo-300'
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
              <span className="text-xs font-medium text-indigo-600 bg-indigo-50 rounded-full px-2 py-0.5 whitespace-nowrap">
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

      <div className="flex justify-end">
        <Button
          disabled={!choice || loading || choice === currentPlanId}
          loading={loading}
          onClick={() => choice && onSelect(choice)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white"
        >
          {currentPlanId ? 'Update plan' : 'Confirm plan'}
        </Button>
      </div>
    </div>
  )
}

export default StudentFinanceTab
