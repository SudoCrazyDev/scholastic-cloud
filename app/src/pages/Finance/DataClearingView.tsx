import React, { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ExclamationTriangleIcon, ShieldExclamationIcon } from '@heroicons/react/24/outline'
import { toast } from 'react-hot-toast'
import { Button } from '../../components/button'
import { Input } from '../../components/input'
import { Select } from '../../components/select'
import { Alert } from '../../components/alert'
import { financeDataClearService } from '../../services/financeDataClearService'
import type { FinanceDataClearGroup } from '../../types'

interface DataClearingViewProps {
  academicYearOptions: { value: string; label: string }[]
  defaultAcademicYear: string
}

const TABLE_LABELS: Record<string, string> = {
  payment_receipt_submissions: 'Student receipt uploads',
  payment_void_requests: 'Void requests',
  student_online_payment_transactions: 'Online payment attempts',
  student_payments: 'Payment lines',
  payment_transactions: 'Receipts',
  student_additional_fees: 'Additional charges & late fees',
  grade_level_discount_student_voids: 'Per-student grade discount voids',
  student_discounts: 'Student discounts',
  grade_level_discounts: 'Grade level discounts',
  school_fee_defaults: 'Fee amounts per grade level',
  school_fees: 'Fee types',
  student_fees: 'Student fee templates',
  default_discounts: 'Discount templates',
  sibling_group_members: 'Sibling group members',
  sibling_groups: 'Sibling groups',
  receipt_templates: 'Receipt templates',
}

const tableLabel = (table: string) => TABLE_LABELS[table] ?? table.replace(/_/g, ' ')

const formatCount = (value: number) => new Intl.NumberFormat('en-PH').format(value)

const formatDateTime = (value?: string | null) => {
  if (!value) return '—'
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime())
    ? String(value)
    : parsed.toLocaleString('en-PH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
}

/**
 * Setup → Data Clearing.
 *
 * Deleting a year's money data is the only Finance action with no undo, so the
 * screen is built to be slow on purpose: pick a year and the groups, load a
 * count of exactly what would go, then type the year back to confirm. Nothing is
 * sent until the last step, and the API re-checks all of it.
 *
 * Two things the layout has to keep visible rather than bury:
 *
 *  - **Catalog groups ignore the year.** A fee type has no academic year, so
 *    ticking one empties it for every year at once. They are grouped separately
 *    under their own heading and badged, because the year selector at the top
 *    otherwise implies a limit that does not apply to them.
 *  - **Blockers are not validation errors.** They mean the selection would
 *    silently strand rows in a year the operator did not pick — every foreign
 *    key here is CASCADE or SET NULL, so the database would allow it. They are
 *    rendered as the reason the button is disabled, with the fix stated.
 */
const DataClearingView: React.FC<DataClearingViewProps> = ({
  academicYearOptions,
  defaultAcademicYear,
}) => {
  const queryClient = useQueryClient()
  const [academicYear, setAcademicYear] = useState(defaultAcademicYear)
  const [selected, setSelected] = useState<string[]>([])
  const [confirmation, setConfirmation] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)

  const groupsQuery = useQuery({
    queryKey: ['finance-data-clear-groups'],
    queryFn: () => financeDataClearService.getGroups(),
  })

  const historyQuery = useQuery({
    queryKey: ['finance-data-clear-history'],
    queryFn: () => financeDataClearService.getHistory(),
  })

  // Memoised because the two scope filters below depend on it; a fresh []
  // fallback on every render would rebuild them each time.
  const groups = useMemo<FinanceDataClearGroup[]>(
    () => groupsQuery.data?.data?.groups ?? [],
    [groupsQuery.data]
  )
  const excluded: string[] = groupsQuery.data?.data?.excluded ?? []
  const history = historyQuery.data?.data ?? []

  const yearGroups = useMemo(() => groups.filter((g) => g.scope === 'year'), [groups])
  const catalogGroups = useMemo(() => groups.filter((g) => g.scope === 'catalog'), [groups])

  // The preview is the only thing that reports what would actually go, so it is
  // re-fetched whenever the year or the selection changes and the counts below
  // are never carried over from a previous selection.
  const previewQuery = useQuery({
    queryKey: ['finance-data-clear-preview', academicYear, [...selected].sort().join(',')],
    queryFn: () =>
      financeDataClearService.preview({ academic_year: academicYear, groups: selected }),
    enabled: selected.length > 0 && Boolean(academicYear),
  })

  const preview = previewQuery.data?.data
  const blockers = preview?.blockers ?? []
  const hasSelection = selected.length > 0

  const clearMutation = useMutation({
    mutationFn: () =>
      financeDataClearService.clear({
        academic_year: academicYear,
        groups: selected,
        confirmation,
      }),
    onSuccess: (response) => {
      toast.success(response.message || 'Finance data cleared.')
      setShowConfirm(false)
      setConfirmation('')
      setSelected([])
      // Everything downstream of a balance is now wrong until refetched.
      queryClient.invalidateQueries({ queryKey: ['finance-data-clear-history'] })
      queryClient.invalidateQueries({ queryKey: ['finance-data-clear-preview'] })
      queryClient.invalidateQueries({ queryKey: ['finance-dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['student-ledger'] })
      queryClient.invalidateQueries({ queryKey: ['cashier-ledger'] })
      queryClient.invalidateQueries({ queryKey: ['student-noa'] })
      queryClient.invalidateQueries({ queryKey: ['school-fees'] })
      queryClient.invalidateQueries({ queryKey: ['school-fee-defaults'] })
      queryClient.invalidateQueries({ queryKey: ['student-fees'] })
      queryClient.invalidateQueries({ queryKey: ['default-discounts'] })
      queryClient.invalidateQueries({ queryKey: ['payment-void-requests'] })
    },
    onError: (error: unknown) => {
      // A 422 here is usually a blocker the preview did not have yet — a payment
      // posted between the count and the confirm — so the server's message is
      // more useful than a generic failure.
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(message || 'Failed to clear finance data.')
    },
  })

  const toggleGroup = (key: string) => {
    setSelected((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    )
  }

  const confirmationMatches = confirmation.trim() === academicYear
  const canClear =
    hasSelection &&
    Boolean(preview?.clearable) &&
    (preview?.total ?? 0) > 0 &&
    !previewQuery.isFetching

  const renderGroupRow = (group: FinanceDataClearGroup) => {
    const isSelected = selected.includes(group.key)
    const groupPreview = preview?.groups.find((g) => g.key === group.key)
    const isBlocked = blockers.some((b) => b.group === group.key)

    return (
      <label
        key={group.key}
        className={`flex gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${
          isBlocked
            ? 'border-amber-300 bg-amber-50'
            : isSelected
              ? 'border-red-300 bg-red-50'
              : 'border-gray-200 hover:bg-gray-50'
        }`}
      >
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
          checked={isSelected}
          onChange={() => toggleGroup(group.key)}
          disabled={clearMutation.isPending}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-gray-900">{group.label}</span>
            {group.scope === 'catalog' && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-200 text-gray-700">
                All years
              </span>
            )}
            {isSelected && groupPreview && (
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                  groupPreview.total > 0
                    ? 'bg-red-100 text-red-800'
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                {groupPreview.total > 0
                  ? `${formatCount(groupPreview.total)} to delete`
                  : 'Nothing to delete'}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-gray-600">{group.description}</p>

          {/* Per-table counts only once the group is ticked — an unticked group
              showing numbers reads as though it were already scheduled to go. */}
          {isSelected && groupPreview && groupPreview.total > 0 && (
            <ul className="mt-2 space-y-0.5">
              {Object.entries(groupPreview.tables)
                .filter(([, count]) => count > 0)
                .map(([table, count]) => (
                  <li key={table} className="text-xs text-gray-700 flex justify-between max-w-sm">
                    <span>{tableLabel(table)}</span>
                    <span className="font-medium tabular-nums">{formatCount(count)}</span>
                  </li>
                ))}
            </ul>
          )}
        </div>
      </label>
    )
  }

  return (
    <div className="space-y-6">
      {/* What this can and cannot reach */}
      <div className="bg-white rounded-xl border border-red-200 shadow-sm overflow-hidden">
        <div className="bg-red-50 border-b border-red-200 px-6 py-4 flex items-start gap-3">
          <ShieldExclamationIcon className="h-6 w-6 text-red-600 flex-shrink-0" aria-hidden="true" />
          <div>
            <h2 className="text-lg font-semibold text-red-900">Clear Finance Data</h2>
            <p className="text-sm text-red-800 mt-0.5">
              Permanently deletes the records you select. This cannot be undone, and it deletes
              receipts — take a database backup first.
            </p>
          </div>
        </div>

        {excluded.length > 0 && (
          <div className="px-6 py-4 border-b border-gray-100">
            <p className="text-xs font-medium text-gray-700 uppercase tracking-wide">
              Never touched by this screen
            </p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {excluded.map((item) => (
                <li
                  key={item}
                  className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-green-50 text-green-800 border border-green-200"
                >
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="px-6 py-4">
          <div className="max-w-xs">
            <label className="block text-sm font-medium text-gray-700 mb-2">Academic Year</label>
            <Select
              value={academicYear}
              onChange={(event) => {
                setAcademicYear(event.target.value)
                // A confirmation typed for the old year must not carry over.
                setConfirmation('')
              }}
              options={academicYearOptions}
              disabled={clearMutation.isPending}
              className="w-full"
            />
            <p className="mt-1 text-xs text-gray-500">
              Groups marked <span className="font-medium">All years</span> ignore this.
            </p>
          </div>
        </div>
      </div>

      {/* Selection */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-6">
        {groupsQuery.isLoading ? (
          <p className="text-gray-500">Loading data groups...</p>
        ) : (
          <>
            <div className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">
                  Records for {academicYear}
                </h3>
                <p className="text-xs text-gray-500">
                  Cleared for the selected year only. Other years are left alone.
                </p>
              </div>
              <div className="space-y-2">{yearGroups.map(renderGroupRow)}</div>
            </div>

            <div className="space-y-3 pt-2 border-t border-gray-100">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Setup &amp; catalogs</h3>
                <p className="text-xs text-gray-500">
                  These have no academic year. Clearing one empties it for every year at once.
                </p>
              </div>
              <div className="space-y-2">{catalogGroups.map(renderGroupRow)}</div>
            </div>
          </>
        )}

        {/* Blockers: not validation, but data outside the selected year that
            the delete would silently strand. */}
        {blockers.length > 0 && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
            <div className="flex items-start gap-2">
              <ExclamationTriangleIcon
                className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <div className="space-y-2">
                <p className="text-sm font-semibold text-amber-900">
                  This selection would damage records outside {academicYear}
                </p>
                <ul className="space-y-1.5">
                  {blockers.map((blocker, index) => (
                    <li key={`${blocker.group}-${blocker.blocking_table}-${index}`} className="text-xs text-amber-900">
                      {blocker.message}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {hasSelection && previewQuery.isFetching && (
          <p className="text-sm text-gray-500">Counting records...</p>
        )}

        {hasSelection && !previewQuery.isFetching && preview && preview.total === 0 && (
          <Alert
            type="info"
            message={`The groups you selected hold no records for ${academicYear}. There is nothing to clear.`}
            show
          />
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-gray-200">
          <p className="text-sm text-gray-700">
            {hasSelection && preview ? (
              <>
                <span className="font-semibold text-gray-900">
                  {formatCount(preview.total)}
                </span>{' '}
                {preview.total === 1 ? 'record' : 'records'} will be permanently deleted across{' '}
                {selected.length} {selected.length === 1 ? 'group' : 'groups'}.
              </>
            ) : (
              'Select at least one group to see what would be deleted.'
            )}
          </p>
          <div className="flex items-center gap-2">
            {hasSelection && (
              <Button
                type="button"
                color="secondary"
                onClick={() => setSelected([])}
                disabled={clearMutation.isPending}
              >
                Clear selection
              </Button>
            )}
            <Button
              type="button"
              color="danger"
              disabled={!canClear || clearMutation.isPending}
              onClick={() => {
                setConfirmation('')
                setShowConfirm(true)
              }}
            >
              Review &amp; clear
            </Button>
          </div>
        </div>
      </div>

      {/* Past clears — once the rows are gone this is the only record they existed. */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h3 className="text-sm font-semibold text-gray-900">Clearing history</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Kept permanently. After a clear this is the only record those payments were ever entered.
        </p>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  When
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Year
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Groups
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Records
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Cleared by
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {history.map((entry) => (
                <tr key={entry.id}>
                  <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                    {formatDateTime(entry.created_at)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900 font-medium whitespace-nowrap">
                    {entry.academic_year}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {(entry.group_labels ?? []).join(', ')}
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-gray-900 tabular-nums">
                    {formatCount(entry.total_deleted)}
                    {entry.files_failed > 0 && (
                      <span
                        className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800"
                        title={`${entry.files_failed} receipt file(s) could not be removed from storage`}
                      >
                        {entry.files_failed} orphaned file(s)
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {entry.cleared_by_name || '—'}
                    {entry.cleared_by_role && (
                      <span className="text-gray-400"> ({entry.cleared_by_role})</span>
                    )}
                  </td>
                </tr>
              ))}
              {!history.length && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                    {historyQuery.isLoading
                      ? 'Loading history...'
                      : 'No finance data has been cleared.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Final gate. Lists what goes, then asks for the year to be typed. */}
      {showConfirm && preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 flex items-start gap-3">
              <ExclamationTriangleIcon
                className="h-6 w-6 text-red-600 flex-shrink-0"
                aria-hidden="true"
              />
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Permanently delete {formatCount(preview.total)}{' '}
                  {preview.total === 1 ? 'record' : 'records'}?
                </h3>
                <p className="text-sm text-gray-600 mt-0.5">
                  This cannot be undone.
                </p>
              </div>
            </div>

            <div className="px-6 py-4 space-y-4">
              <div className="rounded-lg border border-gray-200 divide-y divide-gray-100">
                {preview.groups
                  .filter((group) => group.total > 0)
                  .map((group) => (
                    <div key={group.key} className="px-3 py-2 flex items-center justify-between gap-3">
                      <span className="text-sm text-gray-800">
                        {group.label}
                        {group.scope === 'catalog' && (
                          <span className="ml-2 text-xs text-gray-500">(all years)</span>
                        )}
                      </span>
                      <span className="text-sm font-medium text-gray-900 tabular-nums">
                        {formatCount(group.total)}
                      </span>
                    </div>
                  ))}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Type <span className="font-mono font-semibold">{academicYear}</span> to confirm
                </label>
                <Input
                  type="text"
                  value={confirmation}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                    setConfirmation(event.target.value)
                  }
                  placeholder={academicYear}
                  disabled={clearMutation.isPending}
                  autoFocus
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-2">
              <Button
                type="button"
                color="secondary"
                onClick={() => {
                  setShowConfirm(false)
                  setConfirmation('')
                }}
                disabled={clearMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                color="danger"
                disabled={!confirmationMatches || clearMutation.isPending}
                onClick={() => clearMutation.mutate()}
              >
                {clearMutation.isPending ? 'Clearing...' : 'Clear data permanently'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default DataClearingView
