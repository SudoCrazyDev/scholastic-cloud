import { clearAll, type QueuedScan } from './db'
import { recordServerTime } from './clock'

/**
 * The kiosk's own HTTP client, carrying a **device** token.
 *
 * Deliberately not the app's shared axios instance (`lib/api`): that one
 * attaches the signed-in staff user's token and, on any 401, clears storage and
 * navigates to `/login`. On an unattended gate terminal that would replace the
 * kiosk with a login form and leave the gate dead until someone noticed. This
 * client answers a 401 by wiping the local roster instead, which is what a
 * revoked device is supposed to do.
 */

const API_BASE_URL = (import.meta.env.VITE_API_URL as string) || 'http://localhost:8000/api'

const TOKEN_KEY = 'gate_device_token'
const DEVICE_KEY = 'gate_device'

export interface GateDeviceIdentity {
  id: string
  name: string
  location: string | null
  gate_type: 'enter' | 'exit' | 'both'
  institution_id: string
}

export interface RosterPage {
  full: boolean
  synced_at: string
  has_more: boolean
  next_cursor: string | null
  students: Array<{
    id: string
    first_name: string
    middle_name: string | null
    last_name: string | null
    ext_name: string | null
    grade_level: string | null
    section: string | null
    rfid_uids: string[]
    photo_hash: string | null
  }>
  removed_ids: string[]
}

/** The device's token was refused — it has been unpaired, deleted, or revoked. */
export class GateUnauthorizedError extends Error {
  constructor() {
    super('This kiosk is no longer paired.')
    this.name = 'GateUnauthorizedError'
  }
}

export function deviceToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function storedDevice(): GateDeviceIdentity | null {
  try {
    const raw = localStorage.getItem(DEVICE_KEY)
    return raw ? (JSON.parse(raw) as GateDeviceIdentity) : null
  } catch {
    return null
  }
}

export function isPaired(): boolean {
  return deviceToken() !== null && storedDevice() !== null
}

function storeSession(token: string, device: GateDeviceIdentity): void {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(DEVICE_KEY, JSON.stringify(device))
}

/**
 * Forget the token *and* everything it unlocked.
 *
 * Dropping the credential while leaving the roster behind would leave a
 * school's names and faces on a device nobody can reach any more, which is
 * exactly the case revocation exists to handle.
 */
export async function signOutDevice(): Promise<void> {
  try {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(DEVICE_KEY)
  } catch {
    // A locked-down profile can refuse storage; the wipe below still matters.
  }
  await clearAll().catch(() => undefined)
}

async function gateFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = deviceToken()
  if (!token) throw new GateUnauthorizedError()

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init.headers ?? {}),
      Authorization: `Bearer ${token}`,
    },
  })

  // Every answer is a chance to learn what time it really is — a Pi has no RTC,
  // so this may be the only correct clock the device ever sees.
  recordServerTime(response.headers.get('Date'))

  if (response.status === 401) {
    await signOutDevice()
    throw new GateUnauthorizedError()
  }

  if (!response.ok) {
    throw new Error(`${path} failed with ${response.status}`)
  }

  return response
}

/** Exchange a pairing code for a device token. Runs before any token exists. */
export async function pairDevice(pairingCode: string): Promise<GateDeviceIdentity> {
  const response = await fetch(`${API_BASE_URL}/gate/pair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ pairing_code: pairingCode.trim().toUpperCase(), app_version: appVersion() }),
  })

  recordServerTime(response.headers.get('Date'))

  const body = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(body?.message || 'That pairing code was not accepted.')
  }

  // Belt and braces on the clock: the `Date` header needs a CORS exposure to be
  // readable at all, so the endpoints that can afford to also answer with an
  // explicit `server_time` in the body. A proxy that strips the exposure then
  // costs the kiosk nothing.
  recordServerTime(body.server_time ?? null)

  storeSession(body.token, body.device)

  return body.device as GateDeviceIdentity
}

export async function fetchRosterPage(params: {
  since?: string | null
  cursor?: string | null
  limit?: number
}): Promise<RosterPage> {
  const query = new URLSearchParams()
  if (params.since) query.set('since', params.since)
  if (params.cursor) query.set('cursor', params.cursor)
  if (params.limit) query.set('limit', String(params.limit))

  const response = await gateFetch(`/gate/roster?${query.toString()}`)

  return (await response.json()) as RosterPage
}

/**
 * A student's cached-size photo. Fetched rather than pointed at with an `<img>`
 * because the endpoint needs an Authorization header — and because the bytes
 * have to be readable to be stored, which an opaque cross-origin response would
 * not be.
 */
export async function fetchPhoto(studentId: string): Promise<FetchedPhoto | null> {
  try {
    // `no-store` on purpose, against an endpoint that advertises
    // `immutable, max-age=1y`. Two reasons, both measured:
    //
    //  - The kiosk *is* the cache. Letting Chromium keep its own copy as well
    //    means ~90 MB of thumbnails stored twice on the same SD card, competing
    //    for the same quota as the IndexedDB store this device asked to have
    //    made persistent.
    //  - A response replayed out of the HTTP cache arrives with no readable
    //    `ETag` and no readable `Date` — verified in Chromium — so a cache hit
    //    silently costs the photo its real hash and costs the device a chance to
    //    learn what time it is.
    const response = await gateFetch(`/gate/photo/${studentId}`, { cache: 'no-store' })
    const blob = await response.blob()

    return { blob, hash: hashFromETag(response.headers.get('ETag')) }
  } catch (error) {
    if (error instanceof GateUnauthorizedError) throw error
    // A student whose photo is missing from the bucket must not stall the pass.
    return null
  }
}

export interface FetchedPhoto {
  blob: Blob
  /** The hash the *bytes* actually carry, when the server said so. */
  hash: string | null
}

/**
 * The photo endpoint's `ETag` is the content hash of the thumbnail, which is the
 * same value the roster advertises — so it is the key these bytes belong under.
 * It matters when a picture is replaced between the roster pass and the photo
 * pass: storing the new bytes under the hash the roster happened to mention
 * leaves a blob whose key does not describe it, and the next sync then fetches
 * the same image again.
 *
 * Requires `ETag` in the API's CORS `exposed_headers`; null here if a proxy
 * strips it, and the caller falls back to the roster's hash.
 */
function hashFromETag(value: string | null): string | null {
  if (!value) return null

  const hash = value.replace(/^W\//, '').replace(/"/g, '').trim()

  return /^[0-9a-f]{40}$/.test(hash) ? hash : null
}

/** What the server says about one uploaded scan. */
export interface ScanResult {
  client_scan_id: string
  status: 'accepted' | 'duplicate' | 'rejected'
  reason?: 'unknown_tag' | 'gate_type_required' | 'server_error'
  scan_log_id?: string
  /**
   * Present only on a single-scan upload — the tap someone is standing in front
   * of. It is how a card the device could not resolve locally (issued after its
   * last roster sync) still draws a name rather than "not recognised".
   */
  student?: {
    id: string
    first_name: string
    middle_name: string | null
    last_name: string | null
    ext_name: string | null
    grade_level: string | null
    section: string | null
  }
}

/**
 * Hand queued scans to the server.
 *
 * Throws on anything short of a complete, parsed reply — a caller that cannot
 * read the answer must keep every row it sent. `pendingCount` is what the device
 * will still be holding afterwards, so the portal is not stale between beats.
 */
export async function uploadScans(
  scans: QueuedScan[],
  pendingCount: number,
): Promise<ScanResult[]> {
  const response = await gateFetch('/gate/scans', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scans, pending_count: pendingCount }),
  })

  const body = (await response.json()) as { results?: ScanResult[]; server_time?: string }

  recordServerTime(body.server_time ?? null)

  if (!Array.isArray(body.results)) {
    throw new Error('The server did not say what happened to the uploaded scans.')
  }

  return body.results
}

export async function sendHeartbeat(payload: {
  roster_count?: number
  pending_count?: number
  clock_offset_ms?: number
  last_sync_at?: string | null
}): Promise<void> {
  const response = await gateFetch('/gate/heartbeat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, app_version: appVersion() }),
  })

  const body = await response.json().catch(() => null)
  recordServerTime(body?.server_time ?? null)
}

function appVersion(): string {
  return (import.meta.env.VITE_APP_VERSION as string) || 'kiosk-offline-v1'
}
