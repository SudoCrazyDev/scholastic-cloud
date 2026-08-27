import React, { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { ChevronRightIcon } from '@heroicons/react/24/outline'
import { Button } from '../../components/button'
import { Input } from '../../components/input'
import { paymentReceiptService } from '../../services/paymentReceiptService'
import type {
  ApproveReceiptSubmissionData,
  PaymentReceiptSubmission,
  ReceiptSubmissionStatus,
  StudentPayment,
  UpdateReceiptPaymentDetailsData,
} from '../../types'

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

/**
 * Per-field validation errors, so a duplicate reference number lights up the field itself
 * rather than only appearing in a toast the reviewer has to read and then find.
 */
const extractFieldErrors = (error: unknown): Record<string, string[]> => {
  if (error && typeof error === 'object' && 'response' in error) {
    const response = (error as { response?: { data?: { errors?: Record<string, string[]> } } })
      .response
    return response?.data?.errors ?? {}
  }
  return {}
}

/** What a line item settled, for reading the subdivision back off an approved receipt. */
const lineLabel = (item: StudentPayment) =>
  item.school_fee?.name ?? item.additional_fee?.name ?? 'General / Other'

interface ReceiptApprovalsViewProps {
  /**
   * Renders without the page card and heading, for the panel on Cashiering. A cashier
   * taking payments needs to see what is waiting on them without leaving the till, but the
   * queue is not what that screen is about — so the embedded copy is compact, drops the
   * columns the full page has room for, and offers only the two statuses that are
   * actionable there.
   */
  embedded?: boolean
  /**
   * Scopes the queue to one student's receipts.
   *
   * `undefined` leaves it unscoped — the whole institution's queue, which is what the full
   * page shows. A value (or `null` for "nobody picked yet") scopes it, which is what
   * Cashiering wants: the cashier has a student in front of them, and the other students'
   * receipts are somebody else's problem right now.
   */
  studentId?: string | null
}

/**
 * The one thing about a collection this screen writes.
 *
 * How the money arrived is settled by the receipt the student uploaded — the mode is an
 * online transfer, the date is when it was verified, the remark says which installment it
 * came in for — and the API fills all three in. What is left is the number the approver
 * reconciles the payment by, and for money that arrived online that is the *reference*
 * number: the bank's or the wallet's own record of the transfer, which is what appears on
 * the image they are looking at. An OR number belongs to the official receipt a cashier
 * writes out at the till, so it is captured there and not here.
 */
type DetailsForm = {
  reference_number: string
}

const EMPTY_DETAILS: DetailsForm = {
  reference_number: '',
}

const ReceiptApprovalsView: React.FC<ReceiptApprovalsViewProps> = ({
  embedded = false,
  studentId,
}) => {
  const queryClient = useQueryClient()
  // Scoped by the caller passing the prop at all, so "no student picked" stays distinct from
  // "show everyone" — the first waits, the second queries.
  const scopedToStudent = studentId !== undefined
  const hasStudent = Boolean(studentId)
  const statuses: ReceiptSubmissionStatus[] = embedded
    ? ['pending', 'approved']
    : ['pending', 'approved', 'rejected']

  const [statusFilter, setStatusFilter] = useState<ReceiptSubmissionStatus>('pending')
  const [reviewTarget, setReviewTarget] = useState<PaymentReceiptSubmission | null>(null)
  const [verifiedAmount, setVerifiedAmount] = useState('')
  const [details, setDetails] = useState<DetailsForm>(EMPTY_DETAILS)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const [rejectMode, setRejectMode] = useState(false)
  const [rejectNote, setRejectNote] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const submissionsQuery = useQuery({
    queryKey: ['payment-receipt-submissions', 'queue', statusFilter, studentId ?? null],
    queryFn: () =>
      paymentReceiptService.list({
        status: statusFilter,
        student_id: studentId ?? undefined,
      }),
    // Nothing to ask for until the cashier has picked somebody.
    enabled: !scopedToStudent || hasStudent,
    refetchInterval: statusFilter === 'pending' ? 60000 : false,
  })
  // Memoized because the refresh effect below depends on it: a fresh array identity every
  // render would re-run that effect on every render.
  const submissions = useMemo(() => submissionsQuery.data?.data ?? [], [submissionsQuery.data])

  const isPendingTarget = reviewTarget?.status === 'pending'
  const postedTransaction = reviewTarget?.payment_transaction ?? null

  const closeReviewModal = () => {
    setReviewTarget(null)
    setVerifiedAmount('')
    setDetails(EMPTY_DETAILS)
    setFieldErrors({})
    setRejectMode(false)
    setRejectNote('')
  }

  const invalidateAfterReview = () => {
    queryClient.invalidateQueries({ queryKey: ['payment-receipt-submissions'] })
    queryClient.invalidateQueries({ queryKey: ['student-ledger'] })
    queryClient.invalidateQueries({ queryKey: ['cashier-ledger'] })
    queryClient.invalidateQueries({ queryKey: ['student-noa'] })
    queryClient.invalidateQueries({ queryKey: ['finance-dashboard'] })
  }

  /**
   * A reference or OR number may sit on more than one collection — the till and the
   * queue draw on one booklet and a school splits a receipt across postings — so the
   * write goes through and says what already holds the number.
   */
  const showIdentifierWarnings = (warnings?: Record<string, string[]>) => {
    Object.values(warnings ?? {}).forEach((messages) => {
      messages.forEach((message) => toast(message, { icon: '⚠️', duration: 8000 }))
    })
  }

  const approveMutation = useMutation({
    mutationFn: (payload: { id: string; data: ApproveReceiptSubmissionData }) =>
      paymentReceiptService.approve(payload.id, payload.data),
    onSuccess: (response) => {
      closeReviewModal()
      invalidateAfterReview()
      toast.success(response.message || 'Receipt approved. Payment posted.')
      showIdentifierWarnings(response.warnings)
    },
    onError: (error: unknown) => {
      setFieldErrors(extractFieldErrors(error))
      toast.error(extractErrorMessage(error, 'Failed to approve receipt.'))
    },
  })

  const detailsMutation = useMutation({
    mutationFn: (payload: { id: string; data: UpdateReceiptPaymentDetailsData }) =>
      paymentReceiptService.updatePaymentDetails(payload.id, payload.data),
    onSuccess: (response) => {
      // Stay on the receipt so the reviewer sees the corrected details land.
      setReviewTarget(response.data)
      setFieldErrors({})
      invalidateAfterReview()
      toast.success(response.message || 'Payment details updated.')
      showIdentifierWarnings(response.warnings)
    },
    onError: (error: unknown) => {
      setFieldErrors(extractFieldErrors(error))
      toast.error(extractErrorMessage(error, 'Failed to update payment details.'))
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
    setFieldErrors({})
    setRejectMode(false)
    setRejectNote('')

    const transaction = submission.payment_transaction
    setDetails({
      reference_number: transaction?.reference_number ?? '',
    })
  }

  // A refreshed queue carries new relations for the open receipt; keep the form in step.
  useEffect(() => {
    if (!reviewTarget) return
    const refreshed = submissions.find((submission) => submission.id === reviewTarget.id)
    if (refreshed && refreshed.updated_at !== reviewTarget.updated_at) {
      setReviewTarget(refreshed)
    }
  }, [submissions, reviewTarget])

  const handleApprove = () => {
    if (!reviewTarget) return
    const amount = Number(verifiedAmount)
    if (!amount || amount <= 0) {
      toast.error('Enter the verified amount shown on the receipt.')
      return
    }

    setFieldErrors({})
    approveMutation.mutate({
      id: reviewTarget.id,
      // Only what the review form actually asked for. Mode, date and remark are left to the
      // API's defaults rather than posted as blanks from fields that are no longer rendered.
      // No allocations: the whole verified amount posts as one General / Other line, which
      // is what the API does when it is sent none.
      data: {
        amount,
        reference_number: details.reference_number || undefined,
      },
    })
  }

  const handleSaveDetails = () => {
    if (!reviewTarget) return
    setFieldErrors({})
    detailsMutation.mutate({
      id: reviewTarget.id,
      // Sent verbatim rather than as `|| undefined`: axios drops undefined keys, and an
      // emptied field has to reach the API as "" for it to read as "clear this" instead of
      // "leave it". Everything else — mode, date, remark, and any OR number a cashier put on
      // the transaction — is not sent at all, so it stays exactly as posted.
      data: {
        reference_number: details.reference_number,
      },
    })
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

  const fieldError = (field: string) => fieldErrors[field]?.[0]

  // One student's queue does not need their name repeated down every row, so that column
  // goes and the expand chevron moves into the installment cell.
  const showStudentColumn = !scopedToStudent
  const columnCount = 5 + (showStudentColumn ? 1 : 0) + (embedded ? 0 : 2)

  /** The per-fee split of a posted approval, or null when there is nothing to show. */
  const subdivisionOf = (submission: PaymentReceiptSubmission): StudentPayment[] | null => {
    const items = submission.payment_transaction?.items
    return items && items.length ? items : null
  }

  /** The reference number — see DetailsForm for why it is only that. */
  const renderDetailsFields = (disabled: boolean) => (
    <div className="grid grid-cols-1 gap-3">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Reference number <span className="font-normal text-gray-400">(optional)</span>
        </label>
        <Input
          value={details.reference_number}
          onChange={(event) =>
            setDetails((prev) => ({ ...prev, reference_number: event.target.value }))
          }
          placeholder="e.g. bank transaction id"
          error={fieldError('reference_number')}
          disabled={disabled}
        />
      </div>
    </div>
  )

  /**
   * Expands the row into its subdivision. Rendered in whichever cell leads the row, so the
   * chevrons still line up when the student column is gone.
   */
  const expandToggle = (
    submission: PaymentReceiptSubmission,
    isExpanded: boolean,
    canExpand: boolean
  ) =>
    canExpand ? (
      <button
        type="button"
        onClick={() => setExpandedId(isExpanded ? null : submission.id)}
        aria-expanded={isExpanded}
        aria-label={isExpanded ? 'Hide the payment breakdown' : 'Show the payment breakdown'}
        className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
      >
        <ChevronRightIcon
          className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
          aria-hidden="true"
        />
      </button>
    ) : (
      <span className="inline-block w-5" aria-hidden="true" />
    )

  const table = (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            {showStudentColumn && (
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Student</th>
            )}
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Installment</th>
            {!embedded && (
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Year</th>
            )}
            {!embedded && (
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Uploaded</th>
            )}
            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reference</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {scopedToStudent && !hasStudent && (
            <tr>
              <td colSpan={columnCount} className="px-4 py-8 text-center text-sm text-gray-500">
                Search for a student above to see the receipts they have uploaded.
              </td>
            </tr>
          )}
          {(!scopedToStudent || hasStudent) && submissionsQuery.isLoading && (
            <tr>
              <td colSpan={columnCount} className="px-4 py-8 text-center text-gray-500">
                Loading receipt submissions...
              </td>
            </tr>
          )}
          {/* A failed load must not read as an empty queue — a receipt the
              student really uploaded would look like it never arrived. */}
          {!submissionsQuery.isLoading && submissionsQuery.isError && (
            <tr>
              <td colSpan={columnCount} className="px-4 py-8 text-center text-sm text-red-600">
                {extractErrorMessage(submissionsQuery.error, 'Failed to load receipt submissions.')}
              </td>
            </tr>
          )}
          {!submissionsQuery.isLoading &&
            !submissionsQuery.isError &&
            submissions.map((submission) => {
              const split = subdivisionOf(submission)
              const isExpanded = expandedId === submission.id
              const transaction = submission.payment_transaction

              return (
                <React.Fragment key={submission.id}>
                  <tr className={isExpanded ? 'bg-gray-50/60' : undefined}>
                    {showStudentColumn && (
                      <td className="px-4 py-3 text-sm text-gray-700">
                        <div className="flex items-center gap-1.5">
                          {expandToggle(submission, isExpanded, Boolean(split))}
                          {studentName(submission)}
                        </div>
                      </td>
                    )}
                    <td className="px-4 py-3 text-sm text-gray-700">
                      <div className="flex items-center gap-1.5">
                        {!showStudentColumn && expandToggle(submission, isExpanded, Boolean(split))}
                        {submission.installment_label ||
                          `Installment #${submission.installment_sequence}`}
                      </div>
                    </td>
                    {!embedded && (
                      <td className="px-4 py-3 text-sm text-gray-600">{submission.academic_year}</td>
                    )}
                    {!embedded && (
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
                    )}
                    <td className="px-4 py-3 text-sm text-right tabular-nums text-gray-900">
                      {submission.amount != null ? formatAmount(submission.amount) : '—'}
                      {split && (
                        <span className="block text-xs font-normal text-gray-400">
                          across {split.length} {split.length === 1 ? 'fee' : 'fees'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 font-mono">
                      {transaction?.reference_number || '—'}
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
                            ? 'bg-primary-600 hover:bg-primary-700 text-white'
                            : undefined
                        }
                      >
                        {submission.status === 'pending'
                          ? 'Review'
                          : submission.status === 'approved'
                            ? 'Edit details'
                            : 'View'}
                      </Button>
                    </td>
                  </tr>

                  {/* How the verified amount was subdivided — what the school actually
                      collected against, rather than one figure with no fee behind it. */}
                  {isExpanded && split && (
                    <tr className="bg-gray-50/60">
                      <td colSpan={columnCount} className="px-4 pb-4 pt-0">
                        <div className="rounded-lg border border-gray-200 bg-white">
                          <div className="border-b border-gray-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                            Subdivided across
                          </div>
                          <ul className="divide-y divide-gray-100">
                            {split.map((item) => (
                              <li
                                key={item.id}
                                className="flex items-center justify-between gap-4 px-4 py-2 text-sm"
                              >
                                <span className="text-gray-700">
                                  {lineLabel(item)}
                                  {!item.school_fee && !item.additional_fee && (
                                    <span className="ml-1.5 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-500">
                                      Unallocated
                                    </span>
                                  )}
                                </span>
                                <span className="tabular-nums text-gray-900">
                                  {formatAmount(item.amount)}
                                </span>
                              </li>
                            ))}
                          </ul>
                          <div className="flex items-center justify-between gap-4 border-t border-gray-200 px-4 py-2 text-sm font-semibold">
                            <span className="text-gray-700">Total posted</span>
                            <span className="tabular-nums text-gray-900">
                              {formatAmount(transaction?.total_amount)}
                            </span>
                          </div>
                          <div className="border-t border-gray-100 px-4 py-2 text-xs text-gray-500">
                            Receipt {transaction?.receipt_number}
                            {transaction?.payment_method ? ` · ${transaction.payment_method}` : ''}
                            {transaction?.or_number ? ` · OR ${transaction.or_number}` : ''}
                            {transaction?.reference_number
                              ? ` · Ref ${transaction.reference_number}`
                              : ''}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              )
            })}
          {(!scopedToStudent || hasStudent) &&
            !submissionsQuery.isLoading &&
            !submissionsQuery.isError &&
            !submissions.length && (
              <tr>
                <td colSpan={columnCount} className="px-4 py-8 text-center text-gray-500">
                  No {statusFilter} receipt submissions{scopedToStudent ? ' for this student' : ''}.
                </td>
              </tr>
            )}
        </tbody>
      </table>
    </div>
  )

  const statusTabs = (
    <div className="flex rounded-lg border border-gray-200 overflow-hidden self-start">
      {statuses.map((status) => (
        <button
          key={status}
          type="button"
          onClick={() => setStatusFilter(status)}
          className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
            statusFilter === status
              ? 'bg-primary-600 text-white'
              : 'bg-white text-gray-700 hover:bg-gray-50'
          }`}
        >
          {status}
        </button>
      ))}
    </div>
  )

  const modal = reviewTarget && (
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
                    className="text-sm font-medium text-primary-600 hover:text-primary-800 hover:underline"
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
            <>
              <Input
                label="Verified Amount (from the receipt)"
                type="number"
                min="0"
                step="0.01"
                value={verifiedAmount}
                onChange={(event) => setVerifiedAmount(event.target.value)}
                placeholder="0.00"
              />


              <div className="rounded-lg border border-gray-200 p-4 space-y-3">
                <h4 className="text-sm font-semibold text-gray-900">Payment summary</h4>
                {renderDetailsFields(approveMutation.isPending)}
              </div>
            </>
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

          {/* An approved receipt has already moved the ledger, so its amount and its split are
              not fields here — the void queue is the way those change. The two receipt
              identifiers are, and they are shown as inputs straight away: with nothing else on
              this card to read, a read-only pass behind an "Edit details" button was a click
              that revealed exactly what it had just been hiding. */}
          {reviewTarget.status === 'approved' && postedTransaction && (
            <div className="rounded-lg border border-gray-200">
              <div className="border-b border-gray-100 px-4 py-2.5">
                <h4 className="text-sm font-semibold text-gray-900">Payment summary</h4>
                <p className="text-xs text-gray-500">
                  Receipt {postedTransaction.receipt_number}
                </p>
              </div>

              {/* The subdivision is not repeated here either. It is one expand away on the row
                  this modal was opened from, and a second copy of it only made the modal
                  longer than the receipt image it exists to show. */}
              <div className="px-4 py-3">
                {renderDetailsFields(detailsMutation.isPending)}
              </div>
            </div>
          )}

          {reviewTarget.status === 'approved' && !postedTransaction && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              This receipt was approved before receipts carried a transaction record, so its
              payment details cannot be edited here.
            </p>
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
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-primary-500"
                placeholder="e.g. Image is unreadable, reference number does not match, wrong account"
              />
              <p className="mt-1 text-xs text-gray-500">
                The student will see this reason on their My Finance page and can upload a new
                receipt.
              </p>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex flex-wrap justify-end gap-2">
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
                  Approve &amp; Post Payment
                </Button>
              </>
            )
          ) : (
            <>
              <Button type="button" variant="outline" onClick={closeReviewModal}>
                Close
              </Button>
              {reviewTarget.status === 'approved' && postedTransaction && (
                <Button
                  type="button"
                  loading={detailsMutation.isPending}
                  onClick={handleSaveDetails}
                  className="bg-primary-600 hover:bg-primary-700 text-white"
                >
                  Save details
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )

  if (embedded) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="flex flex-col gap-3 border-b border-gray-100 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Receipt approvals</h3>
            <p className="text-xs text-gray-500">
              {scopedToStudent
                ? 'Proof of payment this student uploaded — verify the amount, say which fees it settles, then post it.'
                : 'Proof of payment students uploaded — verify the amount, say which fees it settles, then post it.'}
            </p>
          </div>
          {statusTabs}
        </div>
        <div className="p-4">{table}</div>
        {modal}
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Receipt Approvals</h2>
          <p className="text-sm text-gray-500">
            Review payment receipts uploaded by students, verify the amount against the image, say
            which fees it settles, then approve or reject with a reason.
          </p>
        </div>
        {statusTabs}
      </div>

      {table}
      {modal}
    </div>
  )
}

export default ReceiptApprovalsView
