import React, { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { Button } from '../../components/button'
import { Input } from '../../components/input'
import { paymentReceiptService } from '../../services/paymentReceiptService'
import type { PaymentReceiptSubmission, ReceiptSubmissionStatus } from '../../types'

const formatAmount = (amount?: number | string | null) => {
  const value = Number(amount || 0)
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

const extractErrorMessage = (error: unknown, fallback: string) => {
  if (error && typeof error === 'object' && 'response' in error) {
    const response = (error as { response?: { data?: { message?: string } } }).response
    return response?.data?.message || fallback
  }
  return fallback
}

const ReceiptApprovalsView: React.FC = () => {
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState<ReceiptSubmissionStatus>('pending')
  const [reviewTarget, setReviewTarget] = useState<PaymentReceiptSubmission | null>(null)
  const [verifiedAmount, setVerifiedAmount] = useState('')
  const [rejectMode, setRejectMode] = useState(false)
  const [rejectNote, setRejectNote] = useState('')

  const submissionsQuery = useQuery({
    queryKey: ['payment-receipt-submissions', 'queue', statusFilter],
    queryFn: () => paymentReceiptService.list({ status: statusFilter }),
    refetchInterval: statusFilter === 'pending' ? 60000 : false,
  })
  const submissions = submissionsQuery.data?.data || []

  const closeReviewModal = () => {
    setReviewTarget(null)
    setVerifiedAmount('')
    setRejectMode(false)
    setRejectNote('')
  }

  const invalidateAfterReview = () => {
    queryClient.invalidateQueries({ queryKey: ['payment-receipt-submissions'] })
    queryClient.invalidateQueries({ queryKey: ['student-ledger'] })
    queryClient.invalidateQueries({ queryKey: ['student-noa'] })
    queryClient.invalidateQueries({ queryKey: ['finance-dashboard'] })
  }

  const approveMutation = useMutation({
    mutationFn: (payload: { id: string; amount: number }) =>
      paymentReceiptService.approve(payload.id, payload.amount),
    onSuccess: (response) => {
      closeReviewModal()
      invalidateAfterReview()
      toast.success(response.message || 'Receipt approved. Payment posted.')
    },
    onError: (error: unknown) => {
      toast.error(extractErrorMessage(error, 'Failed to approve receipt.'))
    },
  })

  const rejectMutation = useMutation({
    mutationFn: (payload: { id: string; review_note: string }) =>
      paymentReceiptService.reject(payload.id, payload.review_note),
    onSuccess: () => {
      closeReviewModal()
      invalidateAfterReview()
      toast.success('Receipt rejected. The student will see the reason on My Finance.')
    },
    onError: (error: unknown) => {
      toast.error(extractErrorMessage(error, 'Failed to reject receipt.'))
    },
  })

  const openReviewModal = (submission: PaymentReceiptSubmission) => {
    setReviewTarget(submission)
    setVerifiedAmount(submission.amount != null ? String(submission.amount) : '')
    setRejectMode(false)
    setRejectNote('')
  }

  const handleApprove = () => {
    if (!reviewTarget) return
    const amount = Number(verifiedAmount)
    if (!amount || amount <= 0) {
      toast.error('Enter the verified amount shown on the receipt.')
      return
    }
    approveMutation.mutate({ id: reviewTarget.id, amount })
  }

  const handleReject = () => {
    if (!reviewTarget) return
    if (!rejectNote.trim()) {
      toast.error('A reason is required to reject a receipt.')
      return
    }
    rejectMutation.mutate({ id: reviewTarget.id, review_note: rejectNote.trim() })
  }

  const studentName = (submission: PaymentReceiptSubmission) =>
    submission.student
      ? `${submission.student.first_name} ${submission.student.last_name}`
      : '—'

  const isImage = (submission: PaymentReceiptSubmission) =>
    Boolean(submission.mime_type?.startsWith('image/'))

  const isPendingTarget = reviewTarget?.status === 'pending'

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Receipt Approvals</h2>
          <p className="text-sm text-gray-500">
            Review payment receipts uploaded by students, verify the amount against the image, then
            approve or reject with a reason.
          </p>
        </div>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden self-start">
          {(['pending', 'approved', 'rejected'] as ReceiptSubmissionStatus[]).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                statusFilter === status
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
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Student</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Installment</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Year</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Uploaded</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {submissionsQuery.isLoading && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  Loading receipt submissions...
                </td>
              </tr>
            )}
            {!submissionsQuery.isLoading &&
              submissions.map((submission) => (
                <tr key={submission.id}>
                  <td className="px-4 py-3 text-sm text-gray-700">{studentName(submission)}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {submission.installment_label ||
                      `Installment #${submission.installment_sequence}`}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{submission.academic_year}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {submission.created_at
                      ? new Date(submission.created_at).toLocaleString('en-PH', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-right tabular-nums text-gray-900">
                    {submission.amount != null ? formatAmount(submission.amount) : '—'}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${
                        submission.status === 'approved'
                          ? 'bg-green-100 text-green-700'
                          : submission.status === 'rejected'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {submission.status}
                    </span>
                    {submission.review_note && (
                      <span className="block text-xs text-gray-400 mt-1 max-w-xs">
                        {submission.review_note}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-right whitespace-nowrap">
                    <Button
                      type="button"
                      size="sm"
                      variant={submission.status === 'pending' ? undefined : 'outline'}
                      onClick={() => openReviewModal(submission)}
                      className={
                        submission.status === 'pending'
                          ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                          : undefined
                      }
                    >
                      {submission.status === 'pending' ? 'Review' : 'View'}
                    </Button>
                  </td>
                </tr>
              ))}
            {!submissionsQuery.isLoading && !submissions.length && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  No {statusFilter} receipt submissions.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Review modal: receipt preview + verified amount + approve / reject */}
      {reviewTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl bg-white shadow-xl">
            <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-gray-900">
                  {isPendingTarget ? 'Review Payment Receipt' : 'Payment Receipt'}
                </h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  {studentName(reviewTarget)} ·{' '}
                  {reviewTarget.installment_label ||
                    `Installment #${reviewTarget.installment_sequence}`}{' '}
                  · {reviewTarget.academic_year}
                </p>
              </div>
              <button
                type="button"
                onClick={closeReviewModal}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-2">
                {reviewTarget.url ? (
                  isImage(reviewTarget) ? (
                    <a href={reviewTarget.url} target="_blank" rel="noreferrer">
                      <img
                        src={reviewTarget.url}
                        alt={`Receipt uploaded by ${studentName(reviewTarget)}`}
                        className="max-h-96 w-full object-contain rounded"
                      />
                    </a>
                  ) : (
                    <div className="py-8 text-center">
                      <p className="text-sm text-gray-600 mb-2">{reviewTarget.file_name}</p>
                      <a
                        href={reviewTarget.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm font-medium text-indigo-600 hover:text-indigo-800 hover:underline"
                      >
                        Open file in a new tab
                      </a>
                    </div>
                  )
                ) : (
                  <p className="py-8 text-center text-sm text-gray-500">
                    The receipt file could not be loaded.
                  </p>
                )}
              </div>

              {isPendingTarget && !rejectMode && (
                <Input
                  label="Verified Amount (from the receipt)"
                  type="number"
                  min="0"
                  step="0.01"
                  value={verifiedAmount}
                  onChange={(event) => setVerifiedAmount(event.target.value)}
                  placeholder="0.00"
                />
              )}

              {!isPendingTarget && (
                <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Status</span>
                    <span className="capitalize font-medium">{reviewTarget.status}</span>
                  </div>
                  {reviewTarget.amount != null && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Verified amount</span>
                      <span className="tabular-nums">{formatAmount(reviewTarget.amount)}</span>
                    </div>
                  )}
                  {reviewTarget.reviewer && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Reviewed by</span>
                      <span>
                        {reviewTarget.reviewer.first_name} {reviewTarget.reviewer.last_name}
                      </span>
                    </div>
                  )}
                  {reviewTarget.review_note && (
                    <div className="flex justify-between gap-3">
                      <span className="text-gray-500">Reason</span>
                      <span className="text-right">{reviewTarget.review_note}</span>
                    </div>
                  )}
                </div>
              )}

              {isPendingTarget && rejectMode && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Rejection Reason <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={rejectNote}
                    onChange={(event) => setRejectNote(event.target.value)}
                    rows={3}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                    placeholder="e.g. Image is unreadable, reference number does not match, wrong account"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    The student will see this reason on their My Finance page and can upload a new
                    receipt.
                  </p>
                </div>
              )}
            </div>

            <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
              {isPendingTarget ? (
                rejectMode ? (
                  <>
                    <Button type="button" variant="outline" onClick={() => setRejectMode(false)}>
                      Back
                    </Button>
                    <Button
                      type="button"
                      loading={rejectMutation.isPending}
                      onClick={handleReject}
                      className="bg-red-600 hover:bg-red-700 text-white"
                    >
                      Reject Receipt
                    </Button>
                  </>
                ) : (
                  <>
                    <Button type="button" variant="outline" onClick={closeReviewModal}>
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setRejectMode(true)}
                      className="text-red-600 border-red-300 hover:bg-red-50"
                    >
                      Reject...
                    </Button>
                    <Button
                      type="button"
                      loading={approveMutation.isPending}
                      onClick={handleApprove}
                      className="bg-green-600 hover:bg-green-700 text-white"
                    >
                      Approve & Post Payment
                    </Button>
                  </>
                )
              ) : (
                <Button type="button" variant="outline" onClick={closeReviewModal}>
                  Close
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ReceiptApprovalsView
