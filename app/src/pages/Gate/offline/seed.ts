import { pruneStudentsNotMarked, putPhoto, putStudents, setMeta, type CachedStudent } from './db'
import { prunePhotos } from './sync'
import type { GateDeviceIdentity } from './client'

/**
 * Loading a campus off a USB stick.
 *
 * At 3,000+ students the first sync is ~90 MB of faces, which is not something
 * the links this feature exists for can deliver in an afternoon. So a
 * technician provisioning a kiosk carries the bundle that `php artisan
 * gate:seed-snapshot` produced, and the network is left to do nothing but
 * deltas afterwards.
 *
 * The reader below is deliberately tiny: the bundles are written by
 * `ZipStreamWriter`, which only ever uses the STORE method, so there is no
 * decompression to do and no zip library to add. It also never loads the
 * archive into memory — entries are `File.slice()` views onto the file on disk,
 * so a 90 MB bundle costs a few kilobytes of parsing.
 */

const EOCD_SIGNATURE = 0x06054b50
const CENTRAL_SIGNATURE = 0x02014b50

interface ZipEntry {
  name: string
  crc: number
  size: number
  /** Offset of the local file header, not of the data. */
  headerOffset: number
  method: number
}

export interface SeedResult {
  students: number
  photos: number
  syncedAt: string
}

export class SeedMismatchError extends Error {}

/**
 * Read a seed bundle into the local stores, replacing whatever was there.
 *
 * Refuses a bundle built for a different device or school. A kiosk that
 * swallowed the wrong campus would resolve taps against strangers and record
 * them against the wrong institution — and it would look like it was working.
 */
export async function importSeed(file: File, device: GateDeviceIdentity): Promise<SeedResult> {
  const entries = await readEntries(file)

  const rosterEntry = entries.find((entry) => entry.name === 'roster.json')
  if (!rosterEntry) {
    throw new Error('That file does not look like a gate seed bundle (no roster.json inside).')
  }

  const rosterBlob = await sliceData(file, rosterEntry, 'application/json')
  const roster = JSON.parse(await rosterBlob.text()) as {
    device?: { id?: string; institution_id?: string; name?: string }
    synced_at: string
    students: Array<Omit<CachedStudent, 'mark'>>
  }

  if (roster.device?.institution_id && roster.device.institution_id !== device.institution_id) {
    throw new SeedMismatchError(
      `This bundle was built for a different school${roster.device.name ? ` ("${roster.device.name}")` : ''}.`,
    )
  }

  if (roster.device?.id && roster.device.id !== device.id) {
    throw new SeedMismatchError(
      `This bundle was built for a different kiosk${roster.device.name ? ` ("${roster.device.name}")` : ''}.`,
    )
  }

  // A seed is a full snapshot, so it replaces rather than merges — same
  // reconciliation the periodic full sync does.
  const mark = `seed#${roster.synced_at}`
  await putStudents(roster.students.map((student) => ({ ...student, mark })))
  await pruneStudentsNotMarked(mark)

  let photos = 0
  for (const entry of entries) {
    if (!entry.name.startsWith('photos/')) continue

    const hash = entry.name.slice('photos/'.length).replace(/\.jpg$/i, '')
    if (!hash) continue

    await putPhoto(hash, await sliceData(file, entry, 'image/jpeg'))
    photos++
  }

  // Whatever the previous roster's faces were, they are not this campus's.
  await prunePhotos()

  // The bundle's own timestamp becomes the first `since`, so a freshly seeded
  // kiosk asks only for what changed after the stick was written.
  await setMeta('roster_synced_at', roster.synced_at)
  await setMeta('roster_resume', null)

  return { students: roster.students.length, photos, syncedAt: roster.synced_at }
}

async function readEntries(file: File): Promise<ZipEntry[]> {
  // The end-of-central-directory record lives in the last 22 bytes, plus up to
  // 64 KB of trailing comment. Read only that tail.
  const tailLength = Math.min(file.size, 22 + 0xffff)
  const tail = new DataView(await file.slice(file.size - tailLength).arrayBuffer())

  let eocd = -1
  for (let offset = tail.byteLength - 22; offset >= 0; offset--) {
    if (tail.getUint32(offset, true) === EOCD_SIGNATURE) {
      eocd = offset
      break
    }
  }

  if (eocd === -1) {
    throw new Error('That file is not a zip archive.')
  }

  const count = tail.getUint16(eocd + 10, true)
  const centralSize = tail.getUint32(eocd + 12, true)
  const centralOffset = tail.getUint32(eocd + 16, true)

  const central = new DataView(
    await file.slice(centralOffset, centralOffset + centralSize).arrayBuffer(),
  )
  const names = new TextDecoder()

  const entries: ZipEntry[] = []
  let cursor = 0

  for (let index = 0; index < count; index++) {
    if (central.getUint32(cursor, true) !== CENTRAL_SIGNATURE) {
      throw new Error('This bundle is damaged — copy it from the stick again.')
    }

    const method = central.getUint16(cursor + 10, true)
    const crc = central.getUint32(cursor + 16, true)
    const size = central.getUint32(cursor + 24, true)
    const nameLength = central.getUint16(cursor + 28, true)
    const extraLength = central.getUint16(cursor + 30, true)
    const commentLength = central.getUint16(cursor + 32, true)
    const headerOffset = central.getUint32(cursor + 42, true)

    const name = names.decode(
      new Uint8Array(central.buffer, central.byteOffset + cursor + 46, nameLength),
    )

    entries.push({ name, crc, size, headerOffset, method })
    cursor += 46 + nameLength + extraLength + commentLength
  }

  return entries
}

/**
 * The stored bytes of one entry, as a Blob view onto the file — no copy, and
 * nothing read until something asks for the contents.
 */
async function sliceData(file: File, entry: ZipEntry, type: string): Promise<Blob> {
  if (entry.method !== 0) {
    throw new Error('This bundle is compressed; the kiosk only reads bundles written by gate:seed-snapshot.')
  }

  // The local header repeats the name and may carry a different extra field, so
  // the data offset has to be read from the header itself rather than assumed.
  const header = new DataView(
    await file.slice(entry.headerOffset, entry.headerOffset + 30).arrayBuffer(),
  )
  const nameLength = header.getUint16(26, true)
  const extraLength = header.getUint16(28, true)
  const start = entry.headerOffset + 30 + nameLength + extraLength

  // Typed rather than left bare: a zip entry carries no MIME type, and while
  // Chromium happens to sniff an untyped blob URL as an image, every face on a
  // USB-provisioned campus would depend on it continuing to.
  return file.slice(start, start + entry.size, type)
}
