import { clockIsTrusted, correctedNow } from './clock'
import { countOutbox, deleteOutbox, enqueueScan, outboxBatch, type QueuedScan } from './db'
import { uploadScans, type ScanResult } from './client'

/**
 * The queue between a tap and the server.
 *
 * This is the phase-4 cutover: a tap no longer waits on the network to be
 * *recorded*, only to be acknowledged. The scan is written to IndexedDB before
 * the card is drawn, and from that moment the record exists whether or not the
 * link does.
 *
 * Three rules hold the whole thing up, and each of them is the answer to a way
 * attendance gets lost:
 *
 *  1. **Write first, upload second.** The row is on disk before anything else
 *     happens, so a kiosk that loses power between the tap and the reply still
 *     has the scan.
 *  2. **Delete only on an answer about that exact row.** Not "the batch went",
 *     not a count — the server names every `client_scan_id` it handled, and only
 *     those are removed. A reply that arrives half-read costs nothing.
 *  3. **Retrying is free.** `client_scan_id` is generated here and the server is
 *     idempotent on it, so a device that cannot tell "recorded" from "reply lost
 *     on the way back" can simply send again. That is also why concurrent
 *     uploads need no lock: the worst case is a row uploaded twice and recorded
 *     once.
 */

/**
 * Rows per upload. Well under the server's cap of 200, because the point of a
 * small batch is that a bad link can finish *one* of them: a device returning
 * from an outage with 900 scans gets 18 acknowledged uploads rather than one
 * request that has to survive from end to end.
 */
const UPLOAD_BATCH = 50

/** What happened to one tap, from the point of view of the screen at the gate. */
export interface ScanSubmission {
  clientScanId: string
  /** `queued` means saved locally and not yet acknowledged — not an error. */
  status: 'recorded' | 'queued' | 'rejected'
  reason?: ScanResult['reason']
  student?: ScanResult['student']
}

export interface FlushOutcome {
  uploaded: number
  rejected: number
  remaining: number
  /**
   * Whether the server actually answered. An empty queue proves nothing about
   * the link, and the status chip must not claim it does.
   */
  contacted: boolean
}

/**
 * Queue a tap and try to upload it straight away.
 *
 * The immediate upload is a single-row batch on purpose: it is the only request
 * a person is waiting on, it keeps an online kiosk behaving exactly as it did
 * before the outbox existed, and a one-row reply is the one that carries the
 * student's name for a card this device could not resolve itself.
 */
export async function submitScan(scan: {
  rfidUid: string
  type: 'enter' | 'exit'
}): Promise<ScanSubmission> {
  const row: QueuedScan = {
    client_scan_id: newScanId(),
    rfid_uid: scan.rfidUid,
    // The corrected clock, not the device's own — a Pi with no RTC would
    // otherwise stamp attendance with whenever it was last switched off.
    scanned_at: correctedNow().toISOString(),
    clock_suspect: !clockIsTrusted(),
    type: scan.type,
    queued_at: Date.now(),
  }

  await enqueueScan(row)

  try {
    const results = await uploadScans([row], Math.max(0, (await countOutbox()) - 1))
    const mine = results.find((result) => result.client_scan_id === row.client_scan_id)

    if (!mine) {
      // The server answered about something else entirely. Keep the row.
      return { clientScanId: row.client_scan_id, status: 'queued' }
    }

    await deleteOutbox([mine.client_scan_id])

    return {
      clientScanId: row.client_scan_id,
      // A duplicate is a success: it means this scan is already recorded.
      status: mine.status === 'rejected' ? 'rejected' : 'recorded',
      reason: mine.reason,
      student: mine.student,
    }
  } catch {
    // Offline, slow, or refused — the scan is on disk and will go up with the
    // next flush. The one thing this must not do is throw the tap away.
    return { clientScanId: row.client_scan_id, status: 'queued' }
  }
}

/**
 * Upload everything waiting, oldest first.
 *
 * Stops on the first upload that cannot be acknowledged and leaves the rest
 * queued — there is no point spending a bad link on rows that will be resent
 * anyway, and no row is ever dropped to make progress. A `GateUnauthorizedError`
 * propagates: the caller has to know the device was revoked.
 */
export async function flushOutbox(): Promise<FlushOutcome> {
  let uploaded = 0
  let rejected = 0
  let contacted = false

  for (;;) {
    const batch = await outboxBatch(UPLOAD_BATCH)

    if (batch.length === 0) break

    const queued = await countOutbox()
    const results = await uploadScans(batch, Math.max(0, queued - batch.length))

    contacted = true

    // Only ids we actually sent, and only ids the server named. Anything else
    // stays put and goes again.
    const sent = new Set(batch.map((row) => row.client_scan_id))
    const acknowledged: string[] = []

    for (const result of results) {
      if (!sent.has(result.client_scan_id)) continue

      acknowledged.push(result.client_scan_id)

      if (result.status === 'accepted') uploaded++
      // Terminal, and the only case where a scan leaves without being recorded:
      // the server could not resolve the card at all, so retrying is pointless.
      // `GateKioskController::scans` logs it, because nothing else will.
      if (result.status === 'rejected') rejected++
    }

    if (acknowledged.length === 0) break

    await deleteOutbox(acknowledged)

    // A short batch means the queue is drained.
    if (batch.length < UPLOAD_BATCH) break
  }

  return { uploaded, rejected, remaining: await countOutbox(), contacted }
}

export async function pendingScans(): Promise<number> {
  return countOutbox()
}

function newScanId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  // Chromium exposes randomUUID only on a secure origin, and a kiosk may be
  // served over plain HTTP on a LAN. Uniqueness is all this needs.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}
