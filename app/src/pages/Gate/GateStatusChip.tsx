import React from 'react'
import type { GateSyncState } from './offline/useGateSync'

interface GateStatusChipProps {
  state: GateSyncState
}

/**
 * How stale a roster has to get before the gate says so.
 *
 * A kiosk keeps taking taps however long the link is down — dropping a student's
 * scan is never the better trade — but a roster this old will have stopped
 * matching the school: withdrawn students still resolve, new cards do not.
 * Saying it out loud is what turns a silent wrong answer into a visible one.
 */
const STALE_AFTER_HOURS = 26

/**
 * What the local copy is doing, in one line at the top of the kiosk.
 *
 * Offline is a **normal state here, not an error** — the whole point of the
 * feature is that a dead link is uneventful — so it reads as a quiet grey note
 * rather than anything alarming. Two things do earn amber, because both mean the
 * data leaving this device is doubtful: a clock that has never been set, and a
 * roster old enough to have drifted from the school.
 *
 * Scans waiting to upload are **not** amber. They are the outbox working.
 */
const GateStatusChip: React.FC<GateStatusChipProps> = ({ state }) => {
  const { online, syncing, progress, rosterCount, clockTrusted, pending, lastSync } = state

  const photosPending = Math.max(0, progress.photosWanted - progress.photos)
  const staleHours = hoursSince(lastSync)

  const parts: string[] = []

  if (rosterCount > 0) {
    parts.push(`${rosterCount.toLocaleString()} students`)
  }

  if (pending > 0) {
    // The number a head teacher actually wants during an outage: how much of
    // this morning is still only on the kiosk.
    parts.push(`${pending.toLocaleString()} ${pending === 1 ? 'scan' : 'scans'} to upload`)
  }

  if (syncing) {
    parts.push(progress.phase === 'photos' ? `photos ${progress.photos}/${progress.photosWanted}` : 'syncing…')
  } else if (photosPending > 0) {
    // Worth saying plainly: the gate is fully working, it just has faces still
    // to collect. Otherwise a half-populated kiosk reads as broken.
    parts.push(`${photosPending.toLocaleString()} photos to fetch`)
  }

  if (!online) {
    parts.push('offline — using local roster')
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      <button
        type="button"
        onClick={state.syncNow}
        title="Sync now"
        className="flex items-center gap-2 rounded-full border border-gray-200 bg-white/70 px-3 py-1 text-gray-500 transition-colors hover:bg-white"
      >
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            syncing ? 'bg-amber-400 animate-pulse' : online ? 'bg-emerald-500' : 'bg-gray-300'
          }`}
        />
        <span className="tabular-nums">{parts.join(' · ') || 'no roster yet'}</span>
      </button>

      {staleHours !== null && staleHours >= STALE_AFTER_HOURS && (
        <span
          title="This kiosk has not reached the server in over a day, so its roster may no longer match the school."
          className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-700 tabular-nums"
        >
          roster {Math.floor(staleHours / 24)}d old
        </span>
      )}

      {!clockTrusted && (
        <span
          title="This kiosk has not reached the server since it started, so its clock may be wrong."
          className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-700"
        >
          clock not set
        </span>
      )}
    </div>
  )
}

function hoursSince(iso: string | null): number | null {
  if (!iso) return null

  const then = Date.parse(iso)
  if (Number.isNaN(then)) return null

  return (Date.now() - then) / 3_600_000
}

export default GateStatusChip
