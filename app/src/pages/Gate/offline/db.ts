/**
 * The kiosk's local copy: students, their photos, and a little bookkeeping.
 *
 * IndexedDB rather than localStorage because this holds Blobs and thousands of
 * rows, and hand-rolled rather than a wrapper library because the whole surface
 * is the dozen functions below — a dependency here would be larger than the
 * thing it replaced.
 *
 * Everything a gate needs to answer a tap lives here, so a tap costs one index
 * lookup and no network at all.
 */

const DB_NAME = 'scholastic-gate'

/**
 * 2 adds the outbox; 3 adds the case-folded card index. Bumped rather than
 * recreated on purpose: an upgrade must leave a fielded kiosk's roster and faces
 * exactly where they are — that cache took a long time to fill over the link
 * this whole feature exists to avoid.
 */
const DB_VERSION = 3

export const STORE_STUDENTS = 'students'
export const STORE_PHOTOS = 'photos'
export const STORE_META = 'meta'
export const STORE_OUTBOX = 'outbox'

/**
 * A scan this device took and the server has not acknowledged yet.
 *
 * These rows are the only copy of an attendance record that exists anywhere, so
 * everything about them is conservative: they are written before the card is
 * even drawn, they are deleted **only** when the server answers about that exact
 * `client_scan_id`, and the id is what makes a retry safe — a device that cannot
 * tell "recorded" from "reply lost on the way back" has to send again.
 */
export interface QueuedScan {
  /** Idempotency key. Generated here; the server dedupes on it per institution. */
  client_scan_id: string
  rfid_uid: string
  /** ISO, from the corrected clock — see `clock.ts`. */
  scanned_at: string
  /** True when the device had never heard a real clock at the time of the tap. */
  clock_suspect: boolean
  type: 'enter' | 'exit'
  /** Device time, for ordering only. */
  queued_at: number
}

/**
 * How a card UID is compared.
 *
 * `student_rfid_tags.rfid_uid` is `utf8mb4_unicode_ci`, so **MySQL matches
 * case-insensitively and ignores trailing spaces** — the server's
 * `where('rfid_uid', $value)` does no folding of its own, but its collation
 * does. An IndexedDB index, by contrast, matches bytes. Left alone, a reader
 * emitting a different case from the enrolled value resolves online and fails on
 * the local roster: the gate shows a name from the server reply and a blank face
 * from the empty local hit, and offline it rejects the card outright. That is
 * exactly backwards — the local copy has to be at least as permissive as the
 * server, or the network is still load-bearing.
 *
 * Deliberately narrower than the collation in one respect: `_ci` also equates
 * accented characters with their base letters, and this does not. Card UIDs are
 * hex in practice, and the error direction matters — matching *less* than the
 * server costs a fallback to the server, while matching *more* would resolve a
 * card locally that ingest then rejects, which is the failure this whole feature
 * exists to remove.
 */
export function normalizeUid(uid: string): string {
  // Trailing spaces only. MySQL's PAD SPACE ignores those; it does *not* ignore
  // leading ones, so trimming the front here would out-match the server.
  return uid.toLowerCase().replace(/ +$/, '')
}

/** One roster row, exactly as `/api/gate/roster` sends it, plus a sync mark. */
export interface CachedStudent {
  id: string
  first_name: string
  middle_name: string | null
  last_name: string | null
  ext_name: string | null
  grade_level: string | null
  section: string | null
  rfid_uids: string[]
  /**
   * `rfid_uids` under `normalizeUid`, and the field the lookup index is built
   * on. Derived — `putStudents` is the only writer, so no caller can forget it.
   */
  uid_keys?: string[]
  photo_hash: string | null
  /**
   * Which full sync last wrote this row. A full snapshot is the only thing that
   * can reconcile a hard-deleted student — the server cannot report a row that
   * no longer exists — so rows left carrying an older mark are pruned.
   */
  mark?: string
}

let connection: Promise<IDBDatabase> | null = null

export function openDb(): Promise<IDBDatabase> {
  if (connection) return connection

  connection = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result

      if (!db.objectStoreNames.contains(STORE_STUDENTS)) {
        const students = db.createObjectStore(STORE_STUDENTS, { keyPath: 'id' })
        // multiEntry: one student can hold several cards, and every one of them
        // has to resolve to the same row.
        students.createIndex('by_uid', 'rfid_uids', { multiEntry: true })
        students.createIndex('by_uid_key', 'uid_keys', { multiEntry: true })
      } else {
        const students = request.transaction!.objectStore(STORE_STUDENTS)

        if (!students.indexNames.contains('by_uid_key')) {
          students.createIndex('by_uid_key', 'uid_keys', { multiEntry: true })

          // Backfill inside the upgrade, because a new index over a field no
          // existing row carries is an *empty* index: a kiosk that upgraded and
          // waited for the next sync to populate it would resolve nothing at all
          // in the meantime. Rewriting the rows we already hold keeps the cache
          // — the point of versioning rather than recreating — and costs one
          // pass over a few thousand small records.
          const cursorRequest = students.openCursor()
          cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result
            if (!cursor) return

            const row = cursor.value as CachedStudent
            cursor.update({ ...row, uid_keys: (row.rfid_uids ?? []).map(normalizeUid) })
            cursor.continue()
          }
        }
      }

      if (!db.objectStoreNames.contains(STORE_PHOTOS)) {
        db.createObjectStore(STORE_PHOTOS, { keyPath: 'hash' })
      }

      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'key' })
      }

      if (!db.objectStoreNames.contains(STORE_OUTBOX)) {
        const outbox = db.createObjectStore(STORE_OUTBOX, { keyPath: 'client_scan_id' })
        // Oldest first: a backlog is uploaded in the order the students walked
        // through the gate, so a partial upload leaves a coherent morning
        // rather than a scatter.
        outbox.createIndex('by_queued', 'queued_at')
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => {
      connection = null
      reject(request.error)
    }
  })

  return connection
}

/**
 * Ask the browser not to evict this origin's storage.
 *
 * Without it Chromium may clear ~90 MB of cached faces under SD-card pressure,
 * silently undoing the entire feature on a device that looks healthy. Best
 * effort — a refusal is not an error, it just means the cache is evictable.
 */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

// ── Meta ────────────────────────────────────────────────────────────────────

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const db = await openDb()
  const row = await promisify(db.transaction(STORE_META, 'readonly').objectStore(STORE_META).get(key))
  return row === undefined ? fallback : (row.value as T)
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(STORE_META, 'readwrite')
  tx.objectStore(STORE_META).put({ key, value })
  await done(tx)
}

// ── Students ────────────────────────────────────────────────────────────────

export async function putStudents(rows: CachedStudent[]): Promise<void> {
  if (rows.length === 0) return

  const db = await openDb()
  const tx = db.transaction(STORE_STUDENTS, 'readwrite')
  const store = tx.objectStore(STORE_STUDENTS)
  // Derived here rather than by the callers: the roster sync and the USB seed
  // both land through this function, and a row written without its keys is a
  // student who silently stops resolving.
  rows.forEach((row) => store.put({ ...row, uid_keys: (row.rfid_uids ?? []).map(normalizeUid) }))
  await done(tx)
}

export async function deleteStudents(ids: string[]): Promise<void> {
  if (ids.length === 0) return

  const db = await openDb()
  const tx = db.transaction(STORE_STUDENTS, 'readwrite')
  const store = tx.objectStore(STORE_STUDENTS)
  ids.forEach((id) => store.delete(id))
  await done(tx)
}

/**
 * Drop every student not written by the given full sync, and return how many
 * went. This is the only thing that clears a hard-deleted student.
 */
export async function pruneStudentsNotMarked(mark: string): Promise<number> {
  const db = await openDb()
  const tx = db.transaction(STORE_STUDENTS, 'readwrite')
  const store = tx.objectStore(STORE_STUDENTS)
  let removed = 0

  await new Promise<void>((resolve, reject) => {
    const cursorRequest = store.openCursor()
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result
      if (!cursor) {
        resolve()
        return
      }
      if ((cursor.value as CachedStudent).mark !== mark) {
        cursor.delete()
        removed++
      }
      cursor.continue()
    }
    cursorRequest.onerror = () => reject(cursorRequest.error)
  })

  await done(tx)
  return removed
}

export async function findStudentByUid(uid: string): Promise<CachedStudent | null> {
  const db = await openDb()
  const store = db.transaction(STORE_STUDENTS, 'readonly').objectStore(STORE_STUDENTS)

  const folded = await promisify(store.index('by_uid_key').get(normalizeUid(uid)))
  if (folded) return folded as CachedStudent

  // The verbatim index is kept as a floor. It cannot match anything the folded
  // one missed unless a row lost its keys, and a gate that stops recognising
  // cards is not the place to find out that an upgrade backfill went wrong.
  const exact = await promisify(store.index('by_uid').get(uid))
  return (exact as CachedStudent | undefined) ?? null
}

export async function findStudentById(id: string): Promise<CachedStudent | null> {
  const db = await openDb()
  const store = db.transaction(STORE_STUDENTS, 'readonly').objectStore(STORE_STUDENTS)
  const row = await promisify(store.get(id))
  return (row as CachedStudent | undefined) ?? null
}

export async function countStudents(): Promise<number> {
  const db = await openDb()
  return promisify(db.transaction(STORE_STUDENTS, 'readonly').objectStore(STORE_STUDENTS).count())
}

/** Students holding a photo hash, so the photo pass knows what to go and get. */
export async function studentsWithPhotos(): Promise<Array<{ id: string; photo_hash: string }>> {
  const db = await openDb()
  const store = db.transaction(STORE_STUDENTS, 'readonly').objectStore(STORE_STUDENTS)
  const rows = (await promisify(store.getAll())) as CachedStudent[]

  return rows
    .filter((row): row is CachedStudent & { photo_hash: string } => !!row.photo_hash)
    .map((row) => ({ id: row.id, photo_hash: row.photo_hash }))
}

// ── Photos ──────────────────────────────────────────────────────────────────

export async function putPhoto(hash: string, blob: Blob): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(STORE_PHOTOS, 'readwrite')
  tx.objectStore(STORE_PHOTOS).put({ hash, blob })
  await done(tx)
}

export async function getPhoto(hash: string): Promise<Blob | null> {
  const db = await openDb()
  const row = await promisify(db.transaction(STORE_PHOTOS, 'readonly').objectStore(STORE_PHOTOS).get(hash))
  return (row?.blob as Blob | undefined) ?? null
}

export async function countPhotos(): Promise<number> {
  const db = await openDb()
  return promisify(db.transaction(STORE_PHOTOS, 'readonly').objectStore(STORE_PHOTOS).count())
}

/**
 * Every hash we already hold, in one read.
 *
 * The photo pass needs to know what is missing before it starts. Asking
 * `hasPhoto` per student is one transaction per row — 3,000 of them on a
 * campus-sized roster, on a Raspberry Pi — for an answer that fits in a Set.
 */
export async function photoHashes(): Promise<Set<string>> {
  const db = await openDb()
  const keys = await promisify(
    db.transaction(STORE_PHOTOS, 'readonly').objectStore(STORE_PHOTOS).getAllKeys(),
  )
  return new Set(keys as string[])
}

/**
 * Drop cached faces no student refers to any more, and return how many went.
 *
 * Without this the photo store only ever grows: a student whose picture is
 * re-uploaded leaves the old blob behind under its old hash, and a student who
 * leaves the school leaves theirs. At ~30 KB each on an SD card that is a slow
 * leak with no upper bound — and the device asked the browser to make this
 * storage *persistent*, so nothing else will reclaim it either.
 *
 * Read and write are separate transactions on purpose: an `await` between two
 * requests on the same IndexedDB transaction is only safe by microtask timing,
 * and nothing here is racing anyway.
 */
export async function prunePhotosNotIn(keep: Set<string>): Promise<number> {
  const db = await openDb()

  const keys = (await promisify(
    db.transaction(STORE_PHOTOS, 'readonly').objectStore(STORE_PHOTOS).getAllKeys(),
  )) as string[]

  const doomed = keys.filter((key) => !keep.has(key))
  if (doomed.length === 0) return 0

  const tx = db.transaction(STORE_PHOTOS, 'readwrite')
  const store = tx.objectStore(STORE_PHOTOS)
  doomed.forEach((key) => store.delete(key))
  await done(tx)

  return doomed.length
}

// -- Outbox ------------------------------------------------------------------

export async function enqueueScan(scan: QueuedScan): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(STORE_OUTBOX, 'readwrite')
  tx.objectStore(STORE_OUTBOX).put(scan)
  await done(tx)
}

/** The oldest queued scans, up to `limit`. */
export async function outboxBatch(limit: number): Promise<QueuedScan[]> {
  const db = await openDb()
  const index = db.transaction(STORE_OUTBOX, 'readonly').objectStore(STORE_OUTBOX).index('by_queued')

  return (await promisify(index.getAll(undefined, limit))) as QueuedScan[]
}

/**
 * Forget scans the server has answered about.
 *
 * The only place a queued scan is ever removed, and it takes explicit ids for
 * that reason: anything vaguer — clearing the batch that was sent, trusting a
 * count — loses a scan the moment a reply is partial.
 */
export async function deleteOutbox(ids: string[]): Promise<void> {
  if (ids.length === 0) return

  const db = await openDb()
  const tx = db.transaction(STORE_OUTBOX, 'readwrite')
  const store = tx.objectStore(STORE_OUTBOX)
  ids.forEach((id) => store.delete(id))
  await done(tx)
}

export async function countOutbox(): Promise<number> {
  const db = await openDb()
  return promisify(db.transaction(STORE_OUTBOX, 'readonly').objectStore(STORE_OUTBOX).count())
}

/** When the oldest queued scan was taken, or null when nothing is waiting. */
export async function oldestQueuedAt(): Promise<number | null> {
  const [oldest] = await outboxBatch(1)

  return oldest ? oldest.queued_at : null
}

/**
 * Throw the whole local copy away. Called when the device is unpaired or its
 * token is revoked — a kiosk that is no longer trusted must not keep a school's
 * roster and faces on its disk.
 */
export async function clearAll(): Promise<void> {
  const db = await openDb()
  const tx = db.transaction([STORE_STUDENTS, STORE_PHOTOS, STORE_META, STORE_OUTBOX], 'readwrite')
  tx.objectStore(STORE_STUDENTS).clear()
  tx.objectStore(STORE_PHOTOS).clear()
  tx.objectStore(STORE_META).clear()
  // Queued scans go too, and it is worth being clear-eyed about it: a revoked
  // device cannot upload them — its token is refused — so keeping them would
  // only leave a school's attendance data on a kiosk nobody trusts.
  tx.objectStore(STORE_OUTBOX).clear()
  await done(tx)
}
