import React, { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ShieldExclamationIcon,
} from '@heroicons/react/24/outline'
import { toast } from 'react-hot-toast'
import { Button } from '../../components/button'
import { Input } from '../../components/input'
import { Select } from '../../components/select'
import { institutionCleanupService } from '../../services/institutionCleanupService'
import type { InstitutionCleanupGroup } from '../../types'

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
 * Administration → Institution Clean-up.
 *
 * Platform administration, super-administrator only, and the most destructive
 * screen on the platform: a run empties one tenant's academic, finance, HRIS,
 * device and messaging records across *every* academic year it has, keeping
 * only its students and staff.
 *
 * The layout is the Finance clear's three steps — choose, read back, confirm —
 * with three deliberate differences, each answering something the Finance
 * version does not have to:
 *
 *  - **The institution is chosen, and chosen first.** Nothing else on the page
 *    enables until it is. The mistake worth designing against here is not "did
 *    not mean to run it" but "ran it against the wrong school", so the target is
 *    picked explicitly and is what gets typed back at the end.
 *  - **What survives is stated as loudly as what goes.** The whole premise is
 *    that the people come out the other side, so the kept list sits beside the
 *    selection rather than under it, and the preview reports the students and
 *    staff being kept as a number next to the number being deleted.
 *  - **There is no year selector.** A clean-up has no academic year. Saying so
 *    outright is better than leaving its absence to be noticed.
 */
const InstitutionCleanup: React.FC = () => {
  const queryClient = useQueryClient()
  const [institutionId, setInstitutionId] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [confirmation, setConfirmation] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)

  const groupsQuery = useQuery({
    queryKey: ['institution-cleanup-groups'],
    queryFn: () => institutionCleanupService.getGroups(),
  })

  const historyQuery = useQuery({
    queryKey: ['institution-cleanup-history'],
    queryFn: () => institutionCleanupService.getHistory(),
  })

  const groups = useMemo<InstitutionCleanupGroup[]>(
    () => groupsQuery.data?.data?.groups ?? [],
    [groupsQuery.data]
  )
  const kept = groupsQuery.data?.data?.kept ?? []
  const institutions = useMemo(
    () => groupsQuery.data?.data?.institutions ?? [],
    [groupsQuery.data]
  )
  const history = historyQuery.data?.data ?? []

  const institution = institutions.find((item) => item.id === institutionId)

  /** Grouped by area so the list reads as areas of the school, not 98 tables. */
  const areas = useMemo(() => {
    const byArea = new Map<string, InstitutionCleanupGroup[]>()
    groups.forEach((group) => {
      byArea.set(group.area, [...(byArea.get(group.area) ?? []), group])
    })
    return Array.from(byArea.entries())
  }, [groups])

  // The preview is the only thing that reports what would actually go, so it is
  // re-fetched whenever the institution or the selection changes and the counts
  // below are never carried over from a previous target.
  const previewQuery = useQuery({
    queryKey: ['institution-cleanup-preview', institutionId, [...selected].sort().join(',')],
    queryFn: () => institutionCleanupService.preview(institutionId, selected),
    enabled: Boolean(institutionId) && selected.length > 0,
  })

  const preview = previewQuery.data?.data
  const blockers = preview?.blockers ?? []
  const hasSelection = selected.length > 0

  const cleanupMutation = useMutation({
    mutationFn: () =>
      institutionCleanupService.clear({ institutionId, groups: selected, confirmation }),
    onSuccess: (response) => {
      toast.success(response.message || 'Institution cleaned up.')
      setShowConfirm(false)
      setConfirmation('')
      setSelected([])
      queryClient.invalidateQueries({ queryKey: ['institution-cleanup-history'] })
      queryClient.invalidateQueries({ queryKey: ['institution-cleanup-preview'] })
      /*
       * A super-administrator works across tenants and may well have the school
       * they just emptied open in another tab. Rather than name the dozens of
       * query keys a clean-up invalidates — every one of them, in every module —
       * drop the whole cache: anything still on screen is now describing records
       * that no longer exist.
       */
      queryClient.clear()
    },
    onError: (error: unknown) => {
      // A 422 here is usually a blocker the preview did not have yet — a staff
      // member moved onto a school-built role between the count and the confirm
      // — so the server's message is more useful than a generic failure.
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(message || 'Failed to clean up the institution.')
    },
  })

  const toggleGroup = (key: string) => {
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
  }

  const changeInstitution = (id: string) => {
    setInstitutionId(id)
    // Nothing selected for one school may carry over to another, and a
    // confirmation typed for the old target certainly must not.
    setSelected([])
    setConfirmation('')
  }

  const confirmationMatches = confirmation.trim() === (institution?.title ?? '').trim()
  const canClean =
    Boolean(institutionId) &&
    hasSelection &&
    Boolean(preview?.clearable) &&
    (preview?.total ?? 0) > 0 &&
    !previewQuery.isFetching

  const renderGroupRow = (group: InstitutionCleanupGroup) => {
    const isSelected = selected.includes(group.key)
    const groupPreview = preview?.groups.find((g) => g.key === group.key)
    const isBlocked = blockers.some((b) => b.group === group.key)

    return (
      <label
        key={group.key}
        className={`flex gap-3 p-4 rounded-lg border transition-colors ${
          !institutionId
            ? 'border-gray-200 opacity-50 cursor-not-allowed'
            : isBlocked
              ? 'border-amber-300 bg-amber-50 cursor-pointer'
              : isSelected
                ? 'border-red-300 bg-red-50 cursor-pointer'
                : 'border-gray-200 hover:bg-gray-50 cursor-pointer'
        }`}
      >
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
          checked={isSelected}
          onChange={() => toggleGroup(group.key)}
          disabled={!institutionId || cleanupMutation.isPending}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-gray-900">{group.label}</span>
            {group.includes_trashed.length > 0 && (
              <span
                className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-200 text-gray-700"
                title="Includes rows already deleted in the app but still on file — a waived late fee, a deleted chat message."
              >
                Includes deleted rows
              </span>
            )}
            {isSelected && groupPreview && (
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                  groupPreview.total > 0 ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-600'
                }`}
              >
                {groupPreview.total > 0
                  ? `${formatCount(groupPreview.total)} to delete`
                  : 'Nothing to delete'}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-gray-600">{group.description}</p>
        </div>
      </label>
    )
  }

  return (
    <div className="space-y-6">
      {/* What this is, and the one instruction that matters before running it. */}
      <div className="bg-white rounded-xl border border-red-200 shadow-sm overflow-hidden">
        <div className="bg-red-50 border-b border-red-200 px-6 py-4 flex items-start gap-3">
          <ShieldExclamationIcon className="h-6 w-6 text-red-600 flex-shrink-0" aria-hidden="true" />
          <div>
            <h1 className="text-lg font-semibold text-red-900">Institution Clean-up</h1>
            <p className="text-sm text-red-800 mt-0.5">
              Empties one school back to its people. This deletes the records you select for{' '}
              <span className="font-semibold">every academic year at once</span> — there is no year
              to choose and there is no undo. Take a database backup first.
            </p>
          </div>
        </div>

        <div className="px-6 py-4">
          <div className="max-w-md">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Institution to clean up
            </label>
            <Select
              value={institutionId}
              onChange={(event) => changeInstitution(event.target.value)}
              options={[
                { value: '', label: 'Select an institution…' },
                ...institutions.map((item) => ({
                  value: item.id,
                  label: item.abbr ? `${item.title} (${item.abbr})` : item.title,
                })),
              ]}
              disabled={cleanupMutation.isPending || groupsQuery.isLoading}
              className="w-full"
            />
            <p className="mt-1 text-xs text-gray-500">
              Everything below applies to this school only. You will be asked to type its name to
              confirm.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Selection */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-6">
          {groupsQuery.isLoading ? (
            <p className="text-gray-500">Loading clean-up groups...</p>
          ) : (
            areas.map(([area, areaGroups]) => (
              <div key={area} className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-900">{area}</h3>
                <div className="space-y-2">{areaGroups.map(renderGroupRow)}</div>
              </div>
            ))
          )}

          {/* Blockers: not validation, but rows the run would leave broken. */}
          {blockers.length > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
              <div className="flex items-start gap-2">
                <ExclamationTriangleIcon
                  className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-amber-900">
                    This selection would leave surviving records broken
                  </p>
                  <ul className="space-y-1.5">
                    {blockers.map((blocker, index) => (
                      <li
                        key={`${blocker.group}-${blocker.blocking_table}-${index}`}
                        className="text-xs text-amber-900"
                      >
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

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-gray-200">
            <p className="text-sm text-gray-700">
              {!institutionId ? (
                'Choose an institution to begin.'
              ) : hasSelection && preview ? (
                <>
                  <span className="font-semibold text-gray-900">
                    {formatCount(preview.total)}
                  </span>{' '}
                  {preview.total === 1 ? 'record' : 'records'} will be permanently deleted from{' '}
                  {institution?.title}
                  {preview.files > 0 && <>, along with {formatCount(preview.files)} uploaded file(s)</>}.
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
                  disabled={cleanupMutation.isPending}
                >
                  Clear selection
                </Button>
              )}
              <Button
                type="button"
                color="secondary"
                onClick={() => setSelected(groups.map((group) => group.key))}
                disabled={!institutionId || cleanupMutation.isPending}
              >
                Select everything
              </Button>
              <Button
                type="button"
                color="danger"
                disabled={!canClean || cleanupMutation.isPending}
                onClick={() => {
                  setConfirmation('')
                  setShowConfirm(true)
                }}
              >
                Review &amp; clean up
              </Button>
            </div>
          </div>
        </div>

        {/* The promise. Deliberately beside the selection, not beneath it. */}
        <div className="bg-white rounded-xl border border-green-200 shadow-sm p-6 space-y-4 h-fit">
          <div className="flex items-start gap-2">
            <CheckCircleIcon className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <h3 className="text-sm font-semibold text-gray-900">What a clean-up never deletes</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                True however many groups you tick.
              </p>
            </div>
          </div>

          {preview && (
            <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2">
              <p className="text-xs text-green-900">
                <span className="font-semibold tabular-nums">
                  {formatCount(preview.retained.students)}
                </span>{' '}
                students and{' '}
                <span className="font-semibold tabular-nums">
                  {formatCount(preview.retained.staff)}
                </span>{' '}
                staff stay on {institution?.title}.
              </p>
            </div>
          )}

          <ul className="space-y-3">
            {kept.map((item) => (
              <li key={item.label}>
                <p className="text-xs font-medium text-gray-900">{item.label}</p>
                <p className="text-xs text-gray-600 mt-0.5">{item.detail}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Past clean-ups — once the rows are gone this is the only record of them. */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h3 className="text-sm font-semibold text-gray-900">Clean-up history</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Every institution, kept permanently. After a clean-up this is the only record those
          records were ever entered.
        </p>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  When
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Institution
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
                  <td className="px-4 py-3 text-sm text-gray-900 font-medium">
                    {entry.institution_title}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {(entry.group_labels ?? []).join(', ')}
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-gray-900 tabular-nums">
                    {formatCount(entry.total_deleted)}
                    {entry.files_failed > 0 && (
                      <span
                        className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800"
                        title={`${entry.files_failed} file(s) could not be removed from storage`}
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
                      : 'No institution has been cleaned up.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Final gate. Names the school, lists what goes, then asks for the name. */}
      {showConfirm && preview && institution && (
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
                  {preview.total === 1 ? 'record' : 'records'} from {institution.title}?
                </h3>
                <p className="text-sm text-gray-600 mt-0.5">
                  Across every academic year. This cannot be undone.
                </p>
              </div>
            </div>

            <div className="px-6 py-4 space-y-4">
              <div className="rounded-lg border border-gray-200 divide-y divide-gray-100">
                {preview.groups
                  .filter((group) => group.total > 0)
                  .map((group) => (
                    <div
                      key={group.key}
                      className="px-3 py-2 flex items-center justify-between gap-3"
                    >
                      <span className="text-sm text-gray-800">{group.label}</span>
                      <span className="text-sm font-medium text-gray-900 tabular-nums">
                        {formatCount(group.total)}
                      </span>
                    </div>
                  ))}
              </div>

              <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2">
                <p className="text-xs text-green-900">
                  Kept:{' '}
                  <span className="font-semibold tabular-nums">
                    {formatCount(preview.retained.students)}
                  </span>{' '}
                  students and{' '}
                  <span className="font-semibold tabular-nums">
                    {formatCount(preview.retained.staff)}
                  </span>{' '}
                  staff, with their profiles and logins.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Type <span className="font-mono font-semibold">{institution.title}</span> to
                  confirm
                </label>
                <Input
                  type="text"
                  value={confirmation}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                    setConfirmation(event.target.value)
                  }
                  placeholder={institution.title}
                  disabled={cleanupMutation.isPending}
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
                disabled={cleanupMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                color="danger"
                disabled={!confirmationMatches || cleanupMutation.isPending}
                onClick={() => cleanupMutation.mutate()}
              >
                {cleanupMutation.isPending ? 'Cleaning up...' : 'Clean up permanently'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default InstitutionCleanup
