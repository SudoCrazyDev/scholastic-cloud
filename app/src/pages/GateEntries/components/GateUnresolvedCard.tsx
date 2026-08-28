import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { HelpCircle, X } from 'lucide-react'
import { gateUnresolvedScanService } from '../../../services/gateUnresolvedScanService'
import { Button } from '../../../components/button'
import type { GateUnresolvedScan } from '../../../types'

interface GateUnresolvedCardProps {
  gateType: 'enter' | 'exit'
}

const relativeTime = (iso: string | null) => {
  if (!iso) return 'unknown'

  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000)

  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`

  return `${Math.floor(seconds / 86400)}d ago`
}

const exactTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : 'unknown')

/**
 * Cards that tapped and could not be matched to a student.
 *
 * **Renders nothing when the list is empty**, which is the normal state — an
 * empty worklist should not take up space on the page, and a permanent "0
 * unmatched cards" panel trains people to stop reading it.
 *
 * These taps used to exist only in `laravel.log`, where the office — the only
 * people who can register the card — would never see them. Nearly every row is
 * one of three things: a new enrolment whose tag was never entered, a
 * replacement card, or a UID typed in wrong.
 */
export default function GateUnresolvedCard({ gateType }: GateUnresolvedCardProps) {
  const queryClient = useQueryClient()

  const { data } = useQuery({
    queryKey: ['gate-unresolved-scans', gateType],
    queryFn: () => gateUnresolvedScanService.getScans(gateType),
    // Kiosks upload backlogs on their own schedule, so this arrives late.
    refetchInterval: 60_000,
  })

  const scans: GateUnresolvedScan[] = data?.data ?? []

  const dismiss = useMutation({
    mutationFn: (id: string) => gateUnresolvedScanService.dismiss(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gate-unresolved-scans'] })
    },
    onError: () => toast.error('Could not dismiss that card.'),
  })

  if (scans.length === 0) return null

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4 shadow-sm">
      <div className="flex items-start gap-2.5">
        <HelpCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-gray-900">
            {scans.length === 1 ? '1 card could not be matched' : `${scans.length} cards could not be matched`}
          </h3>
          <p className="mt-0.5 text-xs text-gray-600">
            These tapped at the {gateType === 'enter' ? 'entrance' : 'exit'} and no student could be
            found for them, so nothing was recorded. Usually a card that has not been registered
            yet — assign it to the student and the next tap will work, and the row here will clear
            itself.
          </p>

          <ul className="mt-3 divide-y divide-amber-200/70">
            {scans.map((scan) => (
              <li key={scan.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="font-mono text-sm text-gray-900 break-all">{scan.rfid_uid}</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {scan.attempts === 1 ? 'once' : `${scan.attempts} taps`}
                    {' · last '}
                    <span title={exactTime(scan.last_seen_at)}>{relativeTime(scan.last_seen_at)}</span>
                    {scan.device_name ? ` · ${scan.device_name}` : ''}
                    {scan.clock_suspect && (
                      <span
                        className="ml-1.5 text-amber-700"
                        title="The kiosk had not reached the server when this tap happened, so the time may be wrong."
                      >
                        · time unverified
                      </span>
                    )}
                  </p>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={dismiss.isPending}
                  leftIcon={<X className="h-4 w-4" />}
                  onClick={() => dismiss.mutate(scan.id)}
                  title="Remove this card from the list"
                >
                  Dismiss
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
