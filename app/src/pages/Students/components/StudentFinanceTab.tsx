import React, { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CreditCardIcon, DocumentTextIcon } from '@heroicons/react/24/outline'
import { Button } from '../../../components/button'
import { Input } from '../../../components/input'
import { Select } from '../../../components/select'
import { schoolFeeService } from '../../../services/schoolFeeService'
import { studentFinanceService } from '../../../services/studentFinanceService'
import { studentDiscountService } from '../../../services/studentDiscountService'
import { studentPaymentService } from '../../../services/studentPaymentService'
import type { CreateStudentDiscountData, CreateStudentPaymentData, Student, StudentPayment } from '../../../types'

interface StudentFinanceTabProps {
  student: Student
  studentId: string
}

export const StudentFinanceTab: React.FC<StudentFinanceTabProps> = ({ student, studentId }) => {
  const queryClient = useQueryClient()
  const currentYear = new Date().getFullYear()
  const fallbackAcademicYear = `${currentYear}-${currentYear + 1}`

  const [selectedAcademicYear, setSelectedAcademicYear] = useState<string>('')
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    payment_date: '',
    payment_method: '',
    reference_number: '',
    remarks: '',
    school_fee_id: '',
  })
  const [paymentError, setPaymentError] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<StudentPayment | null>(null)
  const [discountForm, setDiscountForm] = useState({
    discount_type: 'fixed',
    value: '',
    school_fee_id: '',
    description: '',
  })
  const [discountError, setDiscountError] = useState<string | null>(null)

  const feesQuery = useQuery({
    queryKey: ['school-fees'],
    queryFn: () => schoolFeeService.getSchoolFees({ is_active: true }),
  })

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

  useEffect(() => {
    if (!selectedAcademicYear && ledgerData?.academic_year) {
      setSelectedAcademicYear(ledgerData.academic_year)
    }
  }, [ledgerData?.academic_year, selectedAcademicYear])

  const academicYearOptions = useMemo(() => {
    const years = ledgerData?.available_academic_years?.length
      ? ledgerData.available_academic_years
      : [fallbackAcademicYear]
    return years.map((year) => ({ value: year, label: year }))
  }, [ledgerData?.available_academic_years, fallbackAcademicYear])

  const createPaymentMutation = useMutation({
    mutationFn: (payload: CreateStudentPaymentData) => studentPaymentService.createPayment(payload),
    onSuccess: (response) => {
      setReceipt(response.data)
      setPaymentForm({
        amount: '',
        payment_date: '',
        payment_method: '',
        reference_number: '',
        remarks: '',
        school_fee_id: '',
      })
      setPaymentError(null)
      queryClient.invalidateQueries({ queryKey: ['student-ledger', studentId] })
      queryClient.invalidateQueries({ queryKey: ['student-noa', studentId] })
    },
    onError: (error: any) => {
      setPaymentError(error.response?.data?.message || 'Failed to record payment.')
    },
  })

  const createDiscountMutation = useMutation({
    mutationFn: (payload: CreateStudentDiscountData) => studentDiscountService.createDiscount(payload),
    onSuccess: () => {
      setDiscountForm({
        discount_type: 'fixed',
        value: '',
        school_fee_id: '',
        description: '',
      })
      setDiscountError(null)
      queryClient.invalidateQueries({ queryKey: ['student-ledger', studentId] })
      queryClient.invalidateQueries({ queryKey: ['student-noa', studentId] })
    },
    onError: (error: any) => {
      setDiscountError(error.response?.data?.message || 'Failed to save discount.')
    },
  })

  const formatAmount = (amount?: number | null) => {
    const value = Number(amount || 0)
    return value.toFixed(2)
  }

  const handlePaymentSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    setPaymentError(null)

    const amountValue = Number(paymentForm.amount)
    if (!amountValue || amountValue <= 0) {
      setPaymentError('Payment amount must be greater than zero.')
      return
    }

    const payload: CreateStudentPaymentData = {
      student_id: studentId,
      academic_year: resolvedAcademicYear,
      amount: amountValue,
      payment_date:
        paymentForm.payment_date || new Date().toISOString().split('T')[0],
      payment_method: paymentForm.payment_method || undefined,
      reference_number: paymentForm.reference_number || undefined,
      remarks: paymentForm.remarks || undefined,
      school_fee_id: paymentForm.school_fee_id || undefined,
    }

    createPaymentMutation.mutate(payload)
  }

  const handleDiscountSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    setDiscountError(null)

    const value = Number(discountForm.value)
    if (!value || value <= 0) {
      setDiscountError('Discount value must be greater than zero.')
      return
    }
    if (discountForm.discount_type === 'percentage' && value > 100) {
      setDiscountError('Percentage discount cannot exceed 100%.')
      return
    }

    const payload: CreateStudentDiscountData = {
      student_id: studentId,
      academic_year: resolvedAcademicYear,
      discount_type: discountForm.discount_type as CreateStudentDiscountData['discount_type'],
      value,
      school_fee_id: discountForm.school_fee_id || undefined,
      description: discountForm.description || undefined,
    }

    createDiscountMutation.mutate(payload)
  }

  const totals = ledgerData?.totals
  const noaData = noaQuery.data?.data

  return (
    <div className="space-y-8">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-semibold text-gray-900">Student Finance</h3>
          <p className="text-gray-600">Ledger, payments, discounts, and Notice of Account (NOA).</p>
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

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <CreditCardIcon className="w-5 h-5 text-indigo-600" />
            Record Payment
          </h4>
          <form className="space-y-4" onSubmit={handlePaymentSubmit}>
            <Input
              label="Amount"
              type="number"
              min="0"
              step="0.01"
              value={paymentForm.amount}
              onChange={(event) => setPaymentForm(prev => ({ ...prev, amount: event.target.value }))}
            />
            <Input
              label="Payment Date"
              type="date"
              value={paymentForm.payment_date}
              onChange={(event) => setPaymentForm(prev => ({ ...prev, payment_date: event.target.value }))}
            />
            <Select
              value={paymentForm.school_fee_id}
              onChange={(event) => setPaymentForm(prev => ({ ...prev, school_fee_id: event.target.value }))}
              options={(feesQuery.data?.data || []).map((fee) => ({
                value: fee.id,
                label: fee.name,
              }))}
              placeholder="Applied fee (optional)"
              className="w-full"
            />
            <Input
              label="Payment Method"
              value={paymentForm.payment_method}
              onChange={(event) => setPaymentForm(prev => ({ ...prev, payment_method: event.target.value }))}
              placeholder="Cash, Bank Transfer, etc."
            />
            <Input
              label="Reference Number"
              value={paymentForm.reference_number}
              onChange={(event) => setPaymentForm(prev => ({ ...prev, reference_number: event.target.value }))}
              placeholder="Optional reference"
            />
            <Input
              label="Remarks"
              value={paymentForm.remarks}
              onChange={(event) => setPaymentForm(prev => ({ ...prev, remarks: event.target.value }))}
              placeholder="Optional note"
            />
            {paymentError && <p className="text-sm text-red-600">{paymentError}</p>}
            <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white">
              Record Payment
            </Button>
          </form>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <DocumentTextIcon className="w-5 h-5 text-indigo-600" />
            Apply Discount
          </h4>
          <form className="space-y-4" onSubmit={handleDiscountSubmit}>
            <Select
              value={discountForm.discount_type}
              onChange={(event) => setDiscountForm(prev => ({ ...prev, discount_type: event.target.value }))}
              options={[
                { value: 'fixed', label: 'Fixed Amount' },
                { value: 'percentage', label: 'Percentage' },
              ]}
              className="w-full"
            />
            <Input
              label={discountForm.discount_type === 'percentage' ? 'Percentage (%)' : 'Discount Amount'}
              type="number"
              min="0"
              step="0.01"
              value={discountForm.value}
              onChange={(event) => setDiscountForm(prev => ({ ...prev, value: event.target.value }))}
            />
            <Select
              value={discountForm.school_fee_id}
              onChange={(event) => setDiscountForm(prev => ({ ...prev, school_fee_id: event.target.value }))}
              options={(feesQuery.data?.data || []).map((fee) => ({
                value: fee.id,
                label: fee.name,
              }))}
              placeholder="Apply to specific fee (optional)"
              className="w-full"
            />
            <Input
              label="Description"
              value={discountForm.description}
              onChange={(event) => setDiscountForm(prev => ({ ...prev, description: event.target.value }))}
              placeholder="Optional note or reason"
            />
            {discountError && <p className="text-sm text-red-600">{discountError}</p>}
            <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white">
              Save Discount
            </Button>
          </form>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <DocumentTextIcon className="w-5 h-5 text-indigo-600" />
          Notice of Account (NOA)
        </h4>
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

      {receipt && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h4 className="text-lg font-semibold text-gray-900">Payment Receipt</h4>
              <p className="text-sm text-gray-600">Receipt Number: {receipt.receipt_number}</p>
            </div>
            <Button variant="outline" onClick={() => setReceipt(null)}>
              Clear Receipt
            </Button>
          </div>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-700">
            <div>
              <p className="text-gray-500">Student</p>
              <p className="font-medium">
                {student.first_name} {student.last_name}
              </p>
            </div>
            <div>
              <p className="text-gray-500">Academic Year</p>
              <p className="font-medium">{receipt.academic_year}</p>
            </div>
            <div>
              <p className="text-gray-500">Payment Date</p>
              <p className="font-medium">{receipt.payment_date}</p>
            </div>
            <div>
              <p className="text-gray-500">Amount</p>
              <p className="font-medium">{formatAmount(receipt.amount)}</p>
            </div>
            {receipt.payment_method && (
              <div>
                <p className="text-gray-500">Method</p>
                <p className="font-medium">{receipt.payment_method}</p>
              </div>
            )}
            {receipt.reference_number && (
              <div>
                <p className="text-gray-500">Reference</p>
                <p className="font-medium">{receipt.reference_number}</p>
              </div>
            )}
            {receipt.remarks && (
              <div className="md:col-span-2">
                <p className="text-gray-500">Remarks</p>
                <p className="font-medium">{receipt.remarks}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default StudentFinanceTab
