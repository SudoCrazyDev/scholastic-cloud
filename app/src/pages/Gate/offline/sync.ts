import {
  countPhotos,
  countStudents,
  deleteStudents,
  getMeta,
  photoHashes,
  prunePhotosNotIn,
  pruneStudentsNotMarked,
  putPhoto,
  putStudents,
  setMeta,
  studentsWithPhotos,
  type CachedStudent,
} from './db'
import { fetchPhoto, fetchRosterPage, GateUnauthorizedError } from './client'

/**
 * Keeping the local copy current, in two passes that are deliberately separate.
 *
 * For a 3,000-student campus the roster JSON is ~200 KB and the photos are
 * ~90 MB. On the links this feature exists for, those are not the same problem,
 * so they are not the same pass:
 *
 *  1. **Roster** — names, sections and card UIDs. Lands first, and once it has,
 *     the kiosk is *fully functional*: every tap resolves, every log is correct.
 *     Only the faces are missing.
 *  2. **Photos** — trickled in behind it, a few at a time, resumable. A device
 *     that never finishes this pass still runs a correct gate all day.
 *
 * Getting that order wrong is the difference between a kiosk that works in ten
 * seconds and one that is useless until a 90 MB download finishes.
 */

const SINCE_KEY = 'roster_synced_at'
const RESUME_KEY = 'roster_resume'
const PAGE_LIMIT = 500

/** How many photos are in flight at once. */
const PHOTO_CONCURRENCY = 3

/**
 * How often the photo pass may report progress.
 *
 * It used to report after every single photo, and each report counted the
 * stores and read the whole roster back out to see how many faces were wanted.
 * On a 3,000-student campus that is 3,000 full reads of the roster during the
 * one pass that is already the slowest thing the kiosk does — on the main
 * thread, on a Pi, competing with the taps this feature exists to keep fast.
 */
const PROGRESS_INTERVAL_MS = 750

interface ResumeState {
  /** The `since` this sync started from — null for a full snapshot. */
  since: string | null
  /** Where paging got to. */
  cursor: string | null
  /** The `synced_at` from the *first* page, stored only once the sync finishes. */
  syncedAt: string
  /** Set for a full sync; rows not carrying it are pruned at the end. */
  mark: string | null
}

export interface SyncProgress {
  phase: 'roster' | 'photos' | 'idle'
  students: number
  photos: number
  photosWanted: number
}

/**
 * Pull roster changes until there are none left.
 *
 * Resumable at page granularity: the cursor is written after every page, so a
 * kiosk that loses power or its link partway through a 3,000-student first sync
 * picks up where it stopped instead of starting again.
 *
 * Returns whether this run was a *full* snapshot, which is the only kind that
 * reconciles a deletion — the caller schedules the next one off that.
 */
export async function syncRoster(
  onProgress?: (progress: SyncProgress) => void,
): Promise<{ full: boolean }> {
  const resumed = await getMeta<ResumeState | null>(RESUME_KEY, null)

  let state: ResumeState

  if (resumed) {
    state = resumed
  } else {
    const since = await getMeta<string | null>(SINCE_KEY, null)
    // The first page carries the `synced_at` for the whole run. Taking it from
    // the first page rather than the last means anything that changes while we
    // are paging is simply picked up next time, instead of being skipped.
    const first = await fetchRosterPage({ since, limit: PAGE_LIMIT })

    state = {
      since,
      cursor: null,
      syncedAt: first.synced_at,
      mark: first.full ? `${first.synced_at}#${Math.random().toString(36).slice(2)}` : null,
    }

    await applyPage(first, state.mark)
    state.cursor = first.has_more ? first.next_cursor : null

    if (!first.has_more) {
      await finish(state, onProgress)
      return { full: state.mark !== null }
    }

    await setMeta(RESUME_KEY, state)
    await report(onProgress, 'roster')
  }

  while (state.cursor) {
    const page = await fetchRosterPage({ since: state.since, cursor: state.cursor, limit: PAGE_LIMIT })

    await applyPage(page, state.mark)

    state.cursor = page.has_more ? page.next_cursor : null
    await setMeta(RESUME_KEY, state)
    await report(onProgress, 'roster')
  }

  await finish(state, onProgress)

  return { full: state.mark !== null }
}

/**
 * Whether a roster pass is part-finished and waiting to be resumed. Asking for
 * a full snapshot throws the cursor away, so the caller has to know not to do
 * that to a pass already in flight.
 */
export async function resumePending(): Promise<boolean> {
  return (await getMeta<ResumeState | null>(RESUME_KEY, null)) !== null
}

async function applyPage(
  page: { students: RosterRow[]; removed_ids: string[] },
  mark: string | null,
): Promise<void> {
  // A delta must leave the mark alone rather than write `undefined` over it:
  // the mark records which full snapshot last saw the row, and a delta has not
  // seen the whole roster, so it is in no position to answer that.
  const rows: CachedStudent[] = mark === null
    ? page.students.map((student) => ({ ...student }))
    : page.students.map((student) => ({ ...student, mark }))

  await putStudents(rows)
  await deleteStudents(page.removed_ids)
}

type RosterRow = Omit<CachedStudent, 'mark'>

async function finish(state: ResumeState, onProgress?: (progress: SyncProgress) => void): Promise<void> {
  // A full snapshot is the only pass that can notice a student who was deleted
  // outright — the server has no row left to report them with. Anything not
  // rewritten by this run is therefore gone.
  if (state.mark) {
    await pruneStudentsNotMarked(state.mark)
    // Faces belonging to nobody go with them; see `prunePhotosNotIn`.
    await prunePhotos()
  }

  await setMeta(SINCE_KEY, state.syncedAt)
  await setMeta(RESUME_KEY, null)
  await report(onProgress, 'idle')
}

export async function lastSyncedAt(): Promise<string | null> {
  return getMeta<string | null>(SINCE_KEY, null)
}

/** Forget cached faces no roster row refers to any more. */
export async function prunePhotos(): Promise<number> {
  const wanted = new Set((await studentsWithPhotos()).map((row) => row.photo_hash))

  return prunePhotosNotIn(wanted)
}

/**
 * Force the next sync to be a full snapshot. Used on a schedule, because it is
 * what reconciles hard-deleted students.
 */
export async function requestFullResync(): Promise<void> {
  await setMeta(SINCE_KEY, null)
  await setMeta(RESUME_KEY, null)
}

/**
 * Fetch the photos the roster says we should have and do not.
 *
 * Runs behind the roster, never blocks a tap, and gives up on any individual
 * photo rather than stalling the queue — one student with a broken upload must
 * not cost the campus its faces.
 */
export async function syncPhotos(onProgress?: (progress: SyncProgress) => void): Promise<void> {
  const wanted = await studentsWithPhotos()
  const held = await photoHashes()

  const missing = wanted.filter((row) => !held.has(row.photo_hash))

  const students = await countStudents()
  let stored = wanted.length - missing.length

  const emit = (phase: SyncProgress['phase']): void => {
    onProgress?.({ phase, students, photos: stored, photosWanted: wanted.length })
  }

  if (missing.length === 0) {
    emit('idle')
    return
  }

  emit('photos')

  let next = 0
  let lastEmit = Date.now()
  // Set when the browser refuses to store anything more. Every remaining photo
  // would fail the same way, so the pass stops instead of spending the rest of
  // the roster's worth of bandwidth on writes that cannot land.
  let outOfSpace = false

  const worker = async (): Promise<void> => {
    while (next < missing.length && !outOfSpace) {
      const row = missing[next++]

      try {
        const fetched = await fetchPhoto(row.id)

        if (fetched && fetched.blob.size > 0) {
          // The server's own content hash when it reached us; the roster's
          // otherwise. See `hashFromETag` in client.ts.
          await putPhoto(fetched.hash ?? row.photo_hash, fetched.blob)
          stored++
        }
      } catch (error) {
        if (error instanceof GateUnauthorizedError) throw error

        if (isQuotaError(error)) {
          outOfSpace = true
          break
        }
        // A flaky link or a corrupt object: skip it. The next pass retries.
      }

      const now = Date.now()
      if (now - lastEmit >= PROGRESS_INTERVAL_MS) {
        lastEmit = now
        emit('photos')
      }
    }
  }

  await Promise.all(Array.from({ length: PHOTO_CONCURRENCY }, () => worker()))
  emit('idle')
}

/**
 * Out of disk, as opposed to out of luck.
 *
 * Worth telling apart because the two want opposite handling: a failed download
 * should be retried, and a full disk should not be retried 2,000 more times in
 * the same pass.
 */
function isQuotaError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'QuotaExceededError' || error.code === 22)
  )
}

async function report(
  onProgress: ((progress: SyncProgress) => void) | undefined,
  phase: SyncProgress['phase'],
): Promise<void> {
  if (!onProgress) return

  // Counts only — both are index counts and cost nothing. The number of photos
  // *wanted* needs the roster read back, which the photo pass does once for
  // itself; until then, reporting it as the number held keeps the status chip
  // from claiming faces are missing before anything has looked.
  const [students, photos] = await Promise.all([countStudents(), countPhotos()])

  onProgress({ phase, students, photos, photosWanted: photos })
}
