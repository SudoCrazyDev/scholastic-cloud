import { useCallback, useEffect, useRef, useState } from 'react'
import { GateUnauthorizedError, sendHeartbeat, type GateDeviceIdentity } from './client'
import { clockIsTrusted, clockOffsetMs, loadClockOffset } from './clock'
import { countStudents, getMeta, requestPersistence, setMeta } from './db'
import { flushOutbox, pendingScans, submitScan, type ScanSubmission } from './outbox'
import {
  lastSyncedAt,
  requestFullResync,
  resumePending,
  syncPhotos,
  syncRoster,
  type SyncProgress,
} from './sync'

/**
 * Owns the kiosk's background work: keeping the local copy current, telling the
 * portal the device is alive, and reporting enough state for the status chip.
 *
 * Everything here is deliberately off the critical path. A tap reads IndexedDB
 * and nothing in this file can block it — a sync that is failing, a heartbeat
 * that cannot reach the server, and a link that is down all leave the gate
 * working exactly as it was.
 */

/** How often to pull deltas. Cheap on a quiet school — usually an empty page. */
const SYNC_INTERVAL_MS = 30 * 60 * 1000

const HEARTBEAT_INTERVAL_MS = 2 * 60 * 1000

/**
 * How often to take a *full* snapshot instead of a delta. This is the only pass
 * that notices a student deleted outright, since the server has no row left to
 * report them with. Once a day, so it lands overnight rather than mid-morning.
 */
const FULL_RESYNC_INTERVAL_MS = 20 * 60 * 60 * 1000

const FULL_SYNC_KEY = 'last_full_sync'

export interface GateSyncState {
  online: boolean
  syncing: boolean
  progress: SyncProgress
  lastSync: string | null
  rosterCount: number
  clockTrusted: boolean
  /** Scans taken and not yet acknowledged by the server. */
  pending: number
  /** The device's token was refused — it must be paired again. */
  revoked: boolean
  syncNow: () => void
  /**
   * Record a tap. Returns as soon as the scan is **safely on disk**, saying
   * whether the server has acknowledged it yet — see `outbox.ts`.
   */
  recordScan: (rfidUid: string, type: 'enter' | 'exit') => Promise<ScanSubmission>
}

export function useGateSync(device: GateDeviceIdentity | null): GateSyncState {
  const [online, setOnline] = useState(() => navigator.onLine)
  const [syncing, setSyncing] = useState(false)
  const [progress, setProgress] = useState<SyncProgress>({
    phase: 'idle',
    students: 0,
    photos: 0,
    photosWanted: 0,
  })
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [rosterCount, setRosterCount] = useState(0)
  const [clockTrusted, setClockTrusted] = useState(false)
  const [pending, setPending] = useState(0)
  const [revoked, setRevoked] = useState(false)

  // A sync can outlive the interval that started it on a slow link; overlapping
  // runs would fight over the resume cursor.
  const running = useRef(false)

  // Two drains at once would upload the same rows twice. Harmless — the server
  // is idempotent — but pointless on a link this slow, so they are serialised.
  // A tap's own upload deliberately does *not* wait behind this.
  const flushing = useRef(false)

  const refreshPending = useCallback(async () => {
    setPending(await pendingScans())
  }, [])

  /**
   * Upload whatever is queued.
   *
   * Never rejects: a failed flush is the normal state of a kiosk on a bad link,
   * and every caller here is a timer or an event handler.
   */
  const drainOutbox = useCallback(async () => {
    if (!device || flushing.current) return

    flushing.current = true

    try {
      const outcome = await flushOutbox()

      // An upload that came back is proof the link is up — worth saying,
      // because otherwise the chip reads "offline" until the next heartbeat
      // while the kiosk is demonstrably uploading.
      if (outcome.contacted) {
        setOnline(true)
        setClockTrusted(clockIsTrusted())
      }
    } catch (error) {
      if (error instanceof GateUnauthorizedError) setRevoked(true)
      // Anything else is a link that will be back. The rows are still on disk.
    } finally {
      flushing.current = false
      await refreshPending()
    }
  }, [device, refreshPending])

  /**
   * The write path, from the kiosk's point of view.
   *
   * The queue write happens before this returns, so by the time the card is on
   * screen the scan is durable. The upload attempt is part of the same call
   * only so an online gate settles to "recorded" immediately, exactly as it did
   * before the outbox existed.
   */
  const recordScan = useCallback(
    async (rfidUid: string, type: 'enter' | 'exit'): Promise<ScanSubmission> => {
      const submission = await submitScan({ rfidUid, type })

      await refreshPending()

      // A queued scan means the link is down or refusing; a later flush will
      // find out which. Nothing here is allowed to throw.
      if (submission.status === 'queued') {
        setOnline(false)
      } else {
        setOnline(true)
      }

      return submission
    },
    [refreshPending],
  )

  const runSync = useCallback(async () => {
    if (!device || running.current) return

    running.current = true
    setSyncing(true)

    try {
      const lastFull = await getMeta<number>(FULL_SYNC_KEY, 0)

      // Not while a pass is part-finished: asking for a full snapshot throws
      // the resume cursor away, and on a link slow enough to need several
      // attempts that restarts the same first sync forever.
      if (Date.now() - lastFull > FULL_RESYNC_INTERVAL_MS && !(await resumePending())) {
        await requestFullResync()
      }

      // Roster first, and completely: the kiosk is a working gate the moment
      // this finishes, with or without any faces.
      const outcome = await syncRoster(setProgress)

      // The roster came down, so the link is up whatever the last beat thought.
      setOnline(true)

      // Only a full snapshot resets the clock on the next one. Stamping this
      // after every delta pushed the deadline forward every half hour, so the
      // daily full sync never ran a second time — and pruning a hard-deleted
      // student is the only thing it is for.
      if (outcome.full) {
        await setMeta(FULL_SYNC_KEY, Date.now())
      }

      setLastSync(await lastSyncedAt())
      setRosterCount(await countStudents())

      // Before the photo pass, which is the slowest thing the kiosk does: a
      // scan waiting to upload matters more than a face waiting to arrive.
      await drainOutbox()

      await syncPhotos(setProgress)
    } catch (error) {
      if (error instanceof GateUnauthorizedError) {
        // The token was revoked and the local copy has already been wiped.
        setRevoked(true)
      }
      // Anything else is a link that will be back. The cache still serves taps.
    } finally {
      running.current = false
      setSyncing(false)
      setClockTrusted(clockIsTrusted())
      setRosterCount(await countStudents())
      await refreshPending()
    }
  }, [device, drainOutbox, refreshPending])

  // Boot: restore the clock correction and ask to keep the cache, then sync.
  useEffect(() => {
    if (!device) return

    let cancelled = false

    // A freshly adopted device starts from a clean slate: `revoked` belongs to
    // the token that was refused, and leaving it set would leave the kiosk
    // showing the pairing screen it has just come back from.
    setRevoked(false)

    void (async () => {
      await loadClockOffset()
      await requestPersistence()

      if (cancelled) return

      setClockTrusted(clockIsTrusted())
      setLastSync(await lastSyncedAt())
      setRosterCount(await countStudents())
      await refreshPending()

      void runSync()
    })()

    return () => {
      cancelled = true
    }
  }, [device, runSync, refreshPending])

  useEffect(() => {
    if (!device) return

    const timer = window.setInterval(() => void runSync(), SYNC_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [device, runSync])

  // Heartbeat carries what the device believes about its own local copy, so a
  // kiosk stuck mid-sync or running on a wrong clock is visible in the portal
  // rather than only at the gate.
  useEffect(() => {
    if (!device) return

    const beat = async () => {
      try {
        await sendHeartbeat({
          roster_count: await countStudents(),
          pending_count: await pendingScans(),
          clock_offset_ms: clockOffsetMs() ?? undefined,
          last_sync_at: await lastSyncedAt(),
        })
        setOnline(true)
        // Every answer from the server carries a `Date`, so a beat that gets
        // through has just set this device's clock. Saying otherwise would
        // leave the amber "clock not set" note up for up to half an hour after
        // it stopped being true.
        setClockTrusted(clockIsTrusted())

        // The heartbeat just proved the link works, so this is the cheapest
        // moment to clear a backlog — and the only one that recovers a kiosk
        // whose scans are queued but whose roster is already current.
        await drainOutbox()
      } catch (error) {
        if (error instanceof GateUnauthorizedError) setRevoked(true)
        else setOnline(false)
      }
    }

    void beat()
    const timer = window.setInterval(() => void beat(), HEARTBEAT_INTERVAL_MS)

    return () => window.clearInterval(timer)
  }, [device, drainOutbox])

  useEffect(() => {
    const goOnline = () => {
      setOnline(true)
      // A link that just came back is the best moment to catch up. Scans first:
      // they are the only thing here that exists nowhere else.
      void drainOutbox()
      void runSync()
    }
    const goOffline = () => setOnline(false)

    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)

    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [runSync, drainOutbox])

  return {
    online,
    syncing,
    progress,
    lastSync,
    rosterCount,
    clockTrusted,
    pending,
    revoked,
    syncNow: () => {
      void drainOutbox()
      void runSync()
    },
    recordScan,
  }
}
