import { getMeta, setMeta } from './db'

/**
 * What time it actually is, on a device that may not know.
 *
 * A Raspberry Pi has no real-time clock. Booted without a network it starts
 * from whenever it was last shut down — hours or days out — and every scan it
 * stamps carries that error into `rfid_scan_logs`, which is what attendance is
 * read from. A wrong wall-clock *day* is not recoverable after the fact.
 *
 * So every response from the API teaches the kiosk the time: `Date` is a
 * mandatory HTTP header, so this costs nothing extra and works on the very
 * first call, before the device has any other reason to talk to the server.
 *
 * Precision is roughly a second — the header has no sub-second field, and the
 * reply spent some unknown time in flight. That is far below what a gate log
 * needs, and enormously better than an unsynchronised Pi.
 */

const OFFSET_KEY = 'clock_offset_ms'

/** serverTime − deviceTime, in ms. Null until the device has heard from a server. */
let offsetMs: number | null = null
let loaded = false

/** Restore the last known offset, so a reboot starts corrected rather than raw. */
export async function loadClockOffset(): Promise<void> {
  if (loaded) return

  const stored = await getMeta<number | null>(OFFSET_KEY, null)

  // Checked again after the read: a reply can land while it is in flight, and a
  // live reading from the server always beats one off the disk. Overwriting a
  // fresh offset with a stale one would leave the device wrong *and* convinced
  // its clock had been set.
  if (loaded) return

  offsetMs = stored
  loaded = true
}

export function recordServerTime(dateHeader: string | null): void {
  if (!dateHeader) return

  const serverMs = Date.parse(dateHeader)
  if (Number.isNaN(serverMs)) return

  offsetMs = serverMs - Date.now()
  loaded = true

  // Persisted so the correction survives a reboot that happens while the link
  // is down — the case where the device needs it most.
  void setMeta(OFFSET_KEY, offsetMs)
}

/** Best available current time. Falls back to the device's own clock. */
export function correctedNow(): Date {
  return new Date(Date.now() + (offsetMs ?? 0))
}

export function clockOffsetMs(): number | null {
  return offsetMs
}

/**
 * Whether the device has heard a real clock since it was provisioned.
 *
 * False means every timestamp it produces is only as good as an unsynchronised
 * Pi's — worth surfacing rather than hiding, because it is the difference
 * between a scan landing on the right school day and the wrong one.
 */
export function clockIsTrusted(): boolean {
  return offsetMs !== null
}
