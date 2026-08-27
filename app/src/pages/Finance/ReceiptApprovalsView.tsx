import React, { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { ChevronRightIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import { Button } from '../../components/button'
import { Input } from '../../components/input'
import { paymentIdentifierService } from '../../services/paymentIdentifierService'
import { paymentReceiptService } from '../../services/paymentReceiptService'
import type {
  ApproveReceiptSubmissionData,
  DuplicateReferenceGroup,
  PaymentIdentifierHolder,
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

const formatDateTime = (value?: string | null) => {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime())
    ? null
    : parsed.toLocaleString('en-PH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
}

const formatDay = (value?: string | null) => {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime())
    ? null
    : parsed.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
}

const isImageMime = (mimeType?: string | null) => Boolean(mimeType?.startsWith('image/'))

/**
 * A receipt at thumbnail size, for recognising at a glance rather than reading.
 *
 * Falls back to a caption when the file cannot be shown: a PDF has no thumbnail, and an
 * image whose object has gone missing renders as a broken-image icon with the alt text
 * spilling out of the frame — which in a dialog that exists for comparing two receipts
 * reads as though the comparison is the thing that failed.
 */
const ReceiptThumbnail: React.FC<{
  url?: string | null
  mimeType?: string | null
  fileName?: string | null
  alt: string
  caption?: string
}> = ({ url, mimeType, fileName, alt, caption = 'No receipt image' }) => {
  const [failed, setFailed] = useState(false)
  const showImage = Boolean(url) && isImageMime(mimeType) && !failed

  return (
    <div className="flex h-32 w-full shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-50 sm:w-40">
      {showImage ? (
        <a href={url!} target="_blank" rel="noreferrer" className="block h-full w-full">
          <img
            src={url!}
            alt={alt}
            onError={() => setFailed(true)}
            className="h-full w-full object-contain"
          />
        </a>
      ) : url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="px-2 text-center text-xs font-medium text-primary-600 hover:underline"
        >
          {fileName || 'Open file'}
        </a>
      ) : (
        <span className="px-2 text-center text-xs text-gray-400">{caption}</span>
      )}
    </div>
  )
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
  /**
   * Hands an approved receipt back to the screen this is embedded in, instead of opening
   * the review dialog. Cashiering uses it to load the collection the approval posted into
   * the till, where it can be corrected or printed as a receipt.
   */
  onOpenApproved?: (submission: PaymentReceiptSubmission) => void
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

/**
 * What the queue can be filtered to.
 *
 * The three statuses are what a receipt *is*. `duplicates` is not one of them — it is a
 * question asked of the receipts already approved, "which of these were posted under a
 * reference number another one also carries" — but it belongs in the same row of tabs
 * because it is the same queue read a different way, and the answer is only actionable by
 * the person already standing in it.
 */
type QueueTab = ReceiptSubmissionStatus | 'duplicates'

/**
 * A reference number the reviewer is about to post that is already on live collections.
 *
 * Held while they look at those collections and decide, which is the whole point of
 * checking before the write rather than after it: a reference number on two receipts
 * usually means the student uploaded the same bank transfer twice, and once the second
 * approval has posted, taking it back is a void request. It is not always a mistake — one
 * transfer can genuinely settle two students' fees — so this is a stop, not a refusal.
 *
 * `amount` is the verified amount already entered, kept here so proceeding posts exactly
 * what the reviewer was about to post rather than re-reading a field they may have since
 * touched.
 */
type DuplicateReferencePrompt = {
  value: string
  amount: number
  holders: PaymentIdentifierHolder[]
}

const ReceiptApprovalsView: React.FC<ReceiptApprovalsViewProps> = ({
  embedded = false,
  studentId,
  onOpenApproved,
}) => {
  const queryClient = useQueryClient()
  // Scoped by the caller passing the prop at all, so "no student picked" stays distinct from
  // "show everyone" — the first waits, the second queries.
  const scopedToStudent = studentId !== undefined
  const hasStudent = Boolean(studentId)
  const tabs: QueueTab[] = ['pending', 'approved', 'rejected', 'duplicates']

  /**
   * The embedded copy is one list rather than a tabbed queue: the cashier is asking what
   * the student in front of them has sent in, and a receipt still waiting and one already
   * posted are both answers to that — behind tabs, half the answer is hidden. Rejected
   * receipts are left out because they settled nothing, and the duplicates sweep with
   * them: auditing the whole institution's books is not a job for the till.
   */
  const combined = embedded

  const [statusFilter, setStatusFilter] = useState<QueueTab>('pending')
  const [reviewTarget, setReviewTarget] = useState<PaymentReceiptSubmission | null>(null)
  const [verifiedAmount, setVerifiedAmount] = useState('')
  const [details, setDetails] = useState<DetailsForm>(EMPTY_DETAILS)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const [rejectMode, setRejectMode] = useState(false)
  const [rejectNote, setRejectNote] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [duplicateRef, setDuplicateRef] = useState<DuplicateReferencePrompt | null>(null)
  const [checkingReference, setCheckingReference] = useState(false)

  const showingDuplicates = statusFilter === 'duplicates'

  const submissionsQuery = useQuery({
    queryKey: [
      'payment-receipt-submissions',
      'queue',
      combined ? 'open' : statusFilter,
      studentId ?? null,
    ],
    queryFn: async () => {
      const response = await paymentReceiptService.list({
        status: combined ? undefined : (statusFilter as ReceiptSubmissionStatus),
        student_id: studentId ?? undefined,
      })
      if (!combined) return response
      // Waiting before posted — what still needs the cashier outranks what is already
      // done — and within each group the API's newest-first order stands.
      const rank = (status: ReceiptSubmissionStatus) => (status === 'pending' ? 0 : 1)
      const rows = (response.data ?? [])
        .filter((submission) => submission.status !== 'rejected')
        .sort((a, b) => rank(a.status) - rank(b.status))
      return { ...response, data: rows }
    },
    // Nothing to ask for until the cashier has picked somebody — and nothing to ask this
    // endpoint at all while the duplicates sweep is the thing on screen.
    enabled: !showingDuplicates && (!scopedToStudent || hasStudent),
    refetchInterval: combined || statusFilter === 'pending' ? 60000 : false,
  })
  // Memoized because the refresh effect below depends on it: a fresh array identity every
  // render would re-run that effect on every render.
  const submissions = useMemo(() => submissionsQuery.data?.data ?? [], [submissionsQuery.data])

  // Not polled the way the pending queue is: this reads the whole institution's approved
  // receipts, and nothing lands in it without somebody on this screen approving something
  // — which invalidates it anyway.
  const duplicatesQuery = useQuery({
    queryKey: ['payment-receipt-submissions', 'duplicates'],
    queryFn: () => paymentReceiptService.duplicates(),
    enabled: showingDuplicates,
  })
  const duplicateGroups = useMemo(
    () => duplicatesQuery.data?.data ?? [],
    [duplicatesQuery.data]
  )

  // Whichever list is on screen is the one an open receipt is kept in step with.
  const visibleSubmissions = useMemo(
    () =>
      showingDuplicates
        ? duplicateGroups.flatMap((group) => group.submissions)
        : submissions,
    [showingDuplicates, duplicateGroups, submissions]
  )

  const isPendingTarget = reviewTarget?.status === 'pending'
  const postedTransaction = reviewTarget?.payment_transaction ?? null

  const closeReviewModal = () => {
    setReviewTarget(null)
    setVerifiedAmount('')
    setDetails(EMPTY_DETAILS)
    setFieldErrors({})
    setRejectMode(false)
    setRejectNote('')
    setDuplicateRef(null)
    setCheckingReference(false)
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
    setDuplicateRef(null)
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
    const refreshed = visibleSubmissions.find((submission) => submission.id === reviewTarget.id)
    if (refreshed && refreshed.updated_at !== reviewTarget.updated_at) {
      setReviewTarget(refreshed)
    }
  }, [visibleSubmissions, reviewTarget])

  /** The write itself, once the reference number is settled one way or the other. */
  const postApproval = (amount: number, reference: string) => {
    if (!reviewTarget) return
    setFieldErrors({})
    approveMutation.mutate({
      id: reviewTarget.id,
      // Only what the review form actually asked for. Mode, date and remark are left to the
      // API's defaults rather than posted as blanks from fields that are no longer rendered.
      // No allocations: the whole verified amount posts as one General / Other line, which
      // is what the API does when it is sent none.
      data: {
        amount,
        reference_number: reference || undefined,
      },
    })
  }

  const handleApprove = async () => {
    if (!reviewTarget) return
    const amount = Number(verifiedAmount)
    if (!amount || amount <= 0) {
      toast.error('Enter the verified amount shown on the receipt.')
      return
    }

    const reference = details.reference_number.trim()
    // Nothing to reuse, so nothing to check.
    if (!reference) {
      postApproval(amount, reference)
      return
    }

    setCheckingReference(true)
    try {
      const response = await paymentIdentifierService.holders({ reference_number: reference })
      const holders = response.data?.reference_number ?? []
      if (holders.length) {
        setDuplicateRef({ value: reference, amount, holders })
        return
      }
    } catch (error) {
      // A check that could not run is not evidence of a duplicate, and refusing to post on
      // it would stop a reviewer working over a flaky connection from recording money that
      // really arrived. Post, and say the check was skipped — the API still reports the
      // reuse in the response it comes back with.
      toast(extractErrorMessage(error, 'Could not check that reference number for reuse.'), {
        icon: '⚠️',
        duration: 6000,
      })
    } finally {
      setCheckingReference(false)
    }

    postApproval(amount, reference)
  }

  /** They looked at the other collections and it is a separate payment after all. */
  const handleProceedDespiteDuplicate = () => {
    if (!duplicateRef) return
    const { amount, value } = duplicateRef
    setDuplicateRef(null)
    postApproval(amount, value)
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

  const isImage = (submission: PaymentReceiptSubmission) => isImageMime(submission.mime_type)

  const fieldError = (field: string) => fieldErrors[field]?.[0]

  // One student's queue does not need their name repeated down every row, so that column
  // goes and the expand chevron moves into the installment cell.
  const showStudentColumn = !scopedToStudent
  const columnCount = 5 + (showStudentColumn ? 1 : 0) + (embedded ? 0 : 2)

  /**
   * Whether this row is one the embedding screen asked to handle itself. Only an approved
   * receipt is handed back: a pending one still has to be reviewed against its image, and
   * a rejected one posted nothing there is anything to open.
   */
  const opensElsewhere = (submission: PaymentReceiptSubmission) =>
    Boolean(onOpenApproved) && submission.status === 'approved'

  const openSubmission = (submission: PaymentReceiptSubmission) => {
    if (opensElsewhere(submission)) {
      onOpenApproved!(submission)
      return
    }
    openReviewModal(submission)
  }

  const actionLabel = (submission: PaymentReceiptSubmission) => {
    if (submission.status === 'pending') return 'Review'
    if (submission.status !== 'approved') return 'View'
    return onOpenApproved ? 'Open at till' : 'Edit details'
  }

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
        onClick={(event) => {
          event.stopPropagation()
          setExpandedId(isExpanded ? null : submission.id)
        }}
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
                  <tr
                    className={`${isExpanded ? 'bg-gray-50/60' : ''} ${
                      opensElsewhere(submission)
                        ? 'cursor-pointer hover:bg-primary-50/50'
                        : ''
                    }`}
                    onClick={
                      opensElsewhere(submission) ? () => openSubmission(submission) : undefined
                    }
                  >
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
                        onClick={(event) => {
                          event.stopPropagation()
                          openSubmission(submission)
                        }}
                        className={
                          submission.status === 'pending'
                            ? 'bg-primary-600 hover:bg-primary-700 text-white'
                            : undefined
                        }
                      >
                        {actionLabel(submission)}
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
                  {combined
                    ? 'No receipts uploaded by this student yet.'
                    : `No ${statusFilter} receipt submissions${
                        scopedToStudent ? ' for this student' : ''
                      }.`}
                </td>
              </tr>
            )}
        </tbody>
      </table>
    </div>
  )

  const statusTabs = (
    <div className="flex shrink-0 self-start overflow-hidden rounded-lg border border-gray-200">
      {tabs.map((status) => (
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
                  loading={approveMutation.isPending || checkingReference}
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

  const holderStudentName = (holder: PaymentIdentifierHolder) =>
    holder.student ? `${holder.student.first_name} ${holder.student.last_name}` : 'Unknown student'

  /** One label/value line in a holder card, skipped entirely when there is no value. */
  const holderRow = (label: string, value?: string | null) =>
    value ? (
      <div className="flex justify-between gap-3">
        <dt className="shrink-0 text-gray-500">{label}</dt>
        <dd className="text-right text-gray-900">{value}</dd>
      </div>
    ) : null

  /**
   * Sits above the review modal when the reference number is already on the books, showing
   * the reviewer what holds it — which collection, whose it is, and the receipt that was
   * verified for it — so they can compare it with the image behind this dialog and say
   * whether they are looking at one payment or two.
   */
  const duplicateDialog = duplicateRef && reviewTarget && (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl bg-white shadow-2xl">
        <div className="flex items-start gap-3 border-b border-amber-200 bg-amber-50 px-5 py-4">
          <ExclamationTriangleIcon
            className="mt-0.5 h-6 w-6 shrink-0 text-amber-600"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-amber-900">
              Reference number <span className="font-mono">{duplicateRef.value}</span> is already
              on{' '}
              {duplicateRef.holders.length === 1
                ? 'another collection'
                : `${duplicateRef.holders.length} other collections`}
            </h3>
            <p className="mt-1 text-sm text-amber-800">
              Compare what is below with the receipt you are reviewing. If it is the same
              transfer uploaded twice, reject this one rather than posting it again — once it is
              posted, taking it back needs a void request.
            </p>
          </div>
        </div>

        <div className="space-y-5 px-5 py-4">
          <section>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Now reviewing
            </h4>
            <div className="flex flex-col gap-4 rounded-lg border border-primary-200 bg-primary-50/40 p-3 sm:flex-row">
              <ReceiptThumbnail
                url={reviewTarget.url}
                mimeType={reviewTarget.mime_type}
                fileName={reviewTarget.file_name}
                alt={`Receipt uploaded by ${studentName(reviewTarget)}`}
              />
              <dl className="min-w-0 flex-1 space-y-1 text-sm">
                {holderRow('Student', studentName(reviewTarget))}
                {holderRow(
                  'Installment',
                  reviewTarget.installment_label ||
                    `Installment #${reviewTarget.installment_sequence}`
                )}
                {holderRow('Academic year', reviewTarget.academic_year)}
                {holderRow('Verified amount', formatAmount(duplicateRef.amount))}
                {holderRow('Uploaded', formatDateTime(reviewTarget.created_at))}
              </dl>
            </div>
          </section>

          <section>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Already posted with this reference
            </h4>
            <div className="space-y-3">
              {duplicateRef.holders.map((holder) => {
                const upload = holder.receipt_submission
                return (
                  <div
                    key={`${holder.kind}-${holder.id}`}
                    className="flex flex-col gap-4 rounded-lg border border-gray-200 p-3 sm:flex-row"
                  >
                    <ReceiptThumbnail
                      url={upload?.url}
                      mimeType={upload?.mime_type}
                      fileName={upload?.file_name}
                      alt={`Receipt behind ${holder.receipt_number || 'this collection'}`}
                      caption="Recorded at the till"
                    />
                    <dl className="min-w-0 flex-1 space-y-1 text-sm">
                      {holderRow(
                        'Student',
                        holder.student?.lrn
                          ? `${holderStudentName(holder)} (${holder.student.lrn})`
                          : holderStudentName(holder)
                      )}
                      {holderRow('Receipt no.', holder.receipt_number)}
                      {holderRow('Amount', formatAmount(holder.amount))}
                      {holderRow('Payment date', formatDay(holder.payment_date))}
                      {holderRow('Mode', holder.payment_method)}
                      {holderRow('OR no.', holder.or_number)}
                      {holderRow('Academic year', holder.academic_year)}
                      {holderRow(
                        'Installment',
                        upload
                          ? upload.installment_label ||
                            (upload.installment_sequence
                              ? `Installment #${upload.installment_sequence}`
                              : null)
                          : null
                      )}
                      {holderRow('Posted', formatDateTime(holder.posted_at))}
                      {holderRow('Remarks', holder.remarks)}
                    </dl>
                  </div>
                )
              })}
            </div>
          </section>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 px-5 py-4">
          <Button type="button" variant="outline" onClick={() => setDuplicateRef(null)}>
            Go back
          </Button>
          {/* `color` rather than a bg- class: the Button's own `bg-primary-600` outranks an
              override passed through className, because which one wins is decided by the
              order Tailwind emits them in and not by the order they are listed. */}
          <Button
            type="button"
            color="warning"
            loading={approveMutation.isPending}
            onClick={handleProceedDespiteDuplicate}
          >
            Post anyway
          </Button>
        </div>
      </div>
    </div>
  )

  /**
   * The sweep, once the money is already on the books.
   *
   * The dialog above catches a duplicate while the reviewer is still holding it. This
   * catches the ones that got past — posted anyway, keyed in later on the details form,
   * approved by two people at once, or approved before there was a check at all. Each card
   * is one reference number and everything approved under it, oldest first, so the row at
   * the top is the approval that got there first and the ones beneath it are what landed
   * on top.
   *
   * It reports and does not act. Undoing a posting is the void queue's job, and it needs a
   * reason written by somebody who has looked at both images — which is what this screen
   * puts in front of them.
   */
  const duplicatesPanel = (
    <div className="space-y-4">
      {duplicatesQuery.isLoading && (
        <div className="rounded-lg border border-gray-200 px-4 py-8 text-center text-sm text-gray-500">
          Checking approved receipts for shared reference numbers...
        </div>
      )}

      {/* A failed sweep must not read as a clean set of books. */}
      {!duplicatesQuery.isLoading && duplicatesQuery.isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-8 text-center text-sm text-red-600">
          {extractErrorMessage(duplicatesQuery.error, 'Failed to check for duplicate receipts.')}
        </div>
      )}

      {!duplicatesQuery.isLoading && !duplicatesQuery.isError && !duplicateGroups.length && (
        <div className="rounded-lg border border-gray-200 px-4 py-8 text-center text-sm text-gray-500">
          No approved receipt shares its reference number with another one.
        </div>
      )}

      {!duplicatesQuery.isError &&
        duplicateGroups.map((group: DuplicateReferenceGroup) => (
          <div
            key={group.reference_number}
            className="overflow-hidden rounded-lg border border-amber-200"
          >
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-3">
              <div className="min-w-0">
                <h4 className="text-sm font-semibold text-amber-900">
                  Reference <span className="font-mono">{group.reference_number}</span>
                </h4>
                <p className="mt-0.5 text-xs text-amber-800">
                  {group.count} approved receipts ·{' '}
                  {/* The shape of the group is most of the answer: the same student twice is
                      the case worth opening, two students is usually siblings on one
                      transfer and usually fine. */}
                  {group.student_count === 1
                    ? 'the same student'
                    : `${group.student_count} different students`}
                  {group.latest_posted_at
                    ? ` · latest ${formatDateTime(group.latest_posted_at)}`
                    : ''}
                </p>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                  Posted under it
                </div>
                <div className="text-sm font-semibold tabular-nums text-amber-900">
                  {formatAmount(group.total_amount)}
                </div>
              </div>
            </div>

            <ul className="divide-y divide-gray-100 bg-white">
              {group.submissions.map((submission, index) => {
                const transaction = submission.payment_transaction
                return (
                  <li key={submission.id} className="flex flex-col gap-4 px-4 py-3 sm:flex-row">
                    <ReceiptThumbnail
                      url={submission.url}
                      mimeType={submission.mime_type}
                      fileName={submission.file_name}
                      alt={`Receipt uploaded by ${studentName(submission)}`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">
                          {studentName(submission)}
                        </span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                            index === 0
                              ? 'bg-gray-100 text-gray-600'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {index === 0 ? 'Approved first' : 'Posted after'}
                        </span>
                      </div>
                      <dl className="mt-1.5 space-y-1 text-sm">
                        {holderRow(
                          'Installment',
                          submission.installment_label ||
                            `Installment #${submission.installment_sequence}`
                        )}
                        {holderRow('Academic year', submission.academic_year)}
                        {holderRow(
                          'Verified amount',
                          submission.amount != null ? formatAmount(submission.amount) : null
                        )}
                        {/* Shown per row because the grouping ignores case and separators:
                            two members of one card can read `BDO-778899` and `bdo 778899`,
                            and the reviewer should see that is what happened. */}
                        {holderRow('Reference as posted', transaction?.reference_number)}
                        {holderRow('Receipt no.', transaction?.receipt_number)}
                        {holderRow('OR no.', transaction?.or_number)}
                        {holderRow('Payment date', formatDay(transaction?.payment_date))}
                        {holderRow('Approved', formatDateTime(submission.reviewed_at))}
                        {holderRow(
                          'Approved by',
                          submission.reviewer
                            ? `${submission.reviewer.first_name} ${submission.reviewer.last_name}`
                            : null
                        )}
                      </dl>
                    </div>
                    <div className="shrink-0">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => openReviewModal(submission)}
                      >
                        Open
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>

            <p className="border-t border-gray-100 bg-gray-50 px-4 py-2 text-xs text-gray-500">
              If these are one payment posted twice, raise a void request against the receipt
              number of the one that should not stand — an approval cannot be taken back from
              here.
            </p>
          </div>
        ))}
    </div>
  )

  if (embedded) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="flex flex-col gap-3 border-b border-gray-100 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Receipt approvals</h3>
            <p className="text-xs text-gray-500">
              {!scopedToStudent
                ? 'Proof of payment students uploaded — verify the amount, say which fees it settles, then post it.'
                : !hasStudent
                  ? 'Pick a student above to see the receipts they have uploaded.'
                  : onOpenApproved
                    ? 'Receipts this student uploaded. Review a pending one to post it; open an approved one to correct or print it at the till.'
                    : 'Proof of payment this student uploaded — verify the amount, say which fees it settles, then post it.'}
            </p>
          </div>
        </div>
        <div className="p-4">{table}</div>
        {modal}
        {duplicateDialog}
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-gray-900">Receipt Approvals</h2>
          <p className="text-sm text-gray-500">
            {showingDuplicates
              ? 'Approved receipts posted under a reference number more than one of them carries. A shared number is not proof of a double posting — one transfer can settle two siblings’ fees, and a payment can be split across installments on purpose — so compare the images and the amounts before sending anything to the void queue.'
              : 'Review payment receipts uploaded by students, verify the amount against the image, say which fees it settles, then approve or reject with a reason.'}
          </p>
        </div>
        {statusTabs}
      </div>

      {showingDuplicates ? duplicatesPanel : table}
      {modal}
      {duplicateDialog}
    </div>
  )
}

export default ReceiptApprovalsView
